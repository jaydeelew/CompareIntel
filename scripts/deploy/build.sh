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

# One image at a time. `docker compose up --build` builds every service in
# parallel, and on the SSL stack both `frontend` (target build) and `nginx`
# (target prod) run `npm run build`. Two Vite processes plus the backend
# image abort on a 2 GB host (exit 134). Backend first, then the frontend
# Dockerfile's build stage, then nginx, which reuses that cached stage.
build_images_sequentially() {
    local service
    for service in backend frontend nginx; do
        msg "Building ${service} image..."
        if ! compose build "$service"; then
            err "Image build failed for ${service}. Running containers were not stopped."
            return 1
        fi
    done
}

build_and_deploy() {
    msg "Building and deploying..."
    cd "$PROJECT_DIR"

    # Record the release that is still serving. Do not stop it yet.
    save_deployment_state

    # Do not `docker image prune -f` here. That used to delete the previous
    # release after compose untagged it. Tagged :previous/:current/:SHA are kept;
    # dangling images are still pruned after a successful deploy.
    # Capture git SHA for Sentry release tracking and image tags.
    # Tag the new build as :<sha>, not :current, so a failed build cannot
    # move the tag the running containers were started from.
    export GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    export IMAGE_TAG
    IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "current")
    msg "Git SHA: $GIT_SHA"
    msg "IMAGE_TAG: $IMAGE_TAG"
    msg "Building images one at a time. Current containers stay up until every image succeeds."
    if ! build_images_sequentially; then
        exit 1
    fi

    # Images exist. Point :previous at the release that is still running,
    # then recreate containers onto the new tags. No `compose down` first:
    # a failed build never reaches this line, so the site stays up.
    msg "Images built. Promoting :current to :previous and swapping containers..."
    promote_current_to_previous
    if ! compose up -d --no-build; then
        err "Starting the new images failed. Rolling back to :previous."
        rollback_to_previous_images || err "Automatic rollback failed. The site may be down."
        exit 1
    fi
    tag_sha_as_current "$IMAGE_TAG"
    prune_old_release_tags
    ok "Services started"
}
