# PolyVec

## 🚀 Quick Start

**First time setup or after computer restart?** See [STARTUP_CHECKLIST.md](./STARTUP_CHECKLIST.md) for complete step-by-step instructions.

**Quick automated startup:**
```bash
bash scripts/startup.sh
```

This will:
1. Start TimescaleDB (Docker)
2. Build and start WebSocket service (port 8081)
3. Start Next.js frontend (port 3000)
4. Verify all services are running

Then open: http://localhost:3000

---

## Manual Startup

If you prefer to start services manually, see [guide/START_SERVERS.md](./guide/START_SERVERS.md)

---

## Documentation

- **[STARTUP_CHECKLIST.md](./STARTUP_CHECKLIST.md)** - Complete startup guide (for Cursor AI and humans)
- **[guide/START_SERVERS.md](./guide/START_SERVERS.md)** - Manual server startup guide
- **[database/QUICK_START.md](./database/QUICK_START.md)** - Database setup guide
