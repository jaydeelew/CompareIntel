#!/bin/bash
# Git pull; sets CODE_CHANGED global.

pull_latest_code() {
    msg "Checking for updates..."
    cd "$PROJECT_DIR"
    [ ! -d ".git" ] && { err "Not in a git repository."; exit 1; }
    DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}')
    [ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git show-ref --verify --quiet refs/remotes/origin/main && echo "main" || echo "master")
    git fetch origin
    LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
    REMOTE_COMMIT=$(git rev-parse "origin/$DEFAULT_BRANCH" 2>/dev/null || echo "")
    if [ -z "$LOCAL_COMMIT" ] || [ -z "$REMOTE_COMMIT" ]; then
        warn "Could not determine commits. Proceeding with pull..."
        git pull origin "$DEFAULT_BRANCH" || { err "Pull failed"; exit 1; }
        CODE_CHANGED=true
        ok "Code updated"
        return
    fi
    if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
        CODE_CHANGED=false
        ok "Already up to date (${LOCAL_COMMIT:0:7})"
        return
    fi
    msg "Pulling changes (${REMOTE_COMMIT:0:7})..."
    git pull origin "$DEFAULT_BRANCH" || { err "Pull failed"; exit 1; }
    CODE_CHANGED=true
    ok "Code updated"
}

# True when deploy-production.sh or scripts/deploy/ differ between $1 and HEAD.
# Those files are sourced once at startup, so after `git pull` the running
# process still holds the pre-pull functions (this is how a deploy ran the old
# /api/health probe even though the fix was in the commit being deployed).
deploy_scripts_changed_since() {
    local old="$1"
    [ -n "$old" ] || return 1
    cd "$PROJECT_DIR" || return 1
    ! git diff --quiet "$old" HEAD -- deploy-production.sh scripts/deploy 2>/dev/null
}

# True when HEAD's release image is not what the backend container is running.
# Happens after a failed deploy auto-rolled back: git is already at the new
# commit, so `deploy` sees "no code changes" and would otherwise just re-verify
# the old release and report success without ever deploying the new one.
head_release_not_running() {
    cd "$PROJECT_DIR" || return 1
    local short cid running_id built_id
    short=$(git rev-parse --short HEAD 2>/dev/null) || return 1
    cid=$(service_container_id backend) || true
    [ -n "$cid" ] || return 1
    running_id=$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null) || return 1
    built_id=$(docker image inspect --format '{{.Id}}' "${IMAGE_BACKEND:-compareintel-backend}:${short}" 2>/dev/null || true)
    [ -z "$built_id" ] && return 0
    [ "$built_id" != "$running_id" ]
}
