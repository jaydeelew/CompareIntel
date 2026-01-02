# Redis Deployment Guide - Step by Step

This guide walks you through deploying the distributed rate limiting system with Redis support.

## Prerequisites

- Docker and Docker Compose installed
- Access to your production server
- Basic familiarity with environment variables

## Step-by-Step Deployment

### Step 1: Pull Latest Code

```bash
cd ~/CompareIntel
git pull origin main  # or your main branch
```

**Verify:** Check that these files exist:
- `backend/app/search/distributed_rate_limiter.py`
- `backend/requirements.txt` (should include `redis>=5.0.0`)

---

### Step 2: Update Environment Variables

Edit your `backend/.env` file:

```bash
nano backend/.env  # or use your preferred editor
```

**Add these lines** (or update if they exist):

```bash
# Redis Configuration for Distributed Rate Limiting
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379/0

# Rate Limiting Settings (optional - defaults are conservative)
SEARCH_RATE_LIMIT_PER_MINUTE=3
SEARCH_MAX_CONCURRENT=2
SEARCH_DELAY_BETWEEN_REQUESTS=3.0

# Circuit Breaker (enabled by default)
SEARCH_CIRCUIT_BREAKER_ENABLED=true

# Cache Settings (enabled by default)
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_SECONDS=300
```

**Save and exit** the file.

**Verify:** Run `cat backend/.env | grep REDIS` to confirm the variables are set.

---

### Step 3: Verify Docker Compose Files

The Redis service has been added to:
- `docker-compose.prod.yml`
- `docker-compose.ssl.yml`

**Verify:** Check that `docker-compose.ssl.yml` (or your production file) includes:

```yaml
services:
  redis:
    image: redis:7-alpine
    # ... rest of config
```

If you're using a different docker-compose file, add the Redis service manually (see below).

---

### Step 4: Stop Existing Services

```bash
# Stop current services (choose the file you use)
docker compose -f docker-compose.ssl.yml down

# Or if using different file:
# docker compose -f docker-compose.prod.yml down
```

**Wait** for all containers to stop completely.

**Verify:** Run `docker ps` - should show no running containers (or only unrelated ones).

---

### Step 5: Rebuild and Start Services

```bash
# Rebuild with new dependencies and start services
docker compose -f docker-compose.ssl.yml up -d --build

# Or if using different file:
# docker compose -f docker-compose.prod.yml up -d --build
```

This will:
1. Pull Redis image (if not already present)
2. Install Redis Python client in backend
3. Start Redis service
4. Start backend (waiting for Redis to be healthy)
5. Start frontend and nginx

**Wait** 30-60 seconds for all services to start.

**Verify:** Run `docker ps` - you should see:
- `redis` container running
- `backend-1` container running
- `frontend-1` container running (if applicable)
- `nginx-1` container running

---

### Step 6: Verify Redis Connection

Check backend logs for Redis connection:

```bash
docker compose -f docker-compose.ssl.yml logs backend | grep -i redis
```

**Expected output:**
```
✅ Redis client created - will test connection on first use
🚀 Initialized DISTRIBUTED search rate limiter with Redis: ...
```

**If you see errors:**
- Check Redis container: `docker compose -f docker-compose.ssl.yml ps redis`
- Check Redis logs: `docker compose -f docker-compose.ssl.yml logs redis`
- Verify Redis is healthy: `docker compose -f docker-compose.ssl.yml exec redis redis-cli ping`
  - Should return: `PONG`

---

### Step 7: Test Rate Limiter Initialization

Check that the distributed rate limiter initialized correctly:

```bash
docker compose -f docker-compose.ssl.yml logs backend | grep "rate limiter"
```

**Expected output:**
```
🚀 Initialized DISTRIBUTED search rate limiter with Redis: 3 req/min, 2 concurrent, 3.0s delay. Cache: enabled. Circuit breaker: enabled.
```

**If you see:**
- `🔧 Initialized search rate limiter (per-worker)` - Redis not connected, check Step 6
- `Failed to initialize Redis` - Check Redis URL in .env file

---

### Step 8: Test Search Functionality

Make a test request that triggers a search:

1. **Via your application UI:** Trigger a comparison with web search enabled
2. **Or via API:** Make a POST request to `/api/compare-stream` with search enabled

**Monitor logs:**
```bash
docker compose -f docker-compose.ssl.yml logs -f backend | grep -E "(search|rate|Redis)"
```

**Expected behavior:**
- See `🔍 Preparing search request` logs
- See `✅ Acquired rate limiter slot` logs
- See `✅ Search completed successfully` logs
- **No** `429` errors (or very few)

---

### Step 9: Monitor Rate Limiting

Watch for rate limiting activity:

```bash
docker compose -f docker-compose.ssl.yml logs -f backend | grep -E "(⏸️|✅|🚀|🚫)"
```

**What to look for:**
- `✅ Acquired rate limiter slot` - Requests being allowed
- `⏸️ Rate limit reached` - Requests being queued (normal under load)
- `🚫 Circuit breaker OPEN` - API unavailable (should be rare)
- `✅ Cache HIT` - Cache working (good!)

---

### Step 10: Verify Redis Data

Check that Redis is storing rate limit data:

```bash
docker compose -f docker-compose.ssl.yml exec redis redis-cli
```

Inside Redis CLI:
```redis
KEYS rate_limit:*
```

**Expected:** You should see keys like:
- `rate_limit:brave:minute:1234567890`
- `rate_limit:brave:concurrent`

**Exit Redis CLI:** Type `exit`

---

## Troubleshooting

### Issue: Redis container won't start

**Check:**
```bash
docker compose -f docker-compose.ssl.yml logs redis
```

**Common fixes:**
- Port conflict: Check if port 6379 is already in use
- Volume permissions: Ensure Docker has write access
- Memory: Redis needs at least 256MB available

---

### Issue: Backend can't connect to Redis

**Check:**
1. Redis container is running: `docker ps | grep redis`
2. Redis is healthy: `docker compose -f docker-compose.ssl.yml exec redis redis-cli ping`
3. Backend can reach Redis: `docker compose -f docker-compose.ssl.yml exec backend ping redis`
4. Environment variable: `docker compose -f docker-compose.ssl.yml exec backend env | grep REDIS`

**Fix:**
- Ensure `REDIS_URL=redis://redis:6379/0` (not `localhost`)
- Ensure both containers are on same network
- Restart backend: `docker compose -f docker-compose.ssl.yml restart backend`

---

### Issue: Still seeing "per-worker" rate limiter

**Check:**
```bash
docker compose -f docker-compose.ssl.yml exec backend env | grep REDIS
```

**Should show:**
```
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379/0
```

**If not set:**
- Check `.env` file exists and has correct values
- Restart backend: `docker compose -f docker-compose.ssl.yml restart backend`

---

### Issue: Rate limits still being exceeded

**Check current limits:**
```bash
docker compose -f docker-compose.ssl.yml logs backend | grep "req/min"
```

**Adjust if needed** in `.env`:
```bash
SEARCH_RATE_LIMIT_PER_MINUTE=2  # Lower limit
SEARCH_DELAY_BETWEEN_REQUESTS=5.0  # Longer delay
```

**Restart backend:**
```bash
docker compose -f docker-compose.ssl.yml restart backend
```

---

## Verification Checklist

After deployment, verify:

- [ ] Redis container is running (`docker ps | grep redis`)
- [ ] Backend logs show "DISTRIBUTED search rate limiter"
- [ ] Redis connection test passes (`redis-cli ping` returns `PONG`)
- [ ] Search requests work without errors
- [ ] Rate limiting logs appear (`✅ Acquired rate limiter slot`)
- [ ] Cache is working (`✅ Cache HIT` logs)
- [ ] No frequent 429 errors in logs

---

## Rollback Plan

If something goes wrong, you can rollback:

### Option 1: Disable Redis (Quick)

Edit `backend/.env`:
```bash
REDIS_ENABLED=false
```

Restart backend:
```bash
docker compose -f docker-compose.ssl.yml restart backend
```

System will use in-memory rate limiting (still improved).

### Option 2: Remove Redis Service

1. Stop services: `docker compose -f docker-compose.ssl.yml down`
2. Remove Redis from docker-compose file
3. Set `REDIS_ENABLED=false` in `.env`
4. Start services: `docker compose -f docker-compose.ssl.yml up -d`

---

## Performance Monitoring

### Check Redis Memory Usage

```bash
docker compose -f docker-compose.ssl.yml exec redis redis-cli INFO memory
```

Look for `used_memory_human` - should be < 50MB for rate limiting.

### Check Rate Limit Statistics

The rate limiter tracks statistics. Check logs for:
- Rate limit hits per provider
- Circuit breaker state changes
- Cache hit rates

---

## Next Steps

After successful deployment:

1. **Monitor for 24-48 hours** to ensure stability
2. **Adjust limits** if needed based on API behavior
3. **Review logs** periodically for any issues
4. **Consider** provider-specific limits if using multiple search providers

---

## Support

If you encounter issues:

1. Check logs: `docker compose -f docker-compose.ssl.yml logs backend`
2. Check Redis: `docker compose -f docker-compose.ssl.yml logs redis`
3. Verify configuration: `docker compose -f docker-compose.ssl.yml config`
4. Review this guide's troubleshooting section

---

## Summary

You've successfully deployed:
- ✅ Redis service for distributed coordination
- ✅ Distributed rate limiter across all workers
- ✅ Circuit breaker for API failures
- ✅ Enhanced caching and monitoring

The system is now production-ready with true distributed rate limiting!
