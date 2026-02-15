#!/bin/bash
# Sets up Let's Encrypt SSL certificates for compareintel.com. Run once before deploying.
# Usage: sudo ./setup-compareintel-ssl.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="compareintel.com"
WWW_DOMAIN="www.compareintel.com"
EMAIL="${LETSENCRYPT_EMAIL:-}"  # Set via environment variable or prompt

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check if domains resolve to this server
check_dns() {
    log "Checking DNS configuration..."
    
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null)
    DOMAIN_IP=$(dig +short "$DOMAIN" | tail -1)
    WWW_IP=$(dig +short "$WWW_DOMAIN" | tail -1)
    
    log "Server IP: $SERVER_IP"
    log "$DOMAIN resolves to: $DOMAIN_IP"
    log "$WWW_DOMAIN resolves to: $WWW_IP"
    
    if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
        log_warning "$DOMAIN does not resolve to this server's IP"
        log_warning "Expected: $SERVER_IP, Got: $DOMAIN_IP"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_success "$DOMAIN correctly resolves to this server"
    fi
}

# Install certbot if not present
install_certbot() {
    if command -v certbot &> /dev/null; then
        log_success "Certbot is already installed"
        return
    fi
    
    log "Installing Certbot..."
    
    # Detect package manager
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y certbot
    elif command -v yum &> /dev/null; then
        yum install -y certbot
    elif command -v dnf &> /dev/null; then
        dnf install -y certbot
    else
        log_error "Could not detect package manager. Please install certbot manually."
        exit 1
    fi
    
    log_success "Certbot installed successfully"
}

# Stop any running services on ports 80/443
stop_conflicting_services() {
    log "Checking for services on ports 80 and 443..."
    
    # Check if docker containers are using the ports
    if command -v docker &> /dev/null; then
        CONTAINERS_80=$(docker ps --filter "publish=80" -q 2>/dev/null)
        CONTAINERS_443=$(docker ps --filter "publish=443" -q 2>/dev/null)
        
        if [ -n "$CONTAINERS_80" ] || [ -n "$CONTAINERS_443" ]; then
            log_warning "Docker containers are using ports 80/443"
            log "Stopping CompareIntel containers temporarily..."
            
            cd /home/ubuntu/CompareIntel 2>/dev/null || cd ~/CompareIntel 2>/dev/null || true
            docker compose -f docker-compose.ssl.yml down 2>/dev/null || true
            docker compose down 2>/dev/null || true
            
            log_success "Containers stopped"
        fi
    fi
    
    # Check for nginx/apache running directly on host
    if systemctl is-active --quiet nginx 2>/dev/null; then
        log "Stopping nginx..."
        systemctl stop nginx
    fi
    
    if systemctl is-active --quiet apache2 2>/dev/null; then
        log "Stopping apache2..."
        systemctl stop apache2
    fi
}

# Get email for Let's Encrypt notifications
get_email() {
    if [ -z "$EMAIL" ]; then
        log "Let's Encrypt requires an email for certificate expiry notifications."
        read -p "Enter your email address: " EMAIL
        
        if [ -z "$EMAIL" ]; then
            log_error "Email is required for Let's Encrypt"
            exit 1
        fi
    fi
    
    log "Using email: $EMAIL"
}

# Obtain SSL certificates
obtain_certificates() {
    log "Obtaining SSL certificates for $DOMAIN and $WWW_DOMAIN..."
    
    # Use standalone mode (certbot runs its own temporary web server)
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN" \
        -d "$WWW_DOMAIN"
    
    if [ $? -eq 0 ]; then
        log_success "SSL certificates obtained successfully!"
    else
        log_error "Failed to obtain SSL certificates"
        exit 1
    fi
}

# Set up automatic renewal
setup_renewal() {
    log "Setting up automatic certificate renewal..."
    
    # Create a renewal hook to restart nginx container
    RENEWAL_HOOK="/etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh"
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    
    cat > "$RENEWAL_HOOK" << 'EOF'
#!/bin/bash
# Restart nginx container after certificate renewal
cd /home/ubuntu/CompareIntel 2>/dev/null || cd ~/CompareIntel 2>/dev/null
docker compose -f docker-compose.ssl.yml exec -T nginx nginx -s reload 2>/dev/null || true
EOF
    
    chmod +x "$RENEWAL_HOOK"
    
    # Test renewal (dry run)
    log "Testing certificate renewal..."
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        log_success "Automatic renewal is configured and working"
    else
        log_warning "Renewal dry-run had issues, but certificates are installed"
    fi
    
    # Enable certbot timer for auto-renewal
    if systemctl list-unit-files | grep -q certbot.timer; then
        systemctl enable certbot.timer
        systemctl start certbot.timer
        log_success "Certbot timer enabled for automatic renewal"
    fi
}

# Display certificate info
show_certificate_info() {
    log "Certificate information:"
    echo ""
    certbot certificates
    echo ""
    
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
    if [ -f "$CERT_PATH/fullchain.pem" ]; then
        EXPIRY=$(openssl x509 -in "$CERT_PATH/fullchain.pem" -noout -enddate | cut -d= -f2)
        log_success "Certificate expires: $EXPIRY"
    fi
}

# Main function
main() {
    echo ""
    
    check_root
    
    # Check if certificates already exist
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        log_warning "SSL certificates already exist for $DOMAIN"
        show_certificate_info
        
        read -p "Do you want to renew/replace them? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Keeping existing certificates"
            exit 0
        fi
    fi
    
    check_dns
    install_certbot
    get_email
    stop_conflicting_services
    obtain_certificates
    setup_renewal
    show_certificate_info
    
    echo ""
    log_success "=== SSL Certificate Setup Complete! ==="
    echo ""
    log "Next steps:"
    echo "  1. cd ~/CompareIntel"
    echo "  2. docker compose -f docker-compose.ssl.yml up -d --build"
    echo "  3. Visit https://$DOMAIN to verify"
    echo ""
}

# Run main function
main "$@"

