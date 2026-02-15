"""
Email service for sending verification and notification emails.
"""

import os
from datetime import datetime
from pathlib import Path
from string import Template
from typing import Any

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from pydantic import EmailStr

MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@compareintel.com")
MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.zeptomail.com")

EMAIL_CONFIGURED = bool(MAIL_USERNAME and MAIL_PASSWORD and MAIL_FROM and "@" in MAIL_FROM)

if EMAIL_CONFIGURED:
    conf = ConnectionConfig(
        MAIL_USERNAME=MAIL_USERNAME,
        MAIL_PASSWORD=MAIL_PASSWORD,
        MAIL_FROM=MAIL_FROM,
        MAIL_PORT=int(os.getenv("MAIL_PORT") or "587"),
        MAIL_SERVER=MAIL_SERVER,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )
    fm = FastMail(conf)
else:
    conf = None
    fm = None

_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


def _load_template(name: str) -> Template:
    path = _TEMPLATES_DIR / name
    return Template(path.read_text())


async def send_verification_email(email: EmailStr, code: str) -> None:
    if not EMAIL_CONFIGURED:
        print(f"Email service not configured - skipping verification email for {email}")
        print(f"Verification code: {code}")
        return

    html = _load_template("verification_email.html").substitute(code=code)

    message = MessageSchema(
        subject="Your CompareIntel Verification Code", recipients=[email], body=html, subtype="html"
    )
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send verification email to {email}: {str(e)}")
        raise


async def send_password_reset_email(email: EmailStr, token: str) -> None:
    if not EMAIL_CONFIGURED:
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        reset_url = f"{frontend_url}/reset-password?token={token}"
        print(f"Email service not configured - skipping password reset email for {email}")
        print(f"Reset token: {token}")
        print(f"Reset URL: {reset_url}")
        return

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    reset_url = f"{frontend_url}/reset-password?token={token}"

    html = _load_template("password_reset_email.html").substitute(reset_url=reset_url)

    message = MessageSchema(
        subject="Reset Your CompareIntel Password", recipients=[email], body=html, subtype="html"
    )
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send password reset email to {email}: {str(e)}")
        raise


async def send_subscription_confirmation_email(
    email: EmailStr, tier: str, period: str, amount: float
) -> None:
    from .config import get_conversation_limit, get_daily_limit, get_model_limit

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    dashboard_url = f"{frontend_url}/dashboard"

    tier_display = tier.replace("_", " ").title()
    period_display = "Monthly" if period == "monthly" else "Yearly"
    amount_formatted = f"${amount:.2f}"

    benefits = {
        "starter": [
            f"{get_daily_limit('starter')} model responses per day",
            f"{get_model_limit('starter')} models max per comparison",
            "Email support (48-hour response)",
            "Usage analytics",
            f"{get_conversation_limit('starter')} conversations saved",
        ],
        "starter_plus": [
            f"{get_daily_limit('starter_plus')} model responses per day",
            f"{get_model_limit('starter_plus')} models max per comparison",
            "Email support (48-hour response)",
            "Usage analytics",
            f"{get_conversation_limit('starter_plus')} conversations saved",
        ],
        "pro": [
            f"{get_daily_limit('pro')} model responses per day",
            f"{get_model_limit('pro')} models max per comparison",
            "Priority email support (24-hour response)",
            "Usage analytics",
            "Export conversations",
            f"{get_conversation_limit('pro')} conversations saved",
        ],
        "pro_plus": [
            f"{get_daily_limit('pro_plus')} model responses per day",
            f"{get_model_limit('pro_plus')} models max per comparison",
            "Priority email support (24-hour response)",
            "Usage analytics",
            "Export conversations",
            f"{get_conversation_limit('pro_plus')} conversations saved",
        ],
    }

    benefits_html = "".join([f"<li>{benefit}</li>" for benefit in benefits.get(tier, [])])

    html = _load_template("subscription_confirmation.html").substitute(
        tier_display=tier_display,
        period_display=period_display,
        amount_formatted=amount_formatted,
        benefits_html=benefits_html,
        dashboard_url=dashboard_url,
    )

    message = MessageSchema(
        subject=f"Subscription Confirmed - CompareIntel {tier_display}",
        recipients=[email],
        body=html,
        subtype="html",
    )
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send subscription confirmation email to {email}: {str(e)}")


async def send_usage_limit_warning_email(
    email: EmailStr, usage_count: int, daily_limit: int, tier: str
) -> None:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    upgrade_url = f"{frontend_url}/subscription"

    percentage_used = (usage_count / daily_limit) * 100
    percentage_used_int = int(percentage_used)

    html = _load_template("usage_limit_warning.html").substitute(
        usage_count=usage_count,
        daily_limit=daily_limit,
        percentage_used=percentage_used,
        percentage_used_int=percentage_used_int,
        upgrade_url=upgrade_url,
    )

    message = MessageSchema(
        subject="CompareIntel Usage Warning", recipients=[email], body=html, subtype="html"
    )
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send usage warning email to {email}: {str(e)}")


async def send_model_availability_report(check_results: dict[str, Any]) -> None:
    recipient_email = "support@compareintel.com"

    if not EMAIL_CONFIGURED:
        return

    total_models = check_results.get("total_models", 0)
    available_models = check_results.get("available_models", [])
    unavailable_models = check_results.get("unavailable_models", [])
    check_timestamp = check_results.get("check_timestamp", "")
    error = check_results.get("error")

    if error:
        status = "error"
        status_color = "#dc2626"
        status_text = "Error"
        subject = "⚠️ Model Availability Check - Error"
    elif unavailable_models:
        status = "warning"
        status_color = "#f59e0b"
        status_text = "Issues Found"
        subject = f"⚠️ Model Availability Check - {len(unavailable_models)} Model(s) Unavailable"
    else:
        status = "success"
        status_color = "#10b981"
        status_text = "All Models Available"
        subject = f"✓ Model Availability Check - All {total_models} Models Available"

    try:
        dt = datetime.fromisoformat(check_timestamp.replace("Z", "+00:00"))
        formatted_timestamp = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        formatted_timestamp = check_timestamp

    unavailable_html = ""
    if unavailable_models:
        unavailable_html = "<h3 style='color: #dc2626; margin-top: 20px;'>Unavailable Models</h3><ul style='list-style: none; padding: 0;'>"
        for model in unavailable_models:
            model_id = model.get("id", "Unknown")
            model_name = model.get("name", model_id)
            provider = model.get("provider", "Unknown")
            reason = model.get("reason", "Unknown reason")
            unavailable_html += f"""
            <li style='background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 8px 0; border-radius: 4px;'>
                <strong>{model_name}</strong> ({model_id})<br>
                <span style='color: #666; font-size: 14px;'>Provider: {provider}</span><br>
                <span style='color: #dc2626; font-size: 14px;'>Reason: {reason}</span>
            </li>
            """
        unavailable_html += "</ul>"

    available_summary = ""
    if unavailable_models:
        available_summary = (
            f"<p><strong>Available Models:</strong> {len(available_models)}/{total_models}</p>"
        )

    error_html = ""
    if error:
        error_html = f"""
        <div style='background: #fee2e2; border: 2px solid #dc2626; padding: 15px; border-radius: 6px; margin: 20px 0;'>
            <strong style='color: #dc2626;'>Error:</strong> {error}
        </div>
        """

    html = _load_template("model_availability_report.html").substitute(
        status_color=status_color,
        status_text=status_text,
        formatted_timestamp=formatted_timestamp,
        error_html=error_html,
        total_models=total_models,
        available_count=len(available_models),
        unavailable_count=len(unavailable_models),
        available_summary=available_summary,
        unavailable_html=unavailable_html,
    )

    message = MessageSchema(
        subject=subject, recipients=[recipient_email], body=html, subtype="html"
    )
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send model availability report email: {str(e)}")
        raise


async def send_new_user_signup_notification(
    recipient_email: str, user_email: str, user_id: int, created_at: datetime
) -> None:
    if not EMAIL_CONFIGURED:
        print(
            f"Email service not configured - skipping new user signup notification for {user_email}"
        )
        return

    if not recipient_email or "@" not in recipient_email:
        print(
            f"NEW_USER_NOTIFICATION_EMAIL not configured - skipping signup notification for {user_email}"
        )
        return

    formatted_time = created_at.strftime("%Y-%m-%d %H:%M:%S UTC")

    html = _load_template("new_user_signup.html").substitute(
        user_email=user_email,
        user_id=user_id,
        formatted_time=formatted_time,
    )

    message = MessageSchema(
        subject=f"[CompareIntel] New signup: {user_email}",
        recipients=[recipient_email],
        body=html,
        subtype="html",
    )
    try:
        await fm.send_message(message)
    except Exception as e:
        print(
            f"Failed to send new user signup notification to {recipient_email}: {str(e)}"
        )


async def send_trial_expired_email(email: EmailStr) -> None:
    if not EMAIL_CONFIGURED:
        print(f"Email service not configured - skipping trial expired email for {email}")
        return

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    dashboard_url = f"{frontend_url}/dashboard"

    html = _load_template("trial_expired.html").substitute(dashboard_url=dashboard_url)

    message = MessageSchema(
        subject="Your CompareIntel Trial Has Ended - Paid Tiers Coming Soon!",
        recipients=[email],
        body=html,
        subtype="html",
    )
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send trial expired email to {email}: {str(e)}")
        raise
