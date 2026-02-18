#!/bin/bash
# Set up Let's Encrypt SSL certificates for compareintel.com. Run once before deploying.
# Usage: sudo ./setup-compareintel-ssl.sh [renewal]
#   (no args)  Full setup: obtain certs and configure auto-renewal
#   renewal    Fix renewal config for existing certs (switch to webroot, no downtime)

set -e

DOMAIN="compareintel.com"
WWW_DOMAIN="www.compareintel.com"
EMAIL="${LETSENCRYPT_EMAIL:-}"
WEBROOT_PATH="/var/www/certbot"

msg() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
ok() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1"; }
err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1"; }

[ "$EUID" -ne 0 ] && { err "Run with sudo"; exit 1; }

check_dns() {
    msg "Checking DNS..."
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null)
    DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1)
    [ "$SERVER_IP" != "$DOMAIN_IP" ] && {
        warn "$DOMAIN does not resolve to this server ($SERVER_IP vs $DOMAIN_IP)"
        read -p "Continue? (y/N) " -n 1 -r; echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
    }
    ok "DNS OK"
}

install_certbot() {
    command -v certbot &>/dev/null && { ok "Certbot installed"; return; }
    msg "Installing certbot..."
    apt-get update 2>/dev/null; apt-get install -y certbot 2>/dev/null || \
    yum install -y certbot 2>/dev/null || dnf install -y certbot 2>/dev/null || \
    { err "Could not install certbot"; exit 1; }
    ok "Certbot installed"
}

stop_services() {
    msg "Stopping conflicting services..."
    [ -d /home/ubuntu/CompareIntel ] && cd /home/ubuntu/CompareIntel || cd ~/CompareIntel 2>/dev/null || true
    docker compose -f docker-compose.ssl.yml down 2>/dev/null || docker compose down 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true
    ok "Services stopped"
}

obtain_certs() {
    [ -z "$EMAIL" ] && { read -p "Email for Let's Encrypt: " EMAIL; [ -z "$EMAIL" ] && { err "Email required"; exit 1; }; }
    msg "Obtaining certificates..."
    certbot certonly --standalone --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN" -d "$WWW_DOMAIN" || \
    { err "Failed to obtain certificates"; exit 1; }
    ok "Certificates obtained"
}

setup_renewal() {
    msg "Setting up renewal..."

    # Create webroot directory for ACME HTTP-01 challenge (avoids port 80 conflict with nginx)
    mkdir -p "$WEBROOT_PATH/.well-known/acme-challenge"
    chmod -R 755 "$WEBROOT_PATH"

    # Deploy hook: reload nginx after successful renewal so it picks up new certs
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    cat > /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh << 'EOF'
#!/bin/bash
cd /home/ubuntu/CompareIntel 2>/dev/null || cd ~/CompareIntel
docker compose -f docker-compose.ssl.yml exec -T nginx nginx -s reload 2>/dev/null || true
EOF
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh

    # Switch renewal from standalone to webroot so certbot can renew while nginx runs
    RENEWAL_CONF="/etc/letsencrypt/renewal/${DOMAIN}.conf"
    if [ -f "$RENEWAL_CONF" ]; then
        if grep -q 'authenticator = standalone' "$RENEWAL_CONF" 2>/dev/null; then
            msg "Switching renewal from standalone to webroot (no downtime)..."
            sed -i 's/^authenticator = standalone$/authenticator = webroot/' "$RENEWAL_CONF"
            grep -q 'webroot_path' "$RENEWAL_CONF" || \
                sed -i "/^authenticator = webroot$/a webroot_path = $WEBROOT_PATH" "$RENEWAL_CONF"
            ok "Renewal config updated for webroot"
        fi
    fi

    # Enable certbot timer for automatic renewal (twice daily)
    if systemctl enable certbot.timer 2>/dev/null; then
        systemctl enable certbot.timer 2>/dev/null && systemctl start certbot.timer 2>/dev/null && \
            ok "certbot.timer enabled for auto-renewal" || warn "Failed to enable certbot.timer"
    else
        warn "certbot.timer not found. Add a cron job: 0 0,12 * * * certbot renew --quiet"
    fi

    msg "Testing renewal (dry-run)..."
    certbot renew --dry-run 2>/dev/null && ok "Renewal dry-run succeeded" || \
        warn "Renewal dry-run had issues. Ensure nginx is running and serving /.well-known/acme-challenge/"
}

main() {
    echo ""
    case "${1:-}" in
        renewal)
            msg "Fixing SSL renewal config for existing certificates..."
            [ ! -d "/etc/letsencrypt/live/$DOMAIN" ] && { err "No certificates found. Run setup without 'renewal' first."; exit 1; }
            install_certbot
            setup_renewal
            ok "Renewal config updated. Run 'certbot renew --dry-run' after starting services to verify."
            echo ""
            exit 0
            ;;
    esac
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        warn "Certificates already exist. certbot certificates:"
        certbot certificates 2>/dev/null
        read -p "Renew/replace? (y/N) " -n 1 -r; echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
    fi
    check_dns
    install_certbot
    stop_services
    obtain_certs
    setup_renewal
    msg "Certificate info:"
    certbot certificates 2>/dev/null
    echo ""
    ok "SSL setup complete. Next: cd ~/CompareIntel && docker compose -f docker-compose.ssl.yml up -d --build"
    echo ""
}

main "$@"
