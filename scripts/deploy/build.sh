#!/bin/bash
# Build and deploy Docker services.

# Per-release image tags (:<sha>, :current, :previous). Sourced once.
_DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$_DEPLOY_DIR/image-tags.sh"

# Save deployment state before building
save_deployment_state() {
    local rollback_state_file="${ROLLBACK_STATE_FILE:-/home/ubuntu/.compareintel-rollback-state}"
    msg "Saving deployment state for rollback..."
    cd "$PROJECT_DIR"
    
    local state_data=$(cat <<EOF
TIMESTAMP=$(date +%s)
DATE=$(date '+%Y-%m-%d %H:%M:%S')
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
IMAGE_TAG=${IMAGE_TAG:-current}
BACKEND_IMAGE=$(compose images backend -q 2>/dev/null || echo "unknown")
NGINX_IMAGE=$(compose images nginx -q 2>/dev/null || echo "unknown")
REDIS_IMAGE=$(compose images redis -q 2>/dev/null || echo "unknown")
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

    # Keep the running release as :previous before compose retags :current.
    msg "Promoting :current images to :previous..."
    promote_current_to_previous
    
    msg "Stopping services..."
    compose down
    # Do not `docker image prune -f` here. That used to delete the previous
    # release after compose untagged it. Tagged :previous/:current/:SHA are kept;
    # dangling images are still pruned after a successful deploy.
    # Capture git SHA for Sentry release tracking and image tags
    export GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    export IMAGE_TAG
    IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "current")
    msg "Git SHA: $GIT_SHA"
    msg "IMAGE_TAG: $IMAGE_TAG"
    msg "Building and starting..."
    compose up -d --build || { err "Deploy failed"; exit 1; }
    tag_sha_as_current "$IMAGE_TAG"
    prune_old_release_tags
    ok "Services started"
}
