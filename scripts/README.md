# Backup, Restore, and Rollback Scripts

This directory contains the scripts for database backup, restore, and application/database rollback procedures.

## Directory Structure

```
scripts/
├── backup/
│   ├── postgres-backup.sh       - Main backup script with retention
│   ├── scheduled-backup.sh      - Cron-compatible scheduled backup
│   └── test-backup-restore.sh   - Automated backup/restore testing
├── restore/
│   └── postgres-restore.sh      - Database restore with verification
├── rollback/
│   └── rollback.sh              - Comprehensive rollback tool
└── deploy/
    ├── backup.sh                - Deployment backup integration
    ├── build.sh                 - Build with state saving
    └── rollback.sh              - Deployment rollback wrapper
```

## Quick Reference

### Backup

```bash
# Manual backup
bash scripts/backup/postgres-backup.sh

# Test backup and restore
bash scripts/backup/test-backup-restore.sh

# Setup scheduled daily backup (cron)
crontab -e
# Add: 0 2 * * * /path/to/CompareIntel/scripts/backup/scheduled-backup.sh >> /var/log/compareintel-backup.log 2>&1
```

### Restore

```bash
# List available backups
bash scripts/restore/postgres-restore.sh list

# Interactive restore (with safety prompts)
bash scripts/restore/postgres-restore.sh interactive

# Test restore to scratch database
bash scripts/restore/postgres-restore.sh test
```

### Rollback

```bash
# Check status, image tags, and available restore points
bash scripts/rollback/rollback.sh status

# One-command rollback to :previous images (no rebuild, no Alembic)
bash scripts/rollback/rollback.sh previous
# same: ./deploy-production.sh rollback

# Same, then prompt to confirm alembic downgrade -1
bash scripts/rollback/rollback.sh previous --with-migrations

# Quick app rollback (git checkout + rebuild)
bash scripts/rollback/rollback.sh quick

# Full rollback (app + database)
bash scripts/rollback/rollback.sh full

# Database only
bash scripts/rollback/rollback.sh database

# Migrations only (interactive)
bash scripts/rollback/rollback.sh migrations
```

## Configuration

### Required Environment Variables

```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### Optional - Remote Backup Storage

#### S3-Compatible (AWS, Backblaze B2, Wasabi, MinIO)

```bash
BACKUP_REMOTE_ENABLED=true
BACKUP_S3_BUCKET=my-backup-bucket
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=us-east-1

# For S3-compatible services
BACKUP_S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
```

**Free Tier Options:**
- Backblaze B2: 10 GB free
- AWS S3: 5 GB for 12 months (new accounts)

#### Rclone (Google Drive, Dropbox, OneDrive, etc.)

```bash
BACKUP_REMOTE_ENABLED=true
BACKUP_RCLONE_REMOTE=myremote:CompareIntel/backups

# First time: configure rclone
rclone config
```

**Free Tier Options:**
- Google Drive: 15 GB free
- Dropbox: 2 GB free
- OneDrive: 5 GB free

#### Rsync (Another Server)

```bash
BACKUP_REMOTE_ENABLED=true
BACKUP_RSYNC_DEST=user@backup-server:/backups

# Setup SSH key authentication first
ssh-copy-id user@backup-server
```

## Backup Retention

- **Daily backups:** Last 7 days
- **Weekly backups:** Last 4 weeks (created on Sunday)
- **Automatic cleanup:** Old backups removed automatically

## Testing

### Automated Testing

```bash
# Full backup and restore drill
bash scripts/backup/test-backup-restore.sh
```

This runs:
- ✓ Prerequisites check (pg_dump, psql, gzip)
- ✓ Database connectivity test
- ✓ Backup creation
- ✓ Restore to scratch database
- ✓ Row count verification
- ✓ Alembic migration check

### CI Testing

The GitHub Actions CI pipeline tests:
- Alembic upgrade / downgrade-1 / re-upgrade against throwaway Postgres 15
- Migration integrity

**CI does not run backup or restore.** Those are covered by `scripts/backup/test-backup-restore.sh` and the drills in [docs/runbooks/backup-rollback.md](../docs/runbooks/backup-rollback.md).

See: `.github/workflows/ci.yml`

## Documentation

**Full runbook:** [docs/runbooks/backup-rollback.md](../../docs/runbooks/backup-rollback.md)

The runbook includes:
- Detailed procedures for all scenarios
- Disaster recovery steps
- Troubleshooting guide
- Monthly drill procedures

## Implementation Notes

### Pre-Deployment Backups

The deployment script (`deploy-production.sh`) automatically creates a backup before:
- Running migrations (`alembic upgrade head`)
- Building new Docker images
- Deploying code changes

This backup is stored in the daily backup directory and follows the same retention policy.

### State Tracking

The build script saves deployment state before each deploy to `/home/ubuntu/.compareintel-rollback-state`:
- Git commit and branch
- `IMAGE_TAG` (git short SHA)
- Docker image IDs
- Timestamp

Release images are tagged `compareintel-{backend,nginx}:<sha>`, `:current`, and `:previous`. `scripts/deploy/build.sh` no longer runs `docker image prune -f` before the build (that deleted the previous release once compose untagged it). Dangling-only prune still runs after a successful deploy; the last 3 SHA tags are kept.

`scripts/rollback/rollback.sh previous` (and `./deploy-production.sh rollback`) redeploys `:previous` without rebuilding. `alembic downgrade` is opt-in (`--with-migrations`) and requires typing `DOWNGRADE`.

### Safety Features

All scripts include:
- ✓ Confirmation prompts before destructive operations
- ✓ Backup verification (gzip integrity checks)
- ✓ Dry-run options where applicable
- ✓ Detailed logging
- ✓ Graceful degradation (skip remote backup if not configured)

## Troubleshooting

### Backup fails with "pg_dump: command not found"

Install PostgreSQL client:
```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
```

### Remote backup skipped with warning

This is expected if remote backup is not configured. To enable:
1. Choose a provider (S3-compatible, rclone, or rsync)
2. Set the appropriate environment variables
3. Test: `bash scripts/backup/postgres-backup.sh`

### Restore fails with permission denied

Check database permissions:
```bash
# Connect to database
psql -d compareintel

# Check user permissions
\du

# Grant necessary permissions if needed
GRANT CREATE ON DATABASE compareintel TO youruser;
```

### Scripts not executable

Make them executable:
```bash
chmod +x scripts/backup/*.sh scripts/restore/*.sh scripts/rollback/*.sh
```

## Related Documentation

- [docs/runbooks/backup-rollback.md](../../docs/runbooks/backup-rollback.md) - Complete runbook
- [docs/development/SCALING_ASSUMPTIONS.md](../../docs/development/SCALING_ASSUMPTIONS.md) - Infrastructure planning
- [docs/architecture/DATABASE.md](../../docs/architecture/DATABASE.md) - Database architecture

## Support

For issues or questions:
- GitHub Issue: https://github.com/jaydeelew/CompareIntel/issues/31
- Documentation: This README and the runbook
