#!/bin/bash
# Show deployment status.

show_status() {
    cd "$PROJECT_DIR"
    msg "Deployment Status:"
    echo ""
    echo "Services:"
    docker compose -f docker-compose.ssl.yml ps
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
