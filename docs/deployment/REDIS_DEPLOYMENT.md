# Redis Deployment Guide

This guide covers deploying the distributed rate limiting system with Redis support.

## Prerequisites

- Docker and Docker Compose installed
- Access to the production server
- SSH key configured

## Deployment Steps

### 1. Pull Latest Code

```bash
cd /home/ubuntu/compareintel
git pull origin master
```

### 2. Update Environment Variables

Add these to `backend/.env`:

```
REDIS_URL=redis://redis:6379/0
REDIS_ENABLED=true
```

### 3. Verify Docker Compose Configuration

Check that `docker-compose.prod.yml` includes the Redis service:

```yaml
redis:
  image: redis:7-alpine
  restart: unless-stopped
  mem_limit: 96m
  mem_reservation: 32m
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "3"
  volumes:
    - redis_data:/data
  command: redis-server --appendonly yes --maxmemory 64mb --maxmemory-policy volatile-lru
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

`volatile-lru` is the safe eviction policy for this workload: search cache, anonymous credit keys, and per-minute rate-limit keys all have TTLs (so they can be evicted under pressure), while the tiny concurrent-slot counters have no TTL and must not disappear (a Redis `DECR` on a missing key would go negative). Expected usage is well under 10 MB; 64 MB leaves headroom on the 2 GB host.

### 4. Deploy Services

```bash
# Stop existing services
docker-compose -f docker-compose.prod.yml down

# Start services with Redis
docker-compose -f docker-compose.prod.yml up -d

# Verify all services are running
docker-compose -f docker-compose.prod.yml ps
```

### 5. Verify Redis Connection

```bash
# Check Redis is responding
docker exec compareintel-redis redis-cli ping
# Expected output: PONG

# Check backend can connect
docker logs compareintel-backend 2>&1 | grep -i redis
```

### 6. Test Rate Limiting

Make a test search request and verify rate limiting is working across workers.

## Monitoring

### Check Redis Status

```bash
docker exec compareintel-redis redis-cli info
```

### View Rate Limiter State

```bash
docker exec compareintel-redis redis-cli keys "*rate*"
```

### View Logs

```bash
docker logs compareintel-backend --tail 100
docker logs compareintel-redis --tail 100
```

## Troubleshooting

### Redis Connection Failed

1. Verify Redis container is running: `docker ps | grep redis`
2. Check Redis logs: `docker logs compareintel-redis`
3. Verify `REDIS_URL` in environment variables
4. Ensure Redis is on the same Docker network

### Rate Limiting Not Working

1. Check `REDIS_ENABLED=true` in environment
2. Verify backend logs show Redis initialization
3. Test Redis connectivity from backend container

### High Memory Usage

Redis stores rate limit state and cache entries in memory. If memory usage is high:

1. Check TTL on keys: `docker exec compareintel-redis redis-cli ttl <key>`
2. View memory usage: `docker exec compareintel-redis redis-cli info memory`
3. Confirm `maxmemory-policy` is `volatile-lru` so only expiring keys are evicted`

## Rollback

If issues occur, disable Redis by setting:

```
REDIS_ENABLED=false
```

The system will fall back to in-memory rate limiting (per-worker, not distributed).
