# Backup and Rollback Runbook

**Version:** 1.0  
**Last Updated:** 2026-10-25  
**Owner:** Platform Team  
**Status:** Active

## Overview

This runbook documents CompareIntel's backup, restore, and rollback procedures for both application and database. Since production runs on a single Docker host with no staging environment, these procedures are critical for disaster recovery and safe deployment rollbacks.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Backup System](#backup-system)
3. [Restore Procedures](#restore-procedures)
4. [Rollback Procedures](#rollback-procedures)
5. [Monitoring and Maintenance](#monitoring-and-maintenance)
6. [Disaster Recovery](#disaster-recovery)
7. [Testing and Drills](#testing-and-drills)

---

## Architecture

### Production Environment

- **Single Docker host** running docker-compose (2 GB RAM; compose sets per-service memory limits)
- **Services:** nginx (frontend), backend (FastAPI + Gunicorn, `WEB_CONCURRENCY=2` by default), redis (`maxmemory 64mb`, `volatile-lru`)
- **Database:** PostgreSQL (external, configured via `DATABASE_URL` in `backend/.env`)
- **Deployment:** Blue-green style using `docker-compose.ssl.yml`. After a successful deploy, `deploy-production.sh` prunes dangling images and build cache (not running containers or volumes). `check` / `status` warn above 80% disk use or heavy swap.

### Backup Strategy

- **Daily backups:** Last 7 days retained locally
- **Weekly backups:** Last 4 weeks retained locally
- **Off-box storage:** Optional S3-compatible, rclone, or rsync upload
- **Pre-deployment backups:** Automatic before every deploy
- **Backup format:** Compressed PostgreSQL dump (gzip)

---

## Backup System

### Automatic Backups

#### 1. Pre-Deployment Backup

Every deployment automatically creates a timestamped backup before applying changes:

```bash
./deploy-production.sh deploy
# or
./deploy-production.sh build
```

The backup is created by `scripts/deploy/backup.sh`, which calls `scripts/backup/postgres-backup.sh`.

#### 2. Scheduled Daily Backups

Set up a daily backup via cron:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /home/ubuntu/CompareIntel/scripts/backup/scheduled-backup.sh >> /var/log/compareintel-backup.log 2>&1
```

### Manual Backup

Create an immediate backup:

```bash
cd /home/ubuntu/CompareIntel
bash scripts/backup/postgres-backup.sh
```

### Backup Configuration

Set these environment variables in `backend/.env` or in your shell:

#### Required
```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

#### Optional - Local Storage
```bash
BACKUP_DIR=/home/ubuntu/backups  # Default location
```

#### Optional - Remote Storage (S3-compatible)

For AWS S3, Backblaze B2, Wasabi, MinIO, etc.:

```bash
BACKUP_REMOTE_ENABLED=true
BACKUP_S3_BUCKET=my-backup-bucket
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=us-east-1

# For S3-compatible services (Backblaze B2, Wasabi, MinIO)
BACKUP_S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
```

**Free Tier Options:**
- **Backblaze B2:** 10 GB free
- **Wasabi:** 1 TB free for 30 days (then paid)
- **Self-hosted MinIO:** Free, requires server

#### Optional - Remote Storage (rclone)

For Google Drive, Dropbox, OneDrive, and 40+ other providers:

```bash
BACKUP_REMOTE_ENABLED=true
BACKUP_RCLONE_REMOTE=myremote:CompareIntel/backups

# First time: configure rclone
rclone config
```

**Free Tier Options:**
- **Google Drive:** 15 GB free
- **Dropbox:** 2 GB free
- **OneDrive:** 5 GB free

#### Optional - Remote Storage (rsync)

For another server:

```bash
BACKUP_REMOTE_ENABLED=true
BACKUP_RSYNC_DEST=user@backup-server:/backups

# Setup SSH key authentication first
ssh-copy-id user@backup-server
```

### Backup Locations

```
/home/ubuntu/backups/
├── daily/
│   ├── compareintel-20261025-140530.sql.gz
│   ├── compareintel-20261024-140215.sql.gz
│   └── ... (last 7 days)
└── weekly/
    ├── compareintel-week43-20261020.sql.gz
    ├── compareintel-week42-20261013.sql.gz
    └── ... (last 4 weeks)
```

### Backup Retention Policy

- **Daily backups:** 7 days (automatic cleanup)
- **Weekly backups:** 4 weeks (automatic cleanup)
- **Pre-deployment backups:** Stored in `daily/`, subject to retention
- **Manual backups:** Follow same retention rules

---

## Restore Procedures

### List Available Backups

```bash
cd /home/ubuntu/CompareIntel
bash scripts/restore/postgres-restore.sh list
```

### Interactive Restore

**⚠️ WARNING:** This will overwrite the database!

```bash
cd /home/ubuntu/CompareIntel
bash scripts/restore/postgres-restore.sh interactive
```

Follow the prompts to:
1. Select a backup file
2. Choose restore target (production or scratch database)
3. Verify row counts after restore

### Automated Restore Test (Non-Destructive)

Test restore to a scratch database without affecting production:

```bash
cd /home/ubuntu/CompareIntel
bash scripts/restore/postgres-restore.sh test
```

Or test a specific backup:

```bash
bash scripts/restore/postgres-restore.sh test /path/to/backup.sql.gz
```

This creates a temporary database, restores the backup, verifies row counts, and cleans up automatically.

### Manual Restore (Direct)

If you need to restore manually:

```bash
# For compressed backup
gunzip -c /path/to/backup.sql.gz | PGPASSWORD=yourpass psql -h host -p 5432 -U user -d dbname

# For uncompressed backup
PGPASSWORD=yourpass psql -h host -p 5432 -U user -d dbname -f /path/to/backup.sql
```

### Restore Verification

After any restore, verify data integrity:

```bash
# Check table counts
psql -d compareintel -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"

# Check row counts for critical tables
psql -d compareintel -c "
  SELECT tablename, n_live_tup 
  FROM pg_stat_user_tables 
  ORDER BY n_live_tup DESC;
"

# Check alembic migration version
cd backend
alembic current
```

---

## Rollback Procedures

### Rollback Types

1. **Quick rollback** - Revert code to previous commit
2. **Full rollback** - Revert code AND database
3. **Database-only rollback** - Restore database from backup
4. **Migration rollback** - Revert database migrations only

### Before You Begin

Check rollback state and available restore points:

```bash
cd /home/ubuntu/CompareIntel
bash scripts/rollback/rollback.sh status
```

### Quick Application Rollback

Rolls back code to previous git commit and redeploys (keeps database):

```bash
bash scripts/rollback/rollback.sh quick
```

**When to use:**
- Frontend bugs that don't affect data
- Backend bugs introduced after successful migration
- API changes that are backward compatible

**What it does:**
1. Saves current state
2. Stops Docker services
3. Checks out previous git commit
4. Rebuilds and restarts services

### Full Rollback (Application + Database)

**⚠️ WARNING:** This restores both code and database!

```bash
bash scripts/rollback/rollback.sh full
```

**When to use:**
- Failed migration that corrupted data
- Breaking schema change
- Critical bug introduced with data changes

**What it does:**
1. Saves current state
2. Stops Docker services
3. Reverts to previous git commit
4. Restores database from latest backup
5. Rebuilds and restarts services

### Database-Only Rollback

Restore database without changing application code:

```bash
bash scripts/rollback/rollback.sh database
```

**When to use:**
- Data corruption from bad query or script
- Need to restore specific dataset
- Testing rollback procedure

### Migration Rollback

Revert database migrations using alembic:

```bash
bash scripts/rollback/rollback.sh migrations
```

**When to use:**
- Migration ran successfully but logic is wrong
- Need to revert specific schema changes
- Preparing for code rollback

**Options:**
- Enter number of steps to roll back (e.g., `1`, `2`)
- Enter `base` to roll back all migrations

### Using the Deployment Script

The deployment script also supports rollback:

```bash
./deploy-production.sh rollback
```

This invokes the comprehensive rollback tool interactively.

### Manual Rollback Steps

If automation fails, manual rollback:

1. **Stop services:**
   ```bash
   cd /home/ubuntu/CompareIntel
   docker compose -f docker-compose.ssl.yml down
   ```

2. **Revert code:**
   ```bash
   git stash
   git checkout <previous-commit-hash>
   ```

3. **Restore database:**
   ```bash
   bash scripts/restore/postgres-restore.sh interactive
   ```

4. **Rebuild services:**
   ```bash
   docker compose -f docker-compose.ssl.yml up -d --build
   ```

5. **Verify:**
   ```bash
   docker compose -f docker-compose.ssl.yml ps
   curl -f http://localhost:8080/api/health || echo "Health check failed"
   ```

---

## Monitoring and Maintenance

### Daily Checks

```bash
# Check backup status
ls -lh /home/ubuntu/backups/daily/ | tail -10

# Check disk space
df -h /home/ubuntu/backups

# Verify latest backup integrity
cd /home/ubuntu/CompareIntel
bash scripts/backup/test-backup-restore.sh
```

### Weekly Checks

```bash
# Run full restore drill to scratch database
bash scripts/restore/postgres-restore.sh test

# Review backup retention
ls -lh /home/ubuntu/backups/weekly/

# Check remote backup sync (if configured)
# For S3:
aws s3 ls s3://my-backup-bucket/postgres/

# For rclone:
rclone ls myremote:CompareIntel/backups/postgres/
```

### Monthly Checks

- Full disaster recovery drill
- Review and update this runbook
- Verify backup restoration to clean environment
- Test rollback procedures

### Disk Space Management

Monitor backup disk usage:

```bash
du -sh /home/ubuntu/backups/*
```

Adjust retention if needed:
- Edit `DAILY_RETENTION` and `WEEKLY_RETENTION` in `scripts/backup/postgres-backup.sh`
- Manually clean old backups: `rm /home/ubuntu/backups/daily/compareintel-YYYYMMDD-*`

---

## Disaster Recovery

### Scenario 1: Database Corruption

**Symptoms:** Application errors, data inconsistencies, failed queries

**Steps:**
1. Identify time of corruption
2. Find last good backup:
   ```bash
   bash scripts/restore/postgres-restore.sh list
   ```
3. Stop application to prevent further writes:
   ```bash
   docker compose -f docker-compose.ssl.yml down
   ```
4. Restore database:
   ```bash
   bash scripts/restore/postgres-restore.sh interactive
   ```
5. Verify data integrity
6. Restart application:
   ```bash
   docker compose -f docker-compose.ssl.yml up -d
   ```

**RTO:** ~10-15 minutes  
**RPO:** Last backup (worst case: 24 hours)

### Scenario 2: Failed Deployment

**Symptoms:** Application won't start, 500 errors, failed health checks

**Steps:**
1. Check deployment state:
   ```bash
   bash scripts/rollback/rollback.sh status
   ```
2. Review logs:
   ```bash
   docker compose -f docker-compose.ssl.yml logs --tail=50
   ```
3. If migration failed, rollback:
   ```bash
   bash scripts/rollback/rollback.sh full
   ```
4. If only code issue, quick rollback:
   ```bash
   bash scripts/rollback/rollback.sh quick
   ```

**RTO:** ~5-10 minutes  
**RPO:** No data loss (backup taken pre-deployment)

### Scenario 3: Complete Server Loss

**Symptoms:** Server unreachable, hardware failure

**Prerequisites:**
- Off-box backups configured (S3, rclone, or rsync)
- Access to backup files
- Fresh server ready

**Steps:**
1. Provision new server
2. Install dependencies:
   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose postgresql-client
   ```
3. Clone repository:
   ```bash
   git clone https://github.com/jaydeelew/CompareIntel.git
   cd CompareIntel
   ```
4. Restore environment files (`.env`, SSL certs)
5. Download latest backup from remote storage:
   ```bash
   # S3:
   aws s3 cp s3://my-backup-bucket/postgres/ /home/ubuntu/backups/daily/ --recursive
   
   # rclone:
   rclone copy myremote:CompareIntel/backups/postgres/ /home/ubuntu/backups/daily/
   ```
6. Update `backend/.env` with new database credentials
7. Create new PostgreSQL database
8. Restore backup:
   ```bash
   bash scripts/restore/postgres-restore.sh interactive
   ```
9. Deploy application:
   ```bash
   ./deploy-production.sh build
   ```

**RTO:** ~2-4 hours (depending on server provisioning)  
**RPO:** Last off-box backup sync

### Scenario 4: Accidental Data Deletion

**Symptoms:** User reports data missing

**Steps:**
1. Identify when deletion occurred
2. Stop application to prevent further changes:
   ```bash
   docker compose -f docker-compose.ssl.yml down
   ```
3. Find backup before deletion:
   ```bash
   bash scripts/restore/postgres-restore.sh list
   ```
4. Restore to scratch database:
   ```bash
   bash scripts/restore/postgres-restore.sh test /path/to/backup.sql.gz
   ```
5. Extract specific data from scratch DB
6. Import extracted data to production
7. Restart application

**Alternative:** Point-in-time recovery (requires WAL archiving, not currently configured)

---

## Testing and Drills

### Automated Testing

#### In CI (GitHub Actions)

The CI pipeline automatically tests:
- Alembic upgrade/downgrade cycle
- Backup creation
- Restore to scratch database

See: `.github/workflows/ci.yml`

#### Manual Test

Run the full backup and restore drill:

```bash
cd /home/ubuntu/CompareIntel
bash scripts/backup/test-backup-restore.sh
```

This test:
- ✓ Checks prerequisites (pg_dump, psql, gzip)
- ✓ Tests database connectivity
- ✓ Creates a backup
- ✓ Restores to scratch database
- ✓ Verifies row counts
- ✓ Checks alembic migrations
- ✓ Generates test report

**Expected output:** All tests pass, report saved to `/tmp/compareintel-backup-test/`

### Restore Drill Procedure

**Frequency:** Monthly

**Steps:**
1. Create fresh backup:
   ```bash
   bash scripts/backup/postgres-backup.sh
   ```

2. Run automated restore test:
   ```bash
   bash scripts/backup/test-backup-restore.sh
   ```

3. Verify row counts match production:
   ```bash
   # Production counts
   psql -d compareintel -c "SELECT SUM(n_live_tup) FROM pg_stat_user_tables;"
   
   # Restored counts (from test output)
   cat /tmp/compareintel-backup-test/row_counts.txt
   ```

4. Document results in this runbook (see below)

### Rollback Drill Procedure

**Frequency:** Quarterly

**Environment:** Local development or staging (NOT production)

**Steps:**
1. Deploy current code to test environment
2. Make a test change and deploy again
3. Execute quick rollback:
   ```bash
   bash scripts/rollback/rollback.sh quick
   ```
4. Verify previous version is running
5. Execute full rollback (if test database available):
   ```bash
   bash scripts/rollback/rollback.sh full
   ```
6. Document any issues or improvements needed

### Drill Results Log

| Date | Type | Result | Notes | Conducted By |
|------|------|--------|-------|--------------|
| 2026-10-25 | Restore | ✓ Pass | Initial implementation test | Atlas |
| | | | |
| | | | |

---

## Troubleshooting

### Backup Failures

**Error:** `pg_dump: error: connection to database failed`
- **Cause:** Database unreachable or credentials wrong
- **Fix:** Verify `DATABASE_URL` in `backend/.env`, check network connectivity

**Error:** `gzip: stdout: Disk quota exceeded`
- **Cause:** No disk space for backup
- **Fix:** Clean old backups: `rm /home/ubuntu/backups/daily/compareintel-YYYYMMDD-*`

**Error:** `Permission denied` when writing backup
- **Cause:** Insufficient permissions on backup directory
- **Fix:** `sudo chown -R $USER:$USER /home/ubuntu/backups`

### Restore Failures

**Error:** `psql: error: could not connect to server`
- **Cause:** Database not running or connection details wrong
- **Fix:** Verify database is running, check `DATABASE_URL`

**Error:** `ERROR: relation "alembic_version" already exists`
- **Cause:** Restoring to non-empty database
- **Fix:** Drop and recreate database first, or restore to scratch DB

**Error:** Restored database has 0 tables
- **Cause:** Wrong backup file format or corrupted backup
- **Fix:** Test backup file: `gzip -t backup.sql.gz`, try different backup

### Rollback Failures

**Error:** `git checkout failed: Your local changes would be overwritten`
- **Cause:** Uncommitted changes in working directory
- **Fix:** Stash changes first: `git stash`, then retry rollback

**Error:** Docker services won't start after rollback
- **Cause:** Incompatible code/database versions
- **Fix:** Restore database to matching version or roll forward

---

## References

- [SCALING_ASSUMPTIONS.md](../development/SCALING_ASSUMPTIONS.md) - Infrastructure capacity planning
- [DATABASE.md](../architecture/DATABASE.md) - Database schema and migrations
- [deployment/REDIS_DEPLOYMENT.md](../deployment/REDIS_DEPLOYMENT.md) - Redis configuration

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-25 | Atlas | Initial version - GitHub issue #31 |

---

## Emergency Contacts

- **Platform Team:** [Add contact info]
- **Database Admin:** [Add contact info]
- **On-Call:** [Add PagerDuty/rotation link]
