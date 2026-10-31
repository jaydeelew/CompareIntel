#!/bin/bash
# Pre-deploy backend/.env checks. Never print secret values.

ENV_EXAMPLE="${ENV_EXAMPLE:-$PROJECT_DIR/backend/.env.example}"
LAST_DEPLOYED_ENV_HASH_FILE="${LAST_DEPLOYED_ENV_HASH_FILE:-$PROJECT_DIR/.last_deployed_env_hash}"
# Set by detect_backend_env_change; read by deploy-production.sh.
# shellcheck disable=SC2034
ENV_CHANGED=false

# SHA-256 of a file (hex only). Never prints file contents.
file_sha256() {
    local path="$1"
    if command_exists sha256sum; then
        sha256sum "$path" | awk '{print $1}'
    elif command_exists shasum; then
        shasum -a 256 "$path" | awk '{print $1}'
    else
        err "sha256sum/shasum is required to hash $path"
        return 1
    fi
}

# True if KEY is present and non-empty in a dotenv file. Does not print the value.
env_file_has_nonempty() {
    local file="$1"
    local key="$2"
    [ -f "$file" ] || return 1
    awk -v key="$key" '
        BEGIN { found = 0 }
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*$/ { next }
        {
            line = $0
            sub(/\r$/, "", line)
            sub(/^[[:space:]]*export[[:space:]]+/, "", line)
            if (index(line, key "=") != 1) { next }
            val = substr(line, length(key) + 2)
            if (val ~ /^".*"$/) { val = substr(val, 2, length(val) - 2) }
            else if (val ~ /^'\''.*'\''$/) { val = substr(val, 2, length(val) - 2) }
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
            if (val != "") { found = 1 }
        }
        END { exit found ? 0 : 1 }
    ' "$file"
}

# Key names from .env.example (including commented assignments). Names only.
env_example_keys_matching() {
    local pattern="$1"
    [ -f "$ENV_EXAMPLE" ] || return 0
    awk -v pat="$pattern" '
        /^[[:space:]]*$/ { next }
        {
            line = $0
            sub(/\r$/, "", line)
            sub(/^[[:space:]]*#[[:space:]]*/, "", line)
            sub(/^[[:space:]]*export[[:space:]]+/, "", line)
            if (line ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
                split(line, parts, "=")
                if (parts[1] ~ pat) { print parts[1] }
            }
        }
    ' "$ENV_EXAMPLE" | sort -u
}

# Fail if OPENROUTER_API_KEY is missing/empty. Warn on optional ops keys.
# Production backend raises OpenRouterConfigError and will not boot with an empty key.
check_backend_env() {
    local env_file="${1:-$ENV_FILE}"
    local missing_required=0
    local key

    msg "Checking backend environment keys (values are never printed)..."

    if [ ! -f "$env_file" ]; then
        err "Environment file not found: $env_file"
        return 1
    fi

    if env_file_has_nonempty "$env_file" "OPENROUTER_API_KEY"; then
        ok "OPENROUTER_API_KEY is set"
    else
        err "OPENROUTER_API_KEY is missing or empty. Production backend refuses to boot (OpenRouterConfigError)."
        missing_required=1
    fi

    local warn_keys=()
    if [ -f "$ENV_EXAMPLE" ]; then
        while IFS= read -r key; do
            [ -n "$key" ] && warn_keys+=("$key")
        done < <(env_example_keys_matching "^(METRICS_TOKEN|SPEND_ALERT_EMAIL|OPENROUTER_.*_SPEND_CAP_USD)$")
    fi
    if [ "${#warn_keys[@]}" -eq 0 ]; then
        warn_keys=(
            METRICS_TOKEN
            OPENROUTER_DAILY_SPEND_CAP_USD
            OPENROUTER_MONTHLY_SPEND_CAP_USD
            OPENROUTER_PAID_DAILY_SPEND_CAP_USD
            OPENROUTER_PAID_MONTHLY_SPEND_CAP_USD
            SPEND_ALERT_EMAIL
        )
    fi

    for key in "${warn_keys[@]}"; do
        if env_file_has_nonempty "$env_file" "$key"; then
            ok "$key is set"
        else
            warn "$key is missing or empty (not fatal)"
        fi
    done

    if [ "$missing_required" -ne 0 ]; then
        err "Pre-deploy environment check failed"
        return 1
    fi
    ok "Required environment keys are present"
    return 0
}

backend_env_hash() {
    file_sha256 "${1:-$ENV_FILE}"
}

# Sets ENV_CHANGED. Missing previous hash is treated as unchanged (first record after success).
detect_backend_env_change() {
    local env_file="${1:-$ENV_FILE}"
    local current stored
    ENV_CHANGED=false
    [ -f "$env_file" ] || return 0
    current=$(backend_env_hash "$env_file") || return 1
    if [ -f "$LAST_DEPLOYED_ENV_HASH_FILE" ]; then
        stored=$(tr -d '[:space:]' < "$LAST_DEPLOYED_ENV_HASH_FILE")
        if [ -n "$stored" ] && [ "$current" != "$stored" ]; then
            ENV_CHANGED=true
            msg "backend/.env changed since last deploy (hash differs); backend container will be recreated"
        fi
    fi
}

record_backend_env_hash() {
    local env_file="${1:-$ENV_FILE}"
    local current
    [ -f "$env_file" ] || return 0
    current=$(backend_env_hash "$env_file") || return 1
    echo "$current" > "$LAST_DEPLOYED_ENV_HASH_FILE"
    ok "Recorded backend/.env hash"
}

# Recreate backend so a changed env_file is picked up without a full rebuild.
recreate_backend_if_env_changed() {
    if [ "$ENV_CHANGED" != true ]; then
        return 0
    fi
    msg "Recreating backend container to load updated backend/.env..."
    cd "$PROJECT_DIR" || return 1
    docker compose -f docker-compose.ssl.yml up -d --force-recreate --no-deps backend \
        || { err "Failed to recreate backend after .env change"; return 1; }
    ok "Backend container recreated"
}
