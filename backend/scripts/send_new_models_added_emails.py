#!/usr/bin/env python3
"""
Send new-model notification emails to registered users.

Intended to run inside the production backend container after a successful
git pull + build, when one or more models were added to models_registry.json.

Examples:
  echo '[{"id":"openai/gpt-5.4","name":"GPT-5.4","provider":"OpenAI","description":"..."}]' \\
    | python3 /app/scripts/send_new_models_added_emails.py --models-json -

  python3 /app/scripts/send_new_models_added_emails.py --models-json models.json --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

backend_dir = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

env_paths = [
    backend_dir / ".env",
    Path("/app/.env"),
]

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path, override=False)
        break

from app.database import SessionLocal
from app.email_service import EMAIL_CONFIGURED, send_new_models_added_email
from app.services.new_models_notify import get_new_model_notification_recipients, summarize_model


def _load_models(models_json: str) -> list[dict[str, str]]:
    if models_json == "-":
        raw = json.load(sys.stdin)
    else:
        path = Path(models_json)
        if path.is_file():
            with path.open(encoding="utf-8") as handle:
                raw = json.load(handle)
        else:
            raw = json.loads(models_json)

    if not isinstance(raw, list):
        raise ValueError("models JSON must be a list of model objects")

    models: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        models.append(summarize_model(item))
    return models


async def send_new_models_added_emails(
    new_models: list[dict[str, str]], dry_run: bool = False
) -> int:
    if not new_models:
        print("No new models provided - nothing to send.")
        return 0

    if not EMAIL_CONFIGURED and not dry_run:
        print("Email service not configured - skipping new model notification emails")
        return 1

    names = ", ".join(m.get("name") or m["id"] for m in new_models)
    print(f"New models ({len(new_models)}): {names}")

    db = SessionLocal()
    try:
        users = get_new_model_notification_recipients(db)
        if not users:
            print("No registered users to notify.")
            return 0

        print(f"Found {len(users)} registered user(s) to notify.")
        if dry_run:
            for user in users:
                print(f"  [dry-run] would send to {user.email}")
            print("Dry run complete. No emails sent.")
            return 0

        success_count = 0
        error_count = 0
        for user in users:
            try:
                print(f"Sending new-models email to {user.email}...")
                await send_new_models_added_email(user.email, new_models)
                success_count += 1
                print(f"✓ Email sent to {user.email}")
            except Exception as exc:
                error_count += 1
                print(f"✗ Failed to send email to {user.email}: {exc}")

        print("\nSummary:")
        print(f"  Total users: {len(users)}")
        print(f"  Emails sent successfully: {success_count}")
        print(f"  Errors: {error_count}")
        return 1 if error_count and success_count == 0 else 0
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Email registered users about newly added models.")
    parser.add_argument(
        "--models-json",
        required=True,
        help="JSON list of new models, a file path, or '-' to read stdin",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List recipients without sending mail",
    )
    args = parser.parse_args(argv)

    print("=" * 60)
    print("CompareIntel - New Models Added Email")
    print("=" * 60)
    print(f"Started at: {datetime.now(UTC).isoformat()}")
    print()

    try:
        new_models = _load_models(args.models_json)
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        print(f"✗ Failed to load models JSON: {exc}", file=sys.stderr)
        return 1

    try:
        return asyncio.run(send_new_models_added_emails(new_models, dry_run=args.dry_run))
    except Exception as exc:
        print(f"\n✗ Script failed with error: {exc}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
