# 📊 Data Retention Implementation

**Date:** November 2025  
**Status:** ✅ **FULLY IMPLEMENTED**  
**Version:** 1.0

---

## 🎯 Overview

The data retention system manages database growth by aggregating old `UsageLog` entries into monthly summaries while preserving detailed data needed for token estimation and analysis. This ensures the database remains manageable as user traffic grows, while never deleting user conversations or losing valuable analytics data.

---

## 📋 Problem Statement

### The Challenge
- `UsageLog` entries accumulate indefinitely (~1KB per entry)
- At scale: ~365MB/year for detailed entries alone
- Need detailed data for token estimation (~30 days)
- Need aggregated data for long-term analysis
- **Must never delete user conversations**

### The Solution
- Keep **90 days** of detailed `UsageLog` entries (for token estimation)
- Aggregate older entries into **monthly summaries** (for analysis)
- Delete detailed entries after aggregation
- **Never touch** `Conversation` or `ConversationMessage` tables

---

## 🏗️ Architecture

### Components

#### 1. **UsageLogMonthlyAggregate Model** (`backend/app/models.py`)
Stores monthly aggregated statistics:
- Total comparisons, models requested/successful/failed
- Token aggregates (total and average input/output tokens)
- Credit aggregates (total and average credits per comparison)
- Cost aggregates (total actual and estimated costs)
- Model breakdown (per-model statistics as JSON)

#### 2. **Data Retention Module** (`backend/app/data_retention.py`)
Core cleanup function:
- `cleanup_old_usage_logs(db, keep_days=90, dry_run=False)`
- Groups old entries by year/month
- Calculates aggregates
- Creates/updates monthly summary records
- Deletes detailed entries after aggregation

#### 3. **Admin Endpoint** (`backend/app/routers/admin.py`)
REST API for manual cleanup:
- `POST /api/admin/maintenance/cleanup-usage-logs`
- Parameters: `keep_days` (default: 90), `dry_run` (default: False)
- Requires admin authentication
- Logs admin actions

#### 4. **Database Migration** (`backend/alembic/versions/add_usage_log_monthly_aggregate_table.py`)
Creates the aggregate table with:
- Unique constraint on (year, month)
- Indexes on year, month, and id
- All necessary aggregate columns

---

## 🔧 Usage

### Manual Cleanup (Admin Endpoint)

#### Dry Run (Preview)
```bash
curl -X POST "http://localhost:8000/api/admin/maintenance/cleanup-usage-logs?keep_days=90&dry_run=true" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "status": "dry_run",
  "cutoff_date": "2025-08-26T21:57:24.822290+00:00",
  "entries_to_process": 1500,
  "months_to_aggregate": 3,
  "would_create_aggregates": 3,
  "would_delete_entries": 1500,
  "monthly_breakdown": {
    "2025-08": {"entries": 500, "total_comparisons": 500},
    "2025-09": {"entries": 500, "total_comparisons": 500},
    "2025-10": {"entries": 500, "total_comparisons": 500}
  }
}
```

#### Actual Cleanup
```bash
curl -X POST "http://localhost:8000/api/admin/maintenance/cleanup-usage-logs?keep_days=90&dry_run=false" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "cutoff_date": "2025-08-26T21:57:24.822290+00:00",
  "aggregates_created": 3,
  "aggregates_updated": 0,
  "entries_deleted": 1500,
  "months_processed": 3
}
```

### Programmatic Cleanup (Python)

```python
from app.database import SessionLocal
from app.data_retention import cleanup_old_usage_logs

db = SessionLocal()
try:
    # Dry run first
    result = cleanup_old_usage_logs(db, keep_days=90, dry_run=True)
    print(f"Would process {result['entries_to_process']} entries")
    
    # Actual cleanup
    result = cleanup_old_usage_logs(db, keep_days=90, dry_run=False)
    print(f"Deleted {result['entries_deleted']} entries")
    print(f"Created {result['aggregates_created']} aggregates")
finally:
    db.close()
```

### Scheduled Cleanup (Cron)

Add to crontab to run monthly on the 1st at 2 AM:

```bash
0 2 1 * * cd /path/to/backend && python3 -c "from app.data_retention import cleanup_old_usage_logs; from app.database import SessionLocal; db = SessionLocal(); cleanup_old_usage_logs(db, keep_days=90); db.close()"
```

---

## 📊 Data Preservation

### What Gets Preserved

#### Detailed Data (90 days)
- Individual `UsageLog` entries
- Exact token counts per comparison
- Per-model token usage
- Individual cost calculations
- **Used for:** Token estimation, recent usage analysis

#### Aggregated Data (Indefinite)
- Monthly totals and averages
- Model breakdown statistics
- Cost trends over time
- Usage patterns by month
- **Used for:** Long-term analysis, reporting, cost tracking

### What Never Gets Deleted

- ✅ **Conversation** entries (user's saved comparisons)
- ✅ **ConversationMessage** entries (individual messages)
- ✅ **User** accounts and preferences
- ✅ **CreditTransaction** records
- ✅ **SubscriptionHistory** records

---

## 💾 Storage Impact

### Before Cleanup
- ~1KB per `UsageLog` entry
- ~1,000 entries/day = ~365MB/year
- Unlimited growth over time

### After Cleanup
- **90 days detailed:** ~90MB
- **Monthly aggregates:** ~0.5KB/month = ~6KB/year
- **Total:** ~90MB + 6KB/year
- **Savings:** ~75% reduction while preserving all analysis data

### Example Calculation
```
Before: 365 days × 1,000 entries/day × 1KB = 365MB/year
After:  90 days × 1,000 entries/day × 1KB = 90MB
        + 12 months × 0.5KB = 6KB/year
Total:  ~90MB + 6KB/year
```

---

## 🔍 Aggregation Details

### Monthly Aggregate Fields

| Field | Description |
|-------|-------------|
| `year`, `month` | Unique identifier for the month |
| `total_comparisons` | Number of comparisons in the month |
| `total_models_requested` | Total models requested |
| `total_models_successful` | Total successful model calls |
| `total_models_failed` | Total failed model calls |
| `total_input_tokens` | Sum of all input tokens |
| `total_output_tokens` | Sum of all output tokens |
| `total_effective_tokens` | Sum of all effective tokens |
| `avg_input_tokens` | Average input tokens per comparison |
| `avg_output_tokens` | Average output tokens per comparison |
| `avg_output_ratio` | Average output/input ratio |
| `total_credits_used` | Sum of all credits used |
| `avg_credits_per_comparison` | Average credits per comparison |
| `total_actual_cost` | Sum of actual costs from OpenRouter |
| `total_estimated_cost` | Sum of estimated costs |
| `model_breakdown` | JSON with per-model statistics |

### Model Breakdown JSON Structure

```json
{
  "openai/gpt-4": {
    "count": 150,
    "avg_input_tokens": 1250.5,
    "avg_output_tokens": 1875.3,
    "total_credits": 750.25
  },
  "anthropic/claude-3-opus": {
    "count": 200,
    "avg_input_tokens": 1100.2,
    "avg_output_tokens": 1650.8,
    "total_credits": 880.50
  }
}
```

---

## ⚙️ Configuration

### Retention Period

Default: **90 days** of detailed data

**Rationale:**
- Token estimation requires ~30 days of detailed data
- 90 days provides a comfortable buffer
- Allows for monthly cleanup cycles
- Balances storage vs. data availability

**Adjusting:**
```python
# Keep 60 days instead
cleanup_old_usage_logs(db, keep_days=60)

# Keep 180 days
cleanup_old_usage_logs(db, keep_days=180)
```

### Cleanup Frequency

**Recommended:** Monthly (on the 1st of each month)

**Why Monthly:**
- Aligns with natural billing cycles
- Ensures aggregates are complete months
- Prevents database from growing too large
- Low maintenance overhead

---

## 🛡️ Safety Features

### Dry Run Mode
Always test with `dry_run=True` first:
- Shows what would be processed
- No actual deletions
- Safe to run anytime
- Helps estimate impact

### Transaction Safety
- Aggregates created before deletions
- Database transaction ensures atomicity
- Rollback on errors
- No partial state

### Data Integrity
- Unique constraint prevents duplicate aggregates
- Existing aggregates are merged (not overwritten)
- All calculations verified
- Admin action logging

---

## 📈 Monitoring

### Key Metrics to Track

1. **Database Size**
   - Monitor `usage_logs` table size
   - Should stabilize around ~90MB
   - Alert if growing unexpectedly

2. **Aggregate Count**
   - Number of monthly aggregates
   - Should grow by ~1 per month
   - Verify aggregates are being created

3. **Cleanup Success Rate**
   - Check admin action logs
   - Verify no errors during cleanup
   - Monitor entries processed

### Query Examples

```sql
-- Check current UsageLog count
SELECT COUNT(*) FROM usage_logs;

-- Check aggregate count
SELECT COUNT(*) FROM usage_log_monthly_aggregates;

-- View recent aggregates
SELECT year, month, total_comparisons, total_credits_used 
FROM usage_log_monthly_aggregates 
ORDER BY year DESC, month DESC 
LIMIT 12;

-- Check oldest detailed entry
SELECT MIN(created_at) FROM usage_logs;
```

---

## 🐛 Troubleshooting

### Issue: No entries to process
**Symptom:** `status: "no_data"`  
**Cause:** No entries older than `keep_days`  
**Solution:** Normal - system is working correctly. Wait for data to age.

### Issue: Aggregates not being created
**Symptom:** Cleanup runs but no aggregates appear  
**Cause:** Database transaction not committed  
**Solution:** Check for errors in logs, verify database permissions

### Issue: Duplicate aggregate error
**Symptom:** Unique constraint violation  
**Cause:** Same month processed twice  
**Solution:** Existing aggregates are merged automatically - this shouldn't happen

### Issue: Database still growing
**Symptom:** `usage_logs` table continues to grow  
**Cause:** Cleanup not running regularly  
**Solution:** Set up cron job or run manually monthly

---

## 🔄 Migration Path

### For Existing Deployments

1. **Run Migration**
   ```bash
   cd backend
   alembic upgrade head
   ```

2. **Verify Table Created**
   ```sql
   SELECT * FROM usage_log_monthly_aggregates LIMIT 1;
   ```

3. **Test Dry Run**
   ```bash
   # Use admin endpoint or Python script
   cleanup_old_usage_logs(db, keep_days=90, dry_run=True)
   ```

4. **Run First Cleanup**
   ```bash
   cleanup_old_usage_logs(db, keep_days=90, dry_run=False)
   ```

5. **Set Up Automation**
   - Add cron job for monthly cleanup
   - Monitor first few runs
   - Adjust `keep_days` if needed

---

## 📝 API Reference

### Admin Endpoint

**POST** `/api/admin/maintenance/cleanup-usage-logs`

**Authentication:** Required (Admin role)

**Query Parameters:**
- `keep_days` (int, optional): Days of detailed data to keep (default: 90)
- `dry_run` (bool, optional): If true, only report what would be done (default: false)

**Response:**
```json
{
  "status": "success" | "dry_run" | "no_data",
  "cutoff_date": "2025-08-26T21:57:24.822290+00:00",
  "aggregates_created": 3,
  "aggregates_updated": 0,
  "entries_deleted": 1500,
  "months_processed": 3
}
```

**Error Response:**
```json
{
  "detail": "Error during cleanup: <error message>"
}
```

---

## 🎯 Best Practices

1. **Always Dry Run First**
   - Test with `dry_run=True` before actual cleanup
   - Review what will be processed
   - Verify cutoff date is correct

2. **Run Monthly**
   - Schedule cleanup for 1st of each month
   - Ensures complete monthly aggregates
   - Prevents database bloat

3. **Monitor Results**
   - Check admin action logs
   - Verify aggregates are created
   - Monitor database size

4. **Adjust as Needed**
   - Increase `keep_days` if more detailed data needed
   - Decrease if storage is tight
   - Balance based on token estimation needs

5. **Backup Before First Run**
   - Backup database before first cleanup
   - Verify aggregates are correct
   - Can restore if needed (though unlikely)

---

## 🔗 Related Documentation

- [Credits System Reference](../planning/CREDITS_SYSTEM_REFERENCE.md)
- [Credit Estimation Improvement Plan](../planning/CREDIT_ESTIMATION_IMPROVEMENT_PLAN.md)
- [Database Schema](../architecture/DATABASE.md)

---

## ✅ Implementation Checklist

- [x] Create `UsageLogMonthlyAggregate` model
- [x] Implement `cleanup_old_usage_logs()` function
- [x] Add admin endpoint for cleanup
- [x] Create database migration
- [x] Test dry-run functionality
- [x] Verify table creation
- [x] Document usage and best practices

---

**Last Updated:** November 2025  
**Maintainer:** Backend Team


