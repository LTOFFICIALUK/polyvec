# TimescaleDB Setup Guide

## What is TimescaleDB?

TimescaleDB is **PostgreSQL with a time-series extension**. Think of it like Supabase's underlying database, but optimized for time-series data (like price history).

### Key Differences from Supabase:
- **Supabase**: Managed cloud service, you get a connection string
- **TimescaleDB**: Self-hosted database server (runs on your machine/VPS)

### How It Works:
1. **Database Server**: Runs separately from your code (like a separate service)
2. **Connection String**: Your code connects to it via `postgresql://user:password@host:port/database`
3. **Data Storage**: Lives in the database server's data directory (NOT in your project files)
4. **Migration**: You export/import data when moving between environments

---

## Local Development Setup

### Prerequisites
- **Docker Desktop** installed ([Download here](https://www.docker.com/products/docker-desktop/))

### Step 1: Start TimescaleDB

```bash
# From project root
docker-compose up -d
```

This will:
- Download TimescaleDB image (first time only)
- Start database on `localhost:5432`
- Create database `polyvec` with user `polyvec`

### Step 2: Verify It's Running

```bash
# Check if container is running
docker ps

# View logs
docker-compose logs timescaledb

# Test connection
docker-compose exec timescaledb psql -U polyvec -d polyvec -c "SELECT version();"
```

### Step 3: Run Database Migrations

```bash
# Install database client (if needed)
npm install --save-dev pg

# Run migrations
npm run db:migrate
```

Or manually:

```bash
# Connect to database
docker-compose exec timescaledb psql -U polyvec -d polyvec

# Then run SQL from database/migrations/001_create_price_history.sql
```

### Step 4: Set Environment Variables

Create `.env.local` in project root:

```env
# Database connection (local development)
DATABASE_URL=postgresql://polyvec:polyvec_dev_password@localhost:5432/polyvec

# WebSocket service (existing)
NEXT_PUBLIC_WEBSOCKET_SERVER_URL=ws://localhost:8080
WEBSOCKET_SERVER_HTTP_URL=http://localhost:8081

# Platform fee wallet (for collecting 2.5% trading fees)
PLATFORM_FEE_WALLET_ADDRESS=0x97e656303F2e61cc87c9C94557e41c65c5c30691
```

---

## VPS Migration Guide

### What Needs to Move:

1. **Database Data** (the actual price history)
2. **Database Schema** (table structure)
3. **Connection String** (update environment variables)

### Option A: Fresh Start on VPS (Recommended for First Time)

If you're just starting and don't have critical data:

1. **Install PostgreSQL + TimescaleDB on VPS**:
   ```bash
   # On Ubuntu/Debian VPS
   sudo apt update
   sudo apt install postgresql postgresql-contrib
   
   # Install TimescaleDB extension
   # Follow: https://docs.timescale.com/install/latest/self-hosted/
   ```

2. **Create Database**:
   ```bash
   sudo -u postgres psql
   CREATE DATABASE polyvec;
   CREATE USER polyvec WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE polyvec TO polyvec;
   \q
   ```

3. **Run Migrations**:
   ```bash
   # From your project on VPS
   psql -U polyvec -d polyvec -f database/migrations/001_create_price_history.sql
   ```

4. **Update Environment Variables**:
   ```env
   DATABASE_URL=postgresql://polyvec:your_secure_password@localhost:5432/polyvec
   ```

### Option B: Migrate Existing Data

If you have data you want to keep:

1. **Export from Local**:
   ```bash
   # Export schema + data
   docker-compose exec timescaledb pg_dump -U polyvec polyvec > backup.sql
   
   # Or just data
   docker-compose exec timescaledb pg_dump -U polyvec -a polyvec > data_only.sql
   ```

2. **Transfer to VPS**:
   ```bash
   scp backup.sql user@your-vps:/path/to/project/
   ```

3. **Import on VPS**:
   ```bash
   # On VPS
   psql -U polyvec -d polyvec < backup.sql
   ```

---

## Database Structure

### Where Data Lives:

**Local (Docker)**:
- Docker volume: `timescaledb_data`
- Physical location: Managed by Docker Desktop
- **NOT in your project files**

**VPS**:
- PostgreSQL data directory: `/var/lib/postgresql/16/main/` (or similar)
- **NOT in your project files**

### What IS in Your Project:

- ✅ `database/migrations/` - SQL files to create tables
- ✅ `database/README.md` - This file
- ✅ `docker-compose.yml` - Local setup config
- ❌ **NOT the actual data** (that's in the database server)

---

## Common Commands

### Local Development

```bash
# Start database
docker-compose up -d

# Stop database
docker-compose down

# View logs
docker-compose logs -f timescaledb

# Connect to database
docker-compose exec timescaledb psql -U polyvec -d polyvec

# Backup database
docker-compose exec timescaledb pg_dump -U polyvec polyvec > backup.sql

# Restore database
docker-compose exec -T timescaledb psql -U polyvec polyvec < backup.sql
```

### VPS

```bash
# Connect to database
sudo -u postgres psql -d polyvec

# Backup
pg_dump -U polyvec polyvec > backup.sql

# Restore
psql -U polyvec polyvec < backup.sql
```

---

## Troubleshooting

### "Connection refused" error
- Make sure Docker container is running: `docker ps`
- Check port 5432 isn't used by another service

### "Password authentication failed"
- Check `.env.local` has correct password
- Default local password: `polyvec_dev_password`

### "Extension timescaledb does not exist"
- TimescaleDB extension needs to be enabled:
  ```sql
  CREATE EXTENSION IF NOT EXISTS timescaledb;
  ```

---

## Next Steps

1. ✅ Database is running
2. ✅ Run migrations to create tables
3. ✅ Update WebSocket service to record price data
4. ✅ Create API endpoint to fetch historical data
5. ✅ Update chart component to pre-populate with history

