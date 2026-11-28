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

# One Dockerfile at a time, via `docker build`. Do not call `docker compose build`.
# On the production host `docker compose -f docker-compose.ssl.yml build nginx`
# still starts nginx, frontend, and backend together. That is two Vite
# processes (frontend target build, nginx target prod) plus the backend image.
# Two Vite heaps do not fit in 1.9 GB plus swap: Vite aborts with SIGABRT,
# exit 134. `docker build` of one Dockerfile cannot start the other images.
#
# `docker build --target prod` runs the Dockerfile's build stage once. The
# later `--target build` is that same stage and is a cache hit, so it does
# not run Vite again. Nginx first, while nothing else is compiling.
build_images_sequentially() {
    local sha="${IMAGE_TAG}"
    msg "Building nginx image (one Vite process)..."
    if ! DOCKER_BUILDKIT=1 docker build \
        -f frontend/Dockerfile \
        --target prod \
        --build-arg VITE_API_URL=/api \
        --build-arg "VITE_RECAPTCHA_SITE_KEY=${VITE_RECAPTCHA_SITE_KEY:-}" \
        --build-arg "VITE_SENTRY_DSN=${VITE_SENTRY_DSN:-}" \
        --build-arg "VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT:-production}" \
        --build-arg "VITE_SENTRY_RELEASE=${GIT_SHA:-}" \
        --build-context core=./packages/compare-core \
        --build-context registry=./backend/data \
        -t "${IMAGE_NGINX}:${sha}" \
        .; then
        err "Image build failed for nginx. Running containers were not stopped."
        return 1
    fi

    msg "Building backend image..."
    if ! DOCKER_BUILDKIT=1 docker build \
        -f backend/Dockerfile \
        --build-arg ENVIRONMENT=production \
        --build-arg "GIT_SHA=${GIT_SHA:-}" \
        -t "${IMAGE_BACKEND}:${sha}" \
        backend; then
        err "Image build failed for backend. Running containers were not stopped."
        return 1
    fi

    msg "Building frontend image from the cached Vite stage..."
    if ! DOCKER_BUILDKIT=1 docker build \
        -f frontend/Dockerfile \
        --target build \
        --build-arg VITE_API_URL=/api \
        --build-arg "VITE_RECAPTCHA_SITE_KEY=${VITE_RECAPTCHA_SITE_KEY:-}" \
        --build-arg "VITE_SENTRY_DSN=${VITE_SENTRY_DSN:-}" \
        --build-arg "VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT:-production}" \
        --build-arg "VITE_SENTRY_RELEASE=${GIT_SHA:-}" \
        --build-context core=./packages/compare-core \
        --build-context registry=./backend/data \
        -t "${IMAGE_FRONTEND}:${sha}" \
        .; then
        err "Image build failed for frontend. Running containers were not stopped."
        return 1
    fi
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
    msg "Building images one Dockerfile at a time. Current containers stay up until every image succeeds."
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
