#!/bin/bash
# Per-release Docker image tags for backend and nginx.
# Used by scripts/deploy/build.sh and scripts/rollback/rollback.sh.
#
# Tags:
#   :<git-short-sha>  immutable release
#   :current          what is (or was just) deployed
#   :previous         the prior release, for one-command rollback
#
# Compose files read IMAGE_TAG (default: current) in their `image:` fields.

IMAGE_BACKEND="${IMAGE_BACKEND:-compareintel-backend}"
IMAGE_NGINX="${IMAGE_NGINX:-compareintel-nginx}"
IMAGE_KEEP_RELEASES="${IMAGE_KEEP_RELEASES:-3}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ssl.yml}"

# Optional second compose file (e.g. a local override that adds extra_hosts).
compose() {
    if [ -n "${COMPOSE_OVERRIDE:-}" ]; then
        docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" "$@"
    else
        docker compose -f "$COMPOSE_FILE" "$@"
    fi
}

release_image_repos() {
    printf '%s\n' "$IMAGE_BACKEND" "$IMAGE_NGINX"
}

image_exists() {
    docker image inspect "$1" >/dev/null 2>&1
}

# Point :previous at the image currently tagged :current (no-op if none).
promote_current_to_previous() {
    local repo
    for repo in $(release_image_repos); do
        if image_exists "${repo}:current"; then
            docker tag "${repo}:current" "${repo}:previous"
        fi
    done
}

# After compose builds :<sha>, also point :current at that image.
tag_sha_as_current() {
    local sha="$1"
    local repo
    [ -n "$sha" ] || return 0
    for repo in $(release_image_repos); do
        if image_exists "${repo}:${sha}"; then
            docker tag "${repo}:${sha}" "${repo}:current"
        fi
    done
}

# Drop SHA tags older than IMAGE_KEEP_RELEASES. Never untag :current or :previous.
prune_old_release_tags() {
    local repo tag id current_id previous_id count
    for repo in $(release_image_repos); do
        current_id=$(docker images -q "${repo}:current" 2>/dev/null || true)
        previous_id=$(docker images -q "${repo}:previous" 2>/dev/null || true)
        count=0
        while read -r tag; do
            [ -z "$tag" ] && continue
            count=$((count + 1))
            [ "$count" -le "$IMAGE_KEEP_RELEASES" ] && continue
            id=$(docker images -q "${repo}:${tag}" 2>/dev/null || true)
            [ -n "$id" ] && [ "$id" = "$current_id" ] && continue
            [ -n "$id" ] && [ "$id" = "$previous_id" ] && continue
            docker rmi "${repo}:${tag}" >/dev/null 2>&1 || true
        done < <(docker images --format '{{.Tag}}' "$repo" 2>/dev/null | grep -E '^[0-9a-f]{7,12}$' || true)
    done
}

# After a successful image rollback, swap :current and :previous so the
# running release is :current and a second rollback can return to it.
swap_current_and_previous_tags() {
    local repo
    for repo in $(release_image_repos); do
        image_exists "${repo}:previous" || continue
        if image_exists "${repo}:current"; then
            docker tag "${repo}:current" "${repo}:rollback-from"
        fi
        docker tag "${repo}:previous" "${repo}:current"
        if image_exists "${repo}:rollback-from"; then
            docker tag "${repo}:rollback-from" "${repo}:previous"
            docker rmi "${repo}:rollback-from" >/dev/null 2>&1 || true
        fi
    done
}
