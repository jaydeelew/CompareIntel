#!/bin/bash
# After a successful production deploy, email registered users if the
# models registry gained one or more models since the previous deploy.

LAST_DEPLOYED_COMMIT_FILE="${LAST_DEPLOYED_COMMIT_FILE:-$PROJECT_DIR/.last_deployed_commit}"
PREV_DEPLOY_COMMIT="${PREV_DEPLOY_COMMIT:-}"

capture_prev_deploy_commit() {
    cd "$PROJECT_DIR"
    if [ -f "$LAST_DEPLOYED_COMMIT_FILE" ]; then
        PREV_DEPLOY_COMMIT=$(tr -d '[:space:]' < "$LAST_DEPLOYED_COMMIT_FILE")
        msg "Previous deploy commit: ${PREV_DEPLOY_COMMIT:0:7}"
    elif [ -d .git ]; then
        PREV_DEPLOY_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
        if [ -n "$PREV_DEPLOY_COMMIT" ]; then
            msg "No deploy marker yet; using current HEAD as baseline (${PREV_DEPLOY_COMMIT:0:7})"
        fi
    else
        PREV_DEPLOY_COMMIT=""
        warn "Not a git repository; cannot detect newly added models"
    fi
}

record_deployed_commit() {
    cd "$PROJECT_DIR"
    [ ! -d .git ] && return 0
    local head
    head=$(git rev-parse HEAD 2>/dev/null || echo "")
    [ -z "$head" ] && return 0
    echo "$head" > "$LAST_DEPLOYED_COMMIT_FILE"
    ok "Recorded deploy commit ${head:0:7}"
}

notify_new_models_if_added() {
    cd "$PROJECT_DIR"
    if [ -z "$PREV_DEPLOY_COMMIT" ]; then
        warn "No previous commit to compare. Skipping new-model emails."
        record_deployed_commit
        return 0
    fi

    local head
    head=$(git rev-parse HEAD 2>/dev/null || echo "")
    if [ -z "$head" ]; then
        warn "Could not resolve HEAD. Skipping new-model emails."
        return 0
    fi

    if [ "$PREV_DEPLOY_COMMIT" = "$head" ]; then
        msg "No new commits since last deploy. Skipping new-model emails."
        record_deployed_commit
        return 0
    fi

    if ! command_exists python3; then
        warn "python3 not found on host. Skipping new-model emails."
        record_deployed_commit
        return 0
    fi

    msg "Checking for newly added models since ${PREV_DEPLOY_COMMIT:0:7}..."
    local new_models
    if ! new_models=$(
        PYTHONPATH="$PROJECT_DIR/backend" python3 -m app.services.new_models_notify \
            --from-commit "$PREV_DEPLOY_COMMIT" \
            --repo "$PROJECT_DIR"
    ); then
        warn "Failed to diff models registry. Skipping new-model emails."
        record_deployed_commit
        return 0
    fi

    if [ -z "$new_models" ] || [ "$new_models" = "[]" ]; then
        msg "No new models added. Skipping emails."
        record_deployed_commit
        return 0
    fi

    local model_count
    model_count=$(
        printf '%s\n' "$new_models" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" \
            2>/dev/null || echo "?"
    )
    msg "Detected $model_count new model(s). Emailing registered users..."

    if printf '%s\n' "$new_models" | docker compose -f docker-compose.ssl.yml exec -T backend \
        python3 /app/scripts/send_new_models_added_emails.py --models-json -; then
        ok "New-model notification emails sent"
    else
        warn "New-model notification emails failed (deploy still succeeded)"
    fi
    record_deployed_commit
}
