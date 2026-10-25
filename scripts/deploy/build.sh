#!/bin/bash
# Build and deploy Docker services.

# Save deployment state before building
save_deployment_state() {
    local rollback_state_file="/home/ubuntu/.compareintel-rollback-state"
    msg "Saving deployment state for rollback..."
    cd "$PROJECT_DIR"
    
    local state_data=$(cat <<EOF
TIMESTAMP=$(date +%s)
DATE=$(date '+%Y-%m-%d %H:%M:%S')
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
BACKEND_IMAGE=$(docker compose -f docker-compose.ssl.yml images backend -q 2>/dev/null || echo "unknown")
NGINX_IMAGE=$(docker compose -f docker-compose.ssl.yml images nginx -q 2>/dev/null || echo "unknown")
REDIS_IMAGE=$(docker compose -f docker-compose.ssl.yml images redis -q 2>/dev/null || echo "unknown")
EOF
)
    
    echo "$state_data" > "$rollback_state_file"
    ok "Deployment state saved"
}

build_and_deploy() {
    msg "Building and deploying..."
    cd "$PROJECT_DIR"
    
    # Save state before stopping services
    save_deployment_state
    
    msg "Stopping services..."
    docker compose -f docker-compose.ssl.yml down
    msg "Pruning old images..."
    docker image prune -f
    msg "Building and starting..."
    # Capture git SHA for Sentry release tracking
    export GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    msg "Git SHA: $GIT_SHA"
    docker compose -f docker-compose.ssl.yml up -d --build || { err "Deploy failed"; exit 1; }
    ok "Services started"
}
