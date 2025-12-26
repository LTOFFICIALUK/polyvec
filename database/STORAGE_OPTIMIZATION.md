# Storage Optimization Guide

## Current Data Growth

**Current Rate:**
- ~123 records/second
- ~7,380 records/minute  
- ~442,800 records/hour
- **~10.6 million records/day**

**Storage:**
- ~7 bytes per record
- **~74 MB/day**
- **~2.2 GB/month**
- **~26 GB/year** (uncompressed)

## Solutions Implemented

### 1. TimescaleDB Compression ✅
- **Enabled**: Compresses data older than 1 hour
- **Savings**: 90%+ reduction for old data
- **Impact**: Recent data (last hour) stays fast, old data compressed

### 2. Recording Frequency (Optional)
Currently recording every 1 second. Options:
- **Keep 1 second**: Best detail, more storage
- **Record every 5 seconds**: 80% less data, still very detailed
- **Record every 10 seconds**: 90% less data, good for charts

### 3. Data Retention (Optional)
- **No retention**: Keep all data forever (grows indefinitely)
- **90 days**: Auto-delete data older than 90 days (~6.6 GB max)
- **30 days**: Auto-delete data older than 30 days (~2.2 GB max)

## Recommendations

### For Development (Current)
✅ **Keep current setup** - compression handles old data

### For Production
1. **Enable compression** (already in migration)
2. **Consider 5-second recording** for long-term (optional)
3. **Enable 90-day retention** (uncomment in migration when ready)

## How to Apply

```bash
# Run optimization migration
docker-compose exec timescaledb psql -U polyvec -d polyvec -f database/migrations/002_optimize_storage.sql

# Or manually:
docker-compose exec timescaledb psql -U polyvec -d polyvec
# Then paste SQL from 002_optimize_storage.sql
```

## Monitoring Storage

```sql
-- Check current database size
SELECT pg_size_pretty(pg_database_size('polyvec'));

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('price_history'));

-- Check compression stats
SELECT 
  chunk_name,
  pg_size_pretty(before_compression_total_bytes) as before,
  pg_size_pretty(after_compression_total_bytes) as after,
  ROUND(100.0 * (before_compression_total_bytes - after_compression_total_bytes) / before_compression_total_bytes, 2) as compression_pct
FROM timescaledb_information.chunks
WHERE hypertable_name = 'price_history' 
  AND is_compressed = true;
```

## Changing Recording Frequency

If you want to record less frequently, edit `ws-service/src/index.ts`:

```typescript
// Change POLL_INTERVAL from 1000ms (1 second) to:
const POLL_INTERVAL = 5000  // 5 seconds (80% less data)
// or
const POLL_INTERVAL = 10000 // 10 seconds (90% less data)
```

**Note**: Chart will still work fine with 5-10 second intervals - still very smooth!

