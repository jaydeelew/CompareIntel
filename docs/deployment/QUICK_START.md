# Quick Start - Redis Deployment

## 🚀 Fast Deployment (5 minutes)

### 1. Pull Latest Code
```bash
cd ~/CompareIntel
git pull
```

### 2. Update Environment Variables
```bash
# Edit backend/.env file
nano backend/.env
```

Add these lines:
```bash
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379/0
```

Save: `Ctrl+X`, then `Y`, then `Enter`

### 3. Deploy
```bash
# Stop services
docker compose -f docker-compose.ssl.yml down

# Rebuild and start
docker compose -f docker-compose.ssl.yml up -d --build
```

### 4. Verify
```bash
# Check Redis is running
docker ps | grep redis

# Check backend connected to Redis
docker compose -f docker-compose.ssl.yml logs backend | grep "DISTRIBUTED"
```

**Expected:** You should see `🚀 Initialized DISTRIBUTED search rate limiter with Redis`

### 5. Test
Make a search request and check logs:
```bash
docker compose -f docker-compose.ssl.yml logs -f backend | grep -E "(search|rate)"
```

---

## ✅ Success Indicators

- ✅ Redis container running (`docker ps | grep redis`)
- ✅ Backend logs show "DISTRIBUTED search rate limiter"
- ✅ Search requests work without 429 errors
- ✅ See `✅ Acquired rate limiter slot` in logs

---

## ❌ Troubleshooting

**Redis not connecting?**
```bash
# Check Redis is healthy
docker compose -f docker-compose.ssl.yml exec redis redis-cli ping
# Should return: PONG

# Check environment variable
docker compose -f docker-compose.ssl.yml exec backend env | grep REDIS
# Should show: REDIS_URL=redis://redis:6379/0
```

**Still seeing "per-worker" rate limiter?**
- Verify `.env` file has `REDIS_ENABLED=true`
- Restart backend: `docker compose -f docker-compose.ssl.yml restart backend`

---

For detailed instructions, see [REDIS_DEPLOYMENT_GUIDE.md](./REDIS_DEPLOYMENT_GUIDE.md)
