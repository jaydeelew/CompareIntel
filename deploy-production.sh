#!/bin/bash
# CompareIntel production deployment. Handles dependency checks, backup, build, deploy.
# Usage: ./deploy-production.sh {check|backup|build|deploy|quick-deploy|rollback|restart|status|logs}

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR/scripts/deploy"

source "$DEPLOY_DIR/utils.sh"
source "$DEPLOY_DIR/check.sh"
source "$DEPLOY_DIR/backup.sh"
source "$DEPLOY_DIR/pull.sh"
source "$DEPLOY_DIR/build.sh"
source "$DEPLOY_DIR/verify.sh"
source "$DEPLOY_DIR/status.sh"
source "$DEPLOY_DIR/rollback.sh"

main() {
    echo ""
    case "${1:-deploy}" in
        check)
            check_system_requirements
            check_ssl_certificates
            ok "System check completed"
            ;;
        backup)
            backup_database
            ok "Backup completed"
            ;;
        build)
            msg "Build mode: skipping git pull, forcing rebuild"
            check_system_requirements
            backup_database
            build_and_deploy
            verify_deployment
            show_status
            echo ""
            ok "Build and deploy completed"
            ;;
        deploy)
            check_system_requirements
            check_ssl_certificates
            backup_database
            CODE_CHANGED=false
            pull_latest_code
            if [ "$CODE_CHANGED" = false ]; then
                msg "No code changes. Skipping rebuild. Use ./deploy-production.sh build to force."
                verify_deployment
                show_status
                ok "Deployment verified (no changes)"
            else
                msg "Code changed. Full deployment..."
                build_and_deploy
                verify_deployment
                show_status
                ok "Deployment completed"
            fi
            echo ""
            ;;
        quick-deploy)
            warn "Quick deploy: skipping git pull"
            check_system_requirements
            backup_database
            build_and_deploy
            verify_deployment
            show_status
            ok "Quick deployment completed"
            echo ""
            ;;
        rollback)
            rollback_deployment
            ;;
        status)
            show_status
            ;;
        logs)
            cd "$PROJECT_DIR"
            docker compose -f docker-compose.ssl.yml logs -f --tail=100
            ;;
        restart)
            cd "$PROJECT_DIR"
            msg "Restarting services..."
            docker compose -f docker-compose.ssl.yml restart
            sleep 10
            verify_deployment
            ok "Services restarted"
            ;;
        *)
            echo "Usage: $0 {check|backup|build|deploy|quick-deploy|rollback|restart|status|logs}"
            echo ""
            echo "Commands: check, backup, build, deploy, quick-deploy, rollback, restart, status, logs"
            exit 1
            ;;
    esac
}

main "$@"
