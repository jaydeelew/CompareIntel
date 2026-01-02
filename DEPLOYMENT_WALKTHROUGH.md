# Complete Deployment Walkthrough - Redis Rate Limiting

Follow these steps **one at a time** to deploy the distributed rate limiting system.

---

## 📋 Pre-Deployment Checklist

Before starting, ensure you have:
- [ ] SSH access to your production server
- [ ] Git access to pull latest code
- [ ] Docker and Docker Compose installed
- [ ] Access to edit `backend/.env` file

---

## Step 1: Connect to Production Server

```bash
ssh ubuntu@your-server-ip
# or however you connect to your server
```

**Verify you're in the right directory:**
```bash
pwd
# Should show: /home/ubuntu/CompareIntel (or similar)
```

**If not in the right directory:**
```bash
cd ~/CompareIntel
```

---

## Step 2: Pull Latest Code

```bash
git status
# Check current branch and any uncommitted changes

git pull origin main
# or: git pull origin master (depending on your main branch name)
```

**Expected output:**
```
Updating abc1234..def5678
Fast-forward
 backend/app/search/distributed_rate_limiter.py | 542 ++++++++++
 backend/app/search/rate_limiter.py            |  45 +-
 ...
```

**Verify new files exist:**
```bash
ls -la backend/app/search/distributed_rate_limiter.py
# Should show the file exists
```

---

## Step 3: Check Current Docker Compose File

Identify which docker-compose file you're using:

```bash
ls -la docker-compose*.yml
```

**Common files:**
- `docker-compose.ssl.yml` - Production with SSL
- `docker-compose.prod.yml` - Production without SSL
- `docker-compose.yml` - Development

**Note which file you use** - you'll need it in later steps.

**Verify Redis service was added:**
```bash
grep -A 5 "redis:" docker-compose.ssl.yml
# or docker-compose.prod.yml (whichever you use)
```

**Expected:** Should show Redis service configuration.

---

## Step 4: Backup Current Environment File

**Safety first - backup your current .env:**

```bash
cp backend/.env backend/.env.backup.$(date +%Y%m%d_%H%M%S)
```

**Verify backup:**
```bash
ls -la backend/.env.backup*
# Should show your backup file
```

---

## Step 5: Update Environment Variables

**Open the .env file:**
```bash
nano backend/.env
# or: vi backend/.env
# or: vim backend/.env
```

**Add these lines** (or update if they exist):

```bash
# ============================================================================
# Redis Configuration for Distributed Rate Limiting
# ============================================================================
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379/0

# ============================================================================
# Search Rate Limiting Settings
# ============================================================================
# These are conservative defaults - adjust if needed
SEARCH_RATE_LIMIT_PER_MINUTE=3
SEARCH_MAX_CONCURRENT=2
SEARCH_DELAY_BETWEEN_REQUESTS=3.0

# ============================================================================
# Circuit Breaker (enabled by default)
# ============================================================================
SEARCH_CIRCUIT_BREAKER_ENABLED=true

# ============================================================================
# Cache Settings (enabled by default)
# ============================================================================
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_SECONDS=300
```

**Save the file:**
- **Nano:** `Ctrl+X`, then `Y`, then `Enter`
- **Vi/Vim:** `:wq` then `Enter`

**Verify the changes:**
```bash
grep -E "REDIS|SEARCH" backend/.env
```

**Expected:** Should show all the variables you just added.

---

## Step 6: Stop Current Services

**Stop all running containers:**

```bash
# Replace docker-compose.ssl.yml with your actual file name
docker compose -f docker-compose.ssl.yml down

# Or if you use a different file:
# docker compose -f docker-compose.prod.yml down
```

**Wait for shutdown** (usually 10-30 seconds).

**Verify containers are stopped:**
```bash
docker ps
# Should show no containers (or only unrelated ones)
```

---

## Step 7: Rebuild and Start Services

**Rebuild with new dependencies and start:**

```bash
# Replace docker-compose.ssl.yml with your actual file name
docker compose -f docker-compose.ssl.yml up -d --build

# This will:
# 1. Pull Redis image (first time only)
# 2. Install Redis Python client in backend
# 3. Start Redis service
# 4. Start backend (waiting for Redis)
# 5. Start frontend/nginx
```

**Wait 60-90 seconds** for all services to start.

**Monitor startup:**
```bash
docker compose -f docker-compose.ssl.yml logs -f
# Press Ctrl+C to stop watching after services start
```

---

## Step 8: Verify Services Are Running

**Check all containers are up:**
```bash
docker ps
```

**Expected output:**
```
CONTAINER ID   IMAGE                    STATUS
abc123...      redis:7-alpine          Up 30 seconds (healthy)
def456...      compareintel-backend    Up 25 seconds
ghi789...      compareintel-frontend   Up 20 seconds
jkl012...      nginx:1.25              Up 15 seconds
```

**Key check:** Redis should show `(healthy)` status.

**If Redis is not healthy:**
```bash
docker compose -f docker-compose.ssl.yml logs redis
# Check for errors
```

---

## Step 9: Verify Redis Connection

**Check backend connected to Redis:**

```bash
docker compose -f docker-compose.ssl.yml logs backend | grep -i redis
```

**Expected output:**
```
✅ Redis client created - will test connection on first use
🚀 Initialized DISTRIBUTED search rate limiter with Redis: 3 req/min, 2 concurrent, 3.0s delay. Cache: enabled. Circuit breaker: enabled.
```

**If you see:**
- `🔧 Initialized search rate limiter (per-worker)` - Redis not connected
- `Failed to initialize Redis` - Check Redis URL

**Test Redis directly:**
```bash
docker compose -f docker-compose.ssl.yml exec redis redis-cli ping
```

**Expected:** `PONG`

**If not PONG:**
- Check Redis container: `docker compose -f docker-compose.ssl.yml ps redis`
- Check Redis logs: `docker compose -f docker-compose.ssl.yml logs redis`

---

## Step 10: Verify Rate Limiter Initialization

**Check rate limiter initialized correctly:**

```bash
docker compose -f docker-compose.ssl.yml logs backend | grep "rate limiter"
```

**Expected:**
```
🚀 Initialized DISTRIBUTED search rate limiter with Redis: ...
```

**If you see "per-worker" instead:**
- Redis is not connected
- Go back to Step 9 and troubleshoot

---

## Step 11: Test Search Functionality

**Make a test search request:**

1. **Via your application:** Go to your site and trigger a comparison with web search
2. **Or wait:** For a real user request to come in

**Monitor logs in real-time:**
```bash
docker compose -f docker-compose.ssl.yml logs -f backend | grep -E "(🔍|✅|⏸️|🚀|❌)"
```

**Expected logs:**
- `🔍 Preparing search request` - Request starting
- `✅ Acquired rate limiter slot` - Rate limiter allowing request
- `🚀 Rate limiter slot acquired, executing search` - Search executing
- `✅ Search completed successfully` - Search succeeded
- `✅ Cache HIT` - Cache working (after first request)

**Good signs:**
- ✅ No `429` errors
- ✅ See rate limiter activity logs
- ✅ Cache hits on duplicate queries

---

## Step 12: Monitor for Issues

**Watch logs for 5-10 minutes:**

```bash
docker compose -f docker-compose.ssl.yml logs -f backend
```

**What to watch for:**
- ✅ `✅ Acquired rate limiter slot` - Normal operation
- ⚠️ `⏸️ Rate limit reached` - Normal under load, but should queue requests
- ❌ `🚫 Circuit breaker OPEN` - API unavailable (should be rare)
- ❌ Frequent `429` errors - Limits may need adjustment

**If you see issues:**
- See Troubleshooting section below

---

## Step 13: Verify Redis Data Storage

**Check Redis is storing rate limit data:**

```bash
docker compose -f docker-compose.ssl.yml exec redis redis-cli
```

**Inside Redis CLI, run:**
```redis
KEYS rate_limit:*
```

**Expected:** Should see keys like:
```
1) "rate_limit:brave:minute:1234567890"
2) "rate_limit:brave:concurrent"
```

**Check a key value:**
```redis
GET rate_limit:brave:concurrent
```

**Exit Redis CLI:**
```redis
exit
```

---

## Step 14: Final Verification

**Run this checklist:**

```bash
# 1. Redis container running and healthy
docker ps | grep redis
# Should show: (healthy)

# 2. Backend using distributed rate limiter
docker compose -f docker-compose.ssl.yml logs backend | grep "DISTRIBUTED" | tail -1
# Should show: 🚀 Initialized DISTRIBUTED search rate limiter

# 3. Redis connection works
docker compose -f docker-compose.ssl.yml exec redis redis-cli ping
# Should return: PONG

# 4. Environment variables set correctly
docker compose -f docker-compose.ssl.yml exec backend env | grep REDIS
# Should show: REDIS_ENABLED=true and REDIS_URL=redis://redis:6379/0
```

**All checks pass?** ✅ **Deployment successful!**

---

## 🔧 Troubleshooting

### Issue: Redis container won't start

**Check logs:**
```bash
docker compose -f docker-compose.ssl.yml logs redis
```

**Common causes:**
- Port conflict (unlikely in Docker)
- Volume permission issues
- Insufficient memory

**Fix:** Check Docker has enough resources:
```bash
docker system df
free -h
```

---

### Issue: Backend can't connect to Redis

**Symptoms:**
- Backend logs show "per-worker" rate limiter
- No Redis connection messages

**Debug steps:**

1. **Check Redis is running:**
```bash
docker ps | grep redis
```

2. **Check Redis is healthy:**
```bash
docker compose -f docker-compose.ssl.yml exec redis redis-cli ping
```

3. **Check backend can reach Redis:**
```bash
docker compose -f docker-compose.ssl.yml exec backend ping -c 3 redis
```

4. **Check environment variables:**
```bash
docker compose -f docker-compose.ssl.yml exec backend env | grep REDIS
```

**Should show:**
```
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379/0
```

**If variables missing:**
- Check `.env` file has correct values
- Restart backend: `docker compose -f docker-compose.ssl.yml restart backend`

---

### Issue: Still getting 429 errors

**Check current limits:**
```bash
docker compose -f docker-compose.ssl.yml logs backend | grep "req/min"
```

**If limits are too high, adjust in `.env`:**
```bash
nano backend/.env
# Change:
SEARCH_RATE_LIMIT_PER_MINUTE=2  # Lower from 3
SEARCH_DELAY_BETWEEN_REQUESTS=5.0  # Increase from 3.0
```

**Restart backend:**
```bash
docker compose -f docker-compose.ssl.yml restart backend
```

---

### Issue: Want to rollback

**Quick rollback (disable Redis):**

1. Edit `.env`:
```bash
nano backend/.env
# Change: REDIS_ENABLED=false
```

2. Restart backend:
```bash
docker compose -f docker-compose.ssl.yml restart backend
```

System will use improved in-memory rate limiting (still better than before).

---

## 📊 Monitoring Commands

**Watch rate limiting activity:**
```bash
docker compose -f docker-compose.ssl.yml logs -f backend | grep -E "(✅|⏸️|🚀|🚫)"
```

**Check Redis memory usage:**
```bash
docker compose -f docker-compose.ssl.yml exec redis redis-cli INFO memory | grep used_memory_human
```

**Check rate limit statistics:**
```bash
docker compose -f docker-compose.ssl.yml logs backend | grep "rate limit" | tail -20
```

---

## ✅ Success Criteria

After deployment, you should have:

- ✅ Redis container running and healthy
- ✅ Backend using distributed rate limiter (not per-worker)
- ✅ Search requests working without frequent 429 errors
- ✅ Rate limiting logs showing coordination
- ✅ Cache working (cache hits on duplicate queries)
- ✅ Circuit breaker active (if API fails)

---

## 🎉 Next Steps

After successful deployment:

1. **Monitor for 24-48 hours** to ensure stability
2. **Review logs** periodically for any issues
3. **Adjust limits** if needed based on API behavior
4. **Consider** provider-specific limits if using multiple search providers

---

## 📞 Need Help?

If you encounter issues:

1. Check the detailed guide: `docs/deployment/REDIS_DEPLOYMENT_GUIDE.md`
2. Review logs: `docker compose -f docker-compose.ssl.yml logs backend`
3. Check Redis: `docker compose -f docker-compose.ssl.yml logs redis`
4. Verify config: `docker compose -f docker-compose.ssl.yml config`

---

**You're all set!** The distributed rate limiting system is now deployed and ready to coordinate search requests across all your workers. 🚀
