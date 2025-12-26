# VPS TimescaleDB Setup Guide

**For Cursor AI**: Follow this guide step-by-step when setting up TimescaleDB on a VPS via SSH.

---

## Prerequisites

- VPS with Ubuntu/Debian Linux
- SSH access to VPS
- Sudo/root access

---

## Step 1: Install PostgreSQL

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Verify installation
sudo systemctl status postgresql
```

**Expected output**: PostgreSQL service should be "active (running)"

---

## Step 2: Install TimescaleDB Extension

```bash
# Add TimescaleDB repository
sudo sh -c "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"

# Add GPG key
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo apt-key add -

# Update package list
sudo apt update

# Install TimescaleDB
sudo apt install -y timescaledb-2-postgresql-16

# Tune PostgreSQL for TimescaleDB
sudo timescaledb-tune --quiet --yes
```

**Note**: If PostgreSQL version is different (check with `psql --version`), adjust package name:
- PostgreSQL 15: `timescaledb-2-postgresql-15`
- PostgreSQL 14: `timescaledb-2-postgresql-14`

---

## Step 3: Configure PostgreSQL

```bash
# Edit PostgreSQL config to enable TimescaleDB
sudo nano /etc/postgresql/16/main/postgresql.conf
```

**Add this line** (or uncomment if exists):
```
shared_preload_libraries = 'timescaledb'
```

**Save and exit** (Ctrl+X, then Y, then Enter)

```bash
# Restart PostgreSQL
sudo systemctl restart postgresql

# Verify it's running
sudo systemctl status postgresql
```

---

## Step 4: Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# Inside PostgreSQL prompt, run:
CREATE DATABASE polyvec;
CREATE USER polyvec WITH PASSWORD 'CHANGE_THIS_TO_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE polyvec TO polyvec;
\q
```

**Important**: Replace `CHANGE_THIS_TO_SECURE_PASSWORD` with a strong password.

---

## Step 5: Enable TimescaleDB Extension

```bash
# Connect to database
sudo -u postgres psql -d polyvec

# Inside PostgreSQL prompt, run:
CREATE EXTENSION IF NOT EXISTS timescaledb;
\q
```

---

## Step 6: Run Migrations

```bash
# Navigate to project directory (where you cloned the repo)
cd /path/to/PolyVec-main

# Run migration
psql -U polyvec -d polyvec -f database/migrations/001_create_price_history.sql
```

**If prompted for password**: Enter the password you set in Step 4.

**Expected output**: Should see "CREATE EXTENSION", "CREATE TABLE", "create_hypertable", etc.

---

## Step 7: Configure Firewall (if needed)

```bash
# Allow PostgreSQL connections (if firewall is active)
sudo ufw allow 5432/tcp

# Or if using iptables
sudo iptables -A INPUT -p tcp --dport 5432 -j ACCEPT
```

**Note**: For local connections only, skip this step.

---

## Step 8: Update Environment Variables

On your VPS, create or update `.env.local`:

```bash
# In project root
nano .env.local
```

**Add**:
```env
DATABASE_URL=postgresql://polyvec:YOUR_PASSWORD_HERE@localhost:5432/polyvec
NEXT_PUBLIC_WEBSOCKET_SERVER_URL=ws://localhost:8080
WEBSOCKET_SERVER_HTTP_URL=http://localhost:8081
```

**Replace** `YOUR_PASSWORD_HERE` with the password from Step 4.

---

## Step 9: Verify Setup

```bash
# Test connection
psql -U polyvec -d polyvec -c "SELECT version();"

# Check if TimescaleDB extension is enabled
psql -U polyvec -d polyvec -c "SELECT * FROM pg_extension WHERE extname = 'timescaledb';"

# Check if price_history table exists
psql -U polyvec -d polyvec -c "\dt price_history"
```

**Expected**: Should see PostgreSQL version, TimescaleDB extension, and price_history table.

---

## Step 10: (Optional) Migrate Data from Local

If you have existing data on your local machine:

### On Local Machine:
```bash
# Export database
docker-compose exec timescaledb pg_dump -U polyvec polyvec > backup.sql

# Transfer to VPS
scp backup.sql user@your-vps-ip:/path/to/PolyVec-main/
```

### On VPS:
```bash
# Import database
psql -U polyvec -d polyvec < backup.sql
```

---

## Troubleshooting

### "Extension timescaledb does not exist"
```bash
sudo -u postgres psql -d polyvec -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

### "Password authentication failed"
- Check `.env.local` has correct password
- Verify user exists: `sudo -u postgres psql -c "\du"`

### "Connection refused"
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Check PostgreSQL is listening: `sudo netstat -tlnp | grep 5432`

### "Permission denied"
- Make sure user has privileges: `sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE polyvec TO polyvec;"`

---

## Quick Reference Commands

```bash
# Start PostgreSQL
sudo systemctl start postgresql

# Stop PostgreSQL
sudo systemctl stop postgresql

# Restart PostgreSQL
sudo systemctl restart postgresql

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# Connect to database
psql -U polyvec -d polyvec

# Backup database
pg_dump -U polyvec polyvec > backup.sql

# Restore database
psql -U polyvec polyvec < backup.sql
```

---

## Security Notes

1. **Change default password** - Use a strong password in Step 4
2. **Firewall** - Only allow PostgreSQL connections from trusted IPs
3. **SSL** - For production, enable SSL connections in PostgreSQL
4. **Backups** - Set up automated backups for production data

---

## Next Steps

After database is set up:
1. ✅ Database is running
2. ⏳ Update WebSocket service to record price data
3. ⏳ Create API endpoint to fetch historical data
4. ⏳ Update chart to pre-populate with history

