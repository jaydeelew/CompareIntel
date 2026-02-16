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
