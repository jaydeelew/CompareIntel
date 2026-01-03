"""
Email service for sending verification and notification emails.

This module handles all email communications including verification,
password resets, and subscription notifications.
"""

from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from pydantic import EmailStr
import os
from typing import List, Optional, Dict, Any
from datetime import datetime

# Email configuration from environment variables
# Only initialize if we have valid email settings
MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "noreply@compareintel.com")
MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.sendgrid.net")

# Check if email is configured
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
    # Initialize FastMail
    fm = FastMail(conf)
else:
    conf = None
    fm = None


async def send_verification_email(email: EmailStr, token: str) -> None:
    """
    Send email verification link to user.

    Args:
        email: User's email address
        token: Verification token
    
    Note: The verification link uses clicktracking="off" attribute to prevent
    SendGrid from wrapping the link in a subdomain (e.g., url3882.compareintel.com)
    which would cause SSL certificate errors. This ensures users can directly
    access the verification URL without certificate warnings.
    """
    # Skip sending email if not configured (development mode)
    if not EMAIL_CONFIGURED:
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        verification_url = f"{frontend_url}/verify-email?token={token}"
        print(f"Email service not configured - skipping verification email for {email}")
        print(f"Verification token: {token}")
        print(f"Verification URL: {verification_url}")
        return

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    verification_url = f"{frontend_url}/verify-email?token={token}"

    html = f"""
    <html>
      <head>
        <style>
          body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }}
          .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }}
          .header {{
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }}
          .content {{
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }}
          .button {{
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }}
          .footer {{
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to CompareIntel!</h1>
          </div>
          <div class="content">
            <p>Thank you for registering with CompareIntel, the AI model comparison platform.</p>
            <p>To complete your registration and start comparing AI models, please verify your email address by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="{verification_url}" class="button" target="_blank" clicktracking="off">Verify Email Address</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0ea5e9;">{verification_url}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <p>If you didn't create an account with CompareIntel, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>Need help? Contact us at <a href="mailto:support@compareintel.com" style="color: #0ea5e9;">support@compareintel.com</a></p>
            <p>&copy; 2026 CompareIntel. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message = MessageSchema(subject="Verify Your CompareIntel Account", recipients=[email], body=html, subtype="html")

    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send verification email to {email}: {str(e)}")
        # In production, you might want to log this or use a monitoring service
        raise


async def send_password_reset_email(email: EmailStr, token: str) -> None:
    """
    Send password reset link to user.

    Args:
        email: User's email address
        token: Password reset token
    
    Note: The password reset link uses clicktracking="off" attribute to prevent
    SendGrid from wrapping the link in a subdomain which would cause SSL certificate
    errors. This ensures users can directly access the reset URL without certificate warnings.
    """
    # Skip sending email if not configured (development mode)
    if not EMAIL_CONFIGURED:
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        reset_url = f"{frontend_url}/reset-password?token={token}"
        print(f"Email service not configured - skipping password reset email for {email}")
        print(f"Reset token: {token}")
        print(f"Reset URL: {reset_url}")
        return

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    reset_url = f"{frontend_url}/reset-password?token={token}"

    html = f"""
    <html>
      <head>
        <style>
          body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }}
          .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }}
          .header {{
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }}
          .content {{
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }}
          .button {{
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }}
          .footer {{
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }}
          .warning {{
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 12px;
            border-radius: 6px;
            margin: 15px 0;
          }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>You requested to reset your password for your CompareIntel account.</p>
            <p>Click the button below to create a new password:</p>
            <div style="text-align: center;">
              <a href="{reset_url}" class="button" clicktracking="off">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0ea5e9;">{reset_url}</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour.
            </div>
            <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>Need help? Contact us at <a href="mailto:support@compareintel.com" style="color: #0ea5e9;">support@compareintel.com</a></p>
            <p>&copy; 2026 CompareIntel. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message = MessageSchema(subject="Reset Your CompareIntel Password", recipients=[email], body=html, subtype="html")

    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send password reset email to {email}: {str(e)}")
        raise


async def send_subscription_confirmation_email(email: EmailStr, tier: str, period: str, amount: float) -> None:
    """
    Send subscription confirmation email.

    Args:
        email: User's email address
        tier: Subscription tier (starter, pro)
        period: Subscription period (monthly, yearly)
        amount: Amount paid
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    dashboard_url = f"{frontend_url}/dashboard"

    tier_display = tier.replace("_", " ").title()
    period_display = "Monthly" if period == "monthly" else "Yearly"

    # Import configuration to get tier limits
    from .config import get_daily_limit, get_model_limit, get_conversation_limit
    
    # Get tier benefits from configuration
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

    html = f"""
    <html>
      <head>
        <style>
          body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }}
          .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }}
          .header {{
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }}
          .content {{
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }}
          .button {{
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }}
          .subscription-box {{
            background: white;
            border: 2px solid #0ea5e9;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }}
          .benefits {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }}
          .benefits ul {{
            list-style: none;
            padding: 0;
          }}
          .benefits li {{
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
          }}
          .benefits li:before {{
            content: "✓";
            position: absolute;
            left: 0;
            color: #0ea5e9;
            font-weight: bold;
          }}
          .footer {{
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Subscription Confirmed!</h1>
          </div>
          <div class="content">
            <p>Thank you for upgrading to CompareIntel <strong>{tier_display}</strong>!</p>
            
            <div class="subscription-box">
              <h3 style="margin-top: 0;">Subscription Details</h3>
              <p><strong>Plan:</strong> {tier_display}</p>
              <p><strong>Billing:</strong> {period_display}</p>
              <p><strong>Amount:</strong> ${amount:.2f}</p>
            </div>
            
            <div class="benefits">
              <h3>Your {tier_display} Benefits</h3>
              <ul>
                {benefits_html}
              </ul>
            </div>
            
            <p>Your subscription is now active and you have full access to all {tier_display} features.</p>
            
            <div style="text-align: center;">
              <a href="{dashboard_url}" class="button">Go to Dashboard</a>
            </div>
            
            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              You can manage your subscription and billing from your account dashboard at any time.
            </p>
          </div>
          <div class="footer">
            <p>Need help? Contact us at <a href="mailto:support@compareintel.com" style="color: #0ea5e9;">support@compareintel.com</a></p>
            <p>&copy; 2026 CompareIntel. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message = MessageSchema(
        subject=f"Subscription Confirmed - CompareIntel {tier_display}", recipients=[email], body=html, subtype="html"
    )

    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send subscription confirmation email to {email}: {str(e)}")
        # Don't raise exception here - subscription is already confirmed
        pass


async def send_usage_limit_warning_email(email: EmailStr, usage_count: int, daily_limit: int, tier: str) -> None:
    """
    Send warning email when user is approaching their daily limit.

    Args:
        email: User's email address
        usage_count: Current usage count
        daily_limit: Daily limit for their tier
        tier: Current subscription tier
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    upgrade_url = f"{frontend_url}/subscription"

    percentage_used = (usage_count / daily_limit) * 100

    html = f"""
    <html>
      <head>
        <style>
          body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }}
          .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }}
          .header {{
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }}
          .content {{
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }}
          .button {{
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }}
          .usage-bar {{
            background: #e0e0e0;
            border-radius: 10px;
            height: 30px;
            position: relative;
            margin: 20px 0;
          }}
          .usage-fill {{
            background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
            height: 100%;
            border-radius: 10px;
            width: {percentage_used}%;
          }}
          .footer {{
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Usage Limit Warning</h1>
          </div>
          <div class="content">
            <p>You've used <strong>{usage_count}</strong> out of <strong>{daily_limit}</strong> daily comparisons ({percentage_used:.0f}%).</p>
            
            <div class="usage-bar">
              <div class="usage-fill"></div>
            </div>
            
            <p>You're approaching your daily limit. To continue using CompareIntel without interruption, consider upgrading your plan.</p>
            
            {'''
            <div style="text-align: center;">
              <a href="''' + upgrade_url + '''" class="button">Upgrade Your Plan</a>
            </div>
            '''}
            
            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              Your daily limit resets at midnight UTC.
            </p>
          </div>
          <div class="footer">
            <p>Need help? Contact us at <a href="mailto:support@compareintel.com" style="color: #0ea5e9;">support@compareintel.com</a></p>
            <p>&copy; 2026 CompareIntel. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
    """

    message = MessageSchema(subject="CompareIntel Usage Warning", recipients=[email], body=html, subtype="html")

    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send usage warning email to {email}: {str(e)}")
        # Don't raise exception - this is just a notification
        pass


async def send_model_availability_report(check_results: Dict[str, Any]) -> None:
    """
    Send model availability check report email to support@compareintel.com.
    
    Args:
        check_results: Dictionary containing check results with:
            - total_models: Total number of models checked
            - available_models: List of available models
            - unavailable_models: List of unavailable models with details
            - check_timestamp: When the check was performed
            - error: Any error that occurred
    """
    recipient_email = "support@compareintel.com"
    
    # Skip sending email if not configured (development mode)
    if not EMAIL_CONFIGURED:
        return
    
    total_models = check_results.get("total_models", 0)
    available_models = check_results.get("available_models", [])
    unavailable_models = check_results.get("unavailable_models", [])
    check_timestamp = check_results.get("check_timestamp", "")
    error = check_results.get("error")
    
    # Determine status and subject
    if error:
        status = "error"
        status_color = "#dc2626"
        status_text = "Error"
        subject = f"⚠️ Model Availability Check - Error"
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
    
    # Format timestamp
    try:
        dt = datetime.fromisoformat(check_timestamp.replace('Z', '+00:00'))
        formatted_timestamp = dt.strftime('%Y-%m-%d %H:%M:%S UTC')
    except:
        formatted_timestamp = check_timestamp
    
    # Build unavailable models HTML
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
    
    # Build available models summary (only show if there are issues)
    available_summary = ""
    if unavailable_models:
        available_summary = f"<p><strong>Available Models:</strong> {len(available_models)}/{total_models}</p>"
    
    # Build error section if present
    error_html = ""
    if error:
        error_html = f"""
        <div style='background: #fee2e2; border: 2px solid #dc2626; padding: 15px; border-radius: 6px; margin: 20px 0;'>
            <strong style='color: #dc2626;'>Error:</strong> {error}
        </div>
        """
    
    html = f"""
    <html>
      <head>
        <style>
          body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }}
          .container {{
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }}
          .header {{
            background: linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }}
          .content {{
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }}
          .status-box {{
            background: white;
            border: 2px solid {status_color};
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
          }}
          .status-box h2 {{
            color: {status_color};
            margin: 0 0 10px 0;
          }}
          .summary {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }}
          .summary-item {{
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
          }}
          .summary-item:last-child {{
            border-bottom: none;
          }}
          .footer {{
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Model Availability Check Report</h1>
          </div>
          <div class="content">
            <div class="status-box">
              <h2>{status_text}</h2>
              <p style="margin: 0; color: #666;">Check performed on {formatted_timestamp}</p>
            </div>
            
            {error_html}
            
            <div class="summary">
              <h3>Summary</h3>
              <div class="summary-item">
                <strong>Total Models Checked:</strong> {total_models}
              </div>
              <div class="summary-item">
                <strong>Available:</strong> <span style="color: #10b981;">{len(available_models)}</span>
              </div>
              <div class="summary-item">
                <strong>Unavailable:</strong> <span style="color: #dc2626;">{len(unavailable_models)}</span>
              </div>
            </div>
            
            {available_summary}
            {unavailable_html}
            
            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              This is an automated daily check of model availability from OpenRouter API.
            </p>
          </div>
          <div class="footer">
            <p>CompareIntel Model Availability Monitor</p>
            <p>&copy; 2026 CompareIntel. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
    """
    
    message = MessageSchema(
        subject=subject,
        recipients=[recipient_email],
        body=html,
        subtype="html"
    )
    
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"Failed to send model availability report email: {str(e)}")
        raise

