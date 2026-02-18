#!/bin/bash
# Show deployment status.

show_status() {
    cd "$PROJECT_DIR"
    msg "Deployment Status:"
    echo ""
    echo "Services:"
    docker compose -f docker-compose.ssl.yml ps
    echo ""
    echo "SSL auto-renewal:"
    if systemctl is-active certbot.timer 2>/dev/null | grep -q active; then
        ok "certbot.timer active"
        systemctl list-timers certbot.timer 2>/dev/null | head -5
    elif crontab -l 2>/dev/null | grep -q certbot; then
        ok "certbot in crontab"
        crontab -l 2>/dev/null | grep certbot
    else
        warn "No certbot timer or cron. Run: sudo ./setup-compareintel-ssl.sh renewal"
    fi
    echo ""
    echo "Recent logs:"
    docker compose -f docker-compose.ssl.yml logs --tail=20
    echo ""
    echo "Disk:"
    df -h /
    echo ""
    echo "Memory:"
    free -h
}
