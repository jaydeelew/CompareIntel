#!/bin/bash
# CompareIntel production deployment. Handles dependency checks, backup, build, deploy.
# Usage: ./deploy-production.sh {check|backup|build|deploy|quick-deploy|rollback|restart|status|logs}

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR/scripts/deploy"

# shellcheck disable=SC1091
source "$DEPLOY_DIR/utils.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/env.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/nginx.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/check.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/backup.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/pull.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/build.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/verify.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/status.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/rollback.sh"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/notify_new_models.sh"

record_deploy_hashes() {
    record_backend_env_hash
    record_nginx_conf_hash
}

# Full rebuild path: test nginx before taking the stack down; roll back on verify failure.
deploy_with_rebuild() {
    test_nginx_config_before_apply || return 1
    build_and_deploy
    verify_or_rollback || return 1
    record_deploy_hashes
    prune_dangling_docker_artifacts
    notify_new_models_if_added
}

# No git/code rebuild: still recreate backend if .env changed and reload nginx if ssl.conf changed.
apply_runtime_config_changes() {
    detect_backend_env_change
    detect_nginx_conf_change
    recreate_backend_if_env_changed || return 1
    reload_nginx_if_conf_changed || return 1
}

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
            capture_prev_deploy_commit
            backup_database
            deploy_with_rebuild
            show_status
            echo ""
            ok "Build and deploy completed"
            ;;
        deploy)
            check_system_requirements
            check_ssl_certificates
            capture_prev_deploy_commit
            backup_database
            CODE_CHANGED=false
            pull_latest_code
            if [ "$CODE_CHANGED" = false ]; then
                msg "No code changes. Skipping rebuild. Use ./deploy-production.sh build to force."
                apply_runtime_config_changes
                verify_deployment || exit 1
                record_deploy_hashes
                # First run of this notifier: remember HEAD so later deploys can diff.
                [ ! -f "$LAST_DEPLOYED_COMMIT_FILE" ] && record_deployed_commit
                show_status
                ok "Deployment verified (no code rebuild)"
            else
                msg "Code changed. Full deployment..."
                deploy_with_rebuild
                show_status
                ok "Deployment completed"
            fi
            echo ""
            ;;
        quick-deploy)
            warn "Quick deploy: skipping git pull"
            check_system_requirements
            capture_prev_deploy_commit
            backup_database
            deploy_with_rebuild
            show_status
            ok "Quick deployment completed"
            echo ""
            ;;
        rollback)
            rollback_deployment "${2:-previous}" "${3:-}"
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
            check_backend_env || exit 1
            detect_backend_env_change
            detect_nginx_conf_change
            msg "Testing nginx config before restart..."
            test_nginx_config_before_apply || exit 1
            if [ "$ENV_CHANGED" = true ]; then
                recreate_backend_if_env_changed || exit 1
            fi
            msg "Restarting services..."
            docker compose -f docker-compose.ssl.yml restart
            # compose restart reloads processes but still re-test; reload if ssl.conf changed.
            if [ "$NGINX_CONF_CHANGED" = true ]; then
                sleep 3
                reload_nginx || exit 1
            fi
            verify_deployment || exit 1
            record_deploy_hashes
            ok "Services restarted"
            ;;
        *)
            echo "Usage: $0 {check|backup|build|deploy|quick-deploy|rollback|restart|status|logs}"
            echo ""
            echo "Commands: check, backup, build, deploy, quick-deploy,"
            echo "          rollback [previous] [--with-migrations], restart, status, logs"
            exit 1
            ;;
    esac
}

main "$@"
