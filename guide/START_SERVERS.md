# How to Start PolyTrade Servers

Simple step-by-step guide to start both servers.

## Step 1: Check if Ports Are Already in Use

Open Terminal and run:

```bash
lsof -i :8081
lsof -i :3000
```

**If you see output:**
- Copy the **PID number** (the number in the second column)
- Run: `kill -9 <PID>` (replace `<PID>` with the number you copied)
- Repeat for each process

**If you see no output:**
- Ports are free, continue to Step 2

---

## Step 2: Start the WebSocket Service

Open a **new Terminal window** and run:

```bash
cd /Users/lukecarter/Downloads/PolyTrade-main/ws-service
HTTP_PORT=8081 npm run dev
```

**Wait until you see:**
- `[Server] HTTP server listening on http://localhost:8081`
- `[Server] WebSocket server listening on ws://localhost:8081/ws`

**Keep this terminal window open.**

---

## Step 3: Start Next.js

Open **another new Terminal window** and run:

```bash
cd /Users/lukecarter/Downloads/PolyTrade-main
npm run dev
```

**Wait until you see:**
- `✓ Ready in X seconds`
- `○ Local: http://localhost:3000`

**Keep this terminal window open.**

---

## Step 4: Verify Everything Works

Open your browser and go to:

```
http://localhost:3000
```

You should see the PolyTrade homepage.

---

## Quick Troubleshooting

**If port 8081 is busy:**
```bash
lsof -i :8081
kill -9 <PID>
```

**If port 3000 is busy:**
```bash
lsof -i :3000
kill -9 <PID>
```

**To check if servers are running:**
```bash
curl http://localhost:8081/health
curl http://localhost:3000
```

---

## Summary

You need **2 terminal windows**:

1. **Terminal 1** - WebSocket Service:
   ```bash
   cd /Users/lukecarter/Downloads/PolyTrade-main/ws-service
   HTTP_PORT=8081 npm run dev
   ```

2. **Terminal 2** - Next.js:
   ```bash
   cd /Users/lukecarter/Downloads/PolyTrade-main
   npm run dev
   ```

Then open: `http://localhost:3000` in your browser.

