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
    docker compose -f docker-compose.ssl.yml up -d --build || { err "Deploy failed"; exit 1; }
    ok "Services started"
}
