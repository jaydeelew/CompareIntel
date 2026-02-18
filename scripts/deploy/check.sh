#!/bin/bash
# System requirements and SSL certificate checks.

check_system_requirements() {
    msg "Checking system requirements..."
    [ "$EUID" -eq 0 ] && warn "Running as root. Consider using a non-root user with sudo."
    command_exists docker || { err "Docker is not installed."; exit 1; }
    ok "Docker is installed"
    command_exists docker-compose || docker compose version >/dev/null 2>&1 || { err "Docker Compose is not installed."; exit 1; }
    ok "Docker Compose is installed"
    command_exists pg_dump && ok "pg_dump installed" || warn "pg_dump not installed. Install: sudo apt-get install postgresql-client"
    command_exists curl && ok "curl installed" || warn "curl not installed. Health checks may fail."
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    [ "$AVAILABLE_SPACE" -lt 2097152 ] 2>/dev/null && warn "Low disk space (2GB+ recommended)" || ok "Disk space OK"
    TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
    [ "$TOTAL_MEM" -lt 1024 ] && warn "Low memory (1GB+ recommended)" || ok "Memory: ${TOTAL_MEM}MB"
    [ ! -d "$PROJECT_DIR" ] && { err "Project directory not found: $PROJECT_DIR"; exit 1; }
    ok "Project directory: $PROJECT_DIR"
    [ ! -f "$ENV_FILE" ] && { err "Environment file not found: $ENV_FILE"; exit 1; }
    ok "Environment file exists"
    ok "System check completed"
}

check_ssl_certificates() {
    msg "Checking SSL certificates..."
    sudo test -d "/etc/letsencrypt/live/compareintel.com" || { err "SSL certificates not found. Run setup-compareintel-ssl.sh first."; exit 1; }
    CERT_EXPIRY=$(sudo openssl x509 -in /etc/letsencrypt/live/compareintel.com/fullchain.pem -noout -enddate 2>/dev/null | cut -d= -f2)
    CERT_EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null)
    CURRENT_EPOCH=$(date +%s)
    DAYS_UNTIL_EXPIRY=$(( (CERT_EXPIRY_EPOCH - CURRENT_EPOCH) / 86400 ))
    if [ "$DAYS_UNTIL_EXPIRY" -lt 14 ]; then
        err "SSL certificate expires in $DAYS_UNTIL_EXPIRY days. Renew immediately."
        err "Run: sudo certbot renew"
        err "If renewal fails (port 80 conflict), run: sudo ./setup-compareintel-ssl.sh renewal"
        exit 1
    fi
    [ "$DAYS_UNTIL_EXPIRY" -lt 90 ] && warn "SSL certificate expires in $DAYS_UNTIL_EXPIRY days"
    ok "SSL certificate valid for $DAYS_UNTIL_EXPIRY days"
}
