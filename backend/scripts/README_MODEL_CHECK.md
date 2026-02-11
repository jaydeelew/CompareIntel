# Model Availability Check Script

This script checks if all models configured in CompareIntel are available for API calls from OpenRouter and sends a daily email report to support@compareintel.com.

## Overview

The script performs the following tasks:
1. Fetches all available models from OpenRouter's API
2. Checks each configured model in `OPENROUTER_MODELS` against OpenRouter's list
3. Identifies any unavailable models
4. Sends an email report to support@compareintel.com with the status

## Scripts

- **`check_model_availability.py`**: Development version (for local testing)
- **`check_model_availability_prod.py`**: Production version (works in Docker and on host)

## Prerequisites

1. Ensure email is configured:
   - **Development**: In `.env` file
   - **Production**: Via Docker environment variables or `.env` file
   
   ```
   MAIL_USERNAME=emailapikey
   MAIL_PASSWORD=your_zeptomail_smtp_password
   MAIL_FROM=noreply@compareintel.com
   MAIL_SERVER=smtp.zeptomail.com
   MAIL_PORT=587
   ```

2. Ensure OpenRouter API key is configured:
   ```
   OPENROUTER_API_KEY=your_openrouter_api_key
   ```

## Production Setup (Docker Deployment)

### Option 1: Using the production setup script (Recommended)

```bash
cd backend/scripts
chmod +x setup_daily_model_check_prod.sh
./setup_daily_model_check_prod.sh
```

This will:
- Detect if running in Docker or on host
- Set up cron job on host system that executes script inside Docker container
- Use `docker exec` to run the script

### Option 2: Manual Docker cron setup

1. Find your backend container name:
   ```bash
   docker compose -f docker-compose.ssl.yml ps
   # or
   docker ps | grep backend
   ```

2. Add to host crontab:
   ```bash
   crontab -e
   ```

3. Add this line (runs daily at 9:00 AM UTC):
   ```
   0 9 * * * docker exec compareintel-backend-1 python3 /app/scripts/check_model_availability_prod.py >> /app/logs/model_check.log 2>&1
   ```
   
   Replace `compareintel-backend-1` with your actual container name.

### Testing in Production

Test the script manually before setting up the cron job:

```bash
# Inside Docker container
docker exec compareintel-backend-1 python3 /app/scripts/check_model_availability_prod.py

# Or from host (if script is accessible)
python3 backend/scripts/check_model_availability_prod.py
```

## Development Setup

### Option 1: Using the setup script

```bash
cd backend/scripts
chmod +x setup_daily_model_check.sh
./setup_daily_model_check.sh
```

### Option 2: Manual cron setup

1. Make the script executable:
   ```bash
   chmod +x backend/scripts/check_model_availability.py
   ```

2. Add to crontab:
   ```bash
   crontab -e
   ```

3. Add this line (runs daily at 9:00 AM UTC):
   ```
   0 9 * * * cd /path/to/CompareIntel && /usr/bin/python3 backend/scripts/check_model_availability.py >> logs/model_check.log 2>&1
   ```

### Testing

Test the script manually before setting up the cron job:

```bash
cd /path/to/CompareIntel
python3 backend/scripts/check_model_availability.py
```

## Email Report Format

The email report includes:
- **Status**: Success (all models available), Warning (some unavailable), or Error
- **Summary**: Total models checked, available count, unavailable count
- **Unavailable Models**: List of models not found in OpenRouter with details
- **Timestamp**: When the check was performed

## Logging

The script logs output to:
- Console (when run manually)
- `logs/model_check.log` (when run via cron)

## Troubleshooting

### Script fails to run

1. **Check Python path:**
   ```bash
   which python3
   # In Docker:
   docker exec container-name which python3
   ```

2. **Check script permissions:**
   ```bash
   ls -l backend/scripts/check_model_availability*.py
   # In Docker:
   docker exec container-name ls -l /app/scripts/check_model_availability*.py
   ```

3. **Test imports:**
   ```bash
   python3 -c "from app.model_runner import OPENROUTER_MODELS; print('OK')"
   # In Docker:
   docker exec container-name python3 -c "from app.model_runner import OPENROUTER_MODELS; print('OK')"
   ```

4. **Check environment variables:**
   ```bash
   # In Docker, verify env vars are set:
   docker exec container-name env | grep -E "OPENROUTER|MAIL"
   ```

5. **Check Docker container is running:**
   ```bash
   docker ps | grep backend
   docker compose -f docker-compose.ssl.yml ps
   ```

### Email not sending

1. Verify email configuration in `.env`
2. Check email service logs
3. Test email service manually:
   ```python
   from app.email_service import send_model_availability_report
   import asyncio
   results = {"total_models": 0, "available_models": [], "unavailable_models": [], "check_timestamp": "2025-01-01T00:00:00", "error": None}
   asyncio.run(send_model_availability_report(results))
   ```

### Models showing as unavailable

- Some models may be temporarily unavailable from OpenRouter
- Models marked with `"available": False` in configuration are expected to be unavailable
- Check OpenRouter's status page for service issues

## Cron Schedule Options

To change the schedule, modify the cron entry:

- Daily at 9:00 AM UTC: `0 9 * * *`
- Daily at midnight UTC: `0 0 * * *`
- Every 12 hours: `0 */12 * * *`
- Every 6 hours: `0 */6 * * *`

## Removing the Cron Job

To remove the cron job:

```bash
crontab -e
# Delete the line containing check_model_availability.py
```

Or remove all entries:
```bash
crontab -l | grep -v "check_model_availability.py" | crontab -
```

