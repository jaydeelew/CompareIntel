#!/bin/bash
# Build and deploy Docker services.

build_and_deploy() {
    msg "Building and deploying..."
    cd "$PROJECT_DIR"
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
