# Trial Expired Email Script

This script sends email notifications to free tier users when their 7-day premium trial expires, reminding them that paid subscription tiers are coming soon.

## Overview

The script performs the following tasks:
1. Finds users whose 7-day trial has expired (within the last 7 days)
2. Sends them an email encouraging them to contact support@compareintel.com to express interest in paid tiers
3. Only sends to verified, active free tier users

## Prerequisites

1. Ensure email is configured:
   - **Development**: In `.env` file
   - **Production**: Via Docker environment variables or `.env` file
   
   ```
   MAIL_USERNAME=your_smtp_username
   MAIL_PASSWORD=your_smtp_password
   MAIL_FROM=noreply@compareintel.com
   MAIL_SERVER=smtp.sendgrid.net
   MAIL_PORT=587
   ```

2. Database must be accessible and configured

## Usage

### Manual Execution

**Development:**
```bash
cd backend/scripts
python3 send_trial_expired_emails.py
```

**Production (Docker):**
```bash
docker exec compareintel-backend-1 python3 /app/scripts/send_trial_expired_emails.py
```

### Automated Execution (Cron Job)

To set up a daily cron job:

**Development:**
```bash
cd backend/scripts
chmod +x setup_trial_email_cron.sh
./setup_trial_email_cron.sh
```

**Production:**
```bash
cd backend/scripts
chmod +x setup_trial_email_cron_prod.sh
./setup_trial_email_cron_prod.sh
```

Or manually add to crontab:
```bash
crontab -e
```

Add this line (runs daily at 10:00 AM UTC):
```
0 10 * * * cd /path/to/CompareIntel/backend && python3 scripts/send_trial_expired_emails.py >> logs/trial_emails.log 2>&1
```

For Docker:
```
0 10 * * * docker exec compareintel-backend-1 python3 /app/scripts/send_trial_expired_emails.py >> /path/to/logs/trial_emails.log 2>&1
```

## How It Works

1. **User Selection**: The script finds users where:
   - `subscription_tier == 'free'`
   - `trial_ends_at` is not NULL
   - `trial_ends_at` is in the past (trial expired)
   - `trial_ends_at` is within the last 7 days (to avoid sending emails for very old trials)
   - `is_verified == True` (only verified users)
   - `is_active == True` (only active users)

2. **Email Sending**: For each matching user, sends an email with:
   - Reminder that their trial has ended
   - Information about upcoming paid tiers
   - Encouragement to email support@compareintel.com to express interest

3. **Logging**: The script logs:
   - Number of users found
   - Success/failure for each email
   - Summary statistics

## Email Content

The email includes:
- A friendly reminder that the trial has ended
- Information about what's available in free tier vs paid tiers
- Call-to-action to email support@compareintel.com
- Link to dashboard to continue using CompareIntel

## Troubleshooting

### Script not finding users

1. **Check database connection:**
   ```bash
   python3 -c "from app.database import SessionLocal; db = SessionLocal(); print('OK')"
   ```

2. **Verify users have expired trials:**
   ```sql
   SELECT email, trial_ends_at, subscription_tier, is_verified, is_active 
   FROM users 
   WHERE subscription_tier = 'free' 
   AND trial_ends_at IS NOT NULL 
   AND trial_ends_at < datetime('now');
   ```

3. **Check timezone handling:** The script handles both timezone-aware and naive datetimes

### Email not sending

1. **Verify email configuration:**
   ```bash
   python3 -c "from app.email_service import EMAIL_CONFIGURED; print(EMAIL_CONFIGURED)"
   ```

2. **Test email service manually:**
   ```python
   from app.email_service import send_trial_expired_email
   import asyncio
   asyncio.run(send_trial_expired_email("test@example.com"))
   ```

3. **Check email service logs** for error messages

### Duplicate emails

The script checks for trials that expired within the last 7 days. To prevent duplicates:
- The script only processes trials expired in the last 7 days
- Consider adding a `trial_expired_email_sent` flag to the User model if you need more precise tracking

## Cron Schedule Options

To change the schedule, modify the cron entry:

- Daily at 10:00 AM UTC: `0 10 * * *`
- Daily at midnight UTC: `0 0 * * *`
- Twice daily (morning and evening): `0 10,22 * * *`
- Every 12 hours: `0 */12 * * *`

## Removing the Cron Job

To remove the cron job:

```bash
crontab -e
# Delete the line containing send_trial_expired_emails.py
```

Or remove all entries:
```bash
crontab -l | grep -v "send_trial_expired_emails.py" | crontab -
```

## Notes

- The script only processes trials expired in the last 7 days to avoid sending emails for very old trials
- Only verified and active users receive emails
- The script is idempotent - running it multiple times won't cause issues (it checks trial end dates)
- For more precise duplicate prevention, consider adding a tracking field to the User model
