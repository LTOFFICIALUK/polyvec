# TimescaleDB Quick Start Guide

## TL;DR - What You Need to Know

1. **TimescaleDB = PostgreSQL + time-series extension**
2. **It's a separate service** (like Supabase, but self-hosted)
3. **Data lives in the database server**, NOT in your project files
4. **Local**: Use Docker (easiest)
5. **VPS**: Install PostgreSQL + TimescaleDB extension

---

## Local Setup (5 minutes)

### Step 1: Install Docker Desktop
- Download: https://www.docker.com/products/docker-desktop/
- Install and start Docker Desktop

### Step 2: Run Setup Script
```bash
bash database/setup.sh
```

This will:
- Start TimescaleDB in Docker
- Create the database
- Run migrations (create tables)

### Step 3: Create `.env.local`
```bash
# Copy example (if it exists) or create manually
cat > .env.local << EOF
DATABASE_URL=postgresql://polyvec:polyvec_dev_password@localhost:5432/polyvec
NEXT_PUBLIC_WEBSOCKET_SERVER_URL=ws://localhost:8080
WEBSOCKET_SERVER_HTTP_URL=http://localhost:8081
PLATFORM_FEE_WALLET_ADDRESS=0x97e656303F2e61cc87c9C94557e41c65c5c30691
EOF
```

### Step 4: Verify It Works
```bash
# Test connection
docker-compose exec timescaledb psql -U polyvec -d polyvec -c "SELECT version();"
```

You should see PostgreSQL version info.

---

## How It Works

### Architecture

```
Your Code (Next.js/WebSocket Service)
    ↓ (connects via DATABASE_URL)
TimescaleDB (PostgreSQL server)
    ↓ (stores data in)
Database Files (on disk, NOT in your project)
```

### What Lives Where

**In Your Project (Git-tracked)**:
- ✅ `database/migrations/` - SQL files to create tables
- ✅ `docker-compose.yml` - Local setup config
- ✅ `.env.local` - Connection string (NOT in git)

**In Database Server (NOT in your project)**:
- ❌ Actual price history data
- ❌ Database files

**Moving to VPS**:
- Export data from local → Import to VPS
- OR: Start fresh (if no critical data yet)

---

## VPS Migration

### Option 1: Fresh Start (Easiest)

If you're just starting and don't have important data:

1. **On VPS, install PostgreSQL + TimescaleDB**:
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql postgresql-contrib
   
   # Install TimescaleDB (follow official docs)
   # https://docs.timescale.com/install/latest/self-hosted/
   ```

2. **Create database**:
   ```bash
   sudo -u postgres psql
   CREATE DATABASE polyvec;
   CREATE USER polyvec WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE polyvec TO polyvec;
   \q
   ```

3. **Run migrations**:
   ```bash
   psql -U polyvec -d polyvec -f database/migrations/001_create_price_history.sql
   ```

4. **Update `.env.local` on VPS**:
   ```env
   DATABASE_URL=postgresql://polyvec:secure_password@localhost:5432/polyvec
   ```

### Option 2: Migrate Existing Data

If you have data to keep:

1. **Export from local**:
   ```bash
   docker-compose exec timescaledb pg_dump -U polyvec polyvec > backup.sql
   ```

2. **Transfer to VPS**:
   ```bash
   scp backup.sql user@your-vps:/path/to/project/
   ```

3. **Import on VPS**:
   ```bash
   psql -U polyvec -d polyvec < backup.sql
   ```

---

## Common Questions

### Q: Does the database live in my project files?
**A:** No. It's a separate service. Data is stored in Docker volumes (local) or PostgreSQL data directory (VPS).

### Q: Can I just clone the repo and have the database?
**A:** No. You need to:
1. Start the database server (Docker locally, or install on VPS)
2. Run migrations to create tables
3. Set up connection string in `.env.local`

### Q: What if I delete my project folder?
**A:** 
- **Local (Docker)**: Data survives in Docker volume (unless you delete it)
- **VPS**: Data survives in PostgreSQL data directory

### Q: How do I backup?
**A:** 
```bash
# Local
docker-compose exec timescaledb pg_dump -U polyvec polyvec > backup.sql

# VPS
pg_dump -U polyvec polyvec > backup.sql
```

### Q: How is this different from Supabase?
**A:**
- **Supabase**: Managed cloud service, you just get a connection string
- **TimescaleDB**: Self-hosted, you manage the server (but get more control)

---

## Next Steps

Once database is running:

1. ✅ Database is set up
2. ⏳ Update WebSocket service to record price data
3. ⏳ Create API endpoint to fetch historical data
4. ⏳ Update chart to pre-populate with history

---

## Troubleshooting

**"Connection refused"**
- Check Docker is running: `docker ps`
- Check container is up: `docker-compose ps`

**"Password authentication failed"**
- Check `.env.local` has correct password
- Default: `polyvec_dev_password`

**"Extension timescaledb does not exist"**
- Run: `docker-compose exec timescaledb psql -U polyvec -d polyvec -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"`

