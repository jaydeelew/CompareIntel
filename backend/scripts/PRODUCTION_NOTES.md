# Production Environment Notes

## Original Script Issues

The original `check_model_availability.py` script had several issues that could prevent it from working in production:

### 1. **Path Resolution**
- Used relative paths (`Path(__file__).parent.parent`) which might fail if run from different directories
- Fixed: Use `.resolve()` to get absolute paths

### 2. **Environment Variables**
- Only loaded from `.env` file
- In Docker, environment variables come from `env_file` or `environment` sections in docker-compose
- Fixed: Check multiple .env locations and don't override existing environment variables

### 3. **Docker Container Execution**
- Script needs to run inside Docker container or via `docker exec`
- Cron jobs inside containers are problematic (containers restart, cron may not run)
- Fixed: Production script designed to work both ways, setup script detects environment

### 4. **Error Handling**
- Limited error reporting
- Fixed: Added traceback printing for debugging

## Production Script Features

The `check_model_availability_prod.py` script includes:

1. **Robust Path Resolution**: Uses `.resolve()` for absolute paths
2. **Multiple Environment Sources**: Checks .env files and respects existing env vars
3. **Better Error Reporting**: Includes traceback for debugging
4. **Docker Compatibility**: Works both inside and outside Docker containers
5. **Debugging Output**: Prints Python path, working directory, and backend directory

## Recommended Production Setup

### For Docker Deployments (Current Setup)

1. **Use host cron with docker exec** (recommended):
   ```bash
   0 9 * * * docker exec compareintel-backend-1 python3 /app/scripts/check_model_availability_prod.py >> /app/logs/model_check.log 2>&1
   ```

2. **Benefits**:
   - Cron runs on host (more reliable)
   - Script executes in container (has access to app code and dependencies)
   - Container can restart without affecting cron
   - Logs are accessible on host

3. **Setup**:
   ```bash
   cd backend/scripts
   ./setup_daily_model_check_prod.sh
   ```

### Alternative: Systemd Timer (More Reliable)

For production, consider using systemd timer instead of cron:

1. Create service file: `/etc/systemd/system/model-check.service`
2. Create timer file: `/etc/systemd/system/model-check.timer`
3. Enable and start timer

This is more reliable than cron for production systems.

## Testing in Production

Before deploying, test the script:

```bash
# SSH into production server
ssh ubuntu@your-server

# Test script execution
docker exec compareintel-backend-1 python3 /app/scripts/check_model_availability_prod.py

# Check logs
docker exec compareintel-backend-1 cat /app/logs/model_check.log
```

## Environment Variables

Ensure these are set in production (via docker-compose or .env):

- `OPENROUTER_API_KEY`: Required for API calls
- `MAIL_USERNAME`: SMTP username
- `MAIL_PASSWORD`: SMTP password
- `MAIL_FROM`: Sender email
- `MAIL_SERVER`: SMTP server
- `MAIL_PORT`: SMTP port (usually 587)

## Monitoring

Set up monitoring for:
1. Script execution (check cron/systemd logs)
2. Email delivery (verify emails arrive)
3. Model availability issues (check email reports)

## Troubleshooting Production Issues

1. **Script not running**:
   - Check cron logs: `grep CRON /var/log/syslog`
   - Verify container is running: `docker ps`
   - Test manual execution: `docker exec container-name python3 /app/scripts/check_model_availability_prod.py`

2. **Email not sending**:
   - Verify SMTP credentials in environment
   - Check email service logs
   - Test email service manually

3. **Import errors**:
   - Verify Python path in container
   - Check that app modules are accessible
   - Ensure dependencies are installed

