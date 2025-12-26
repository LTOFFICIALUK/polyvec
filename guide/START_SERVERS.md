# How to Start PolyVec Servers

Simple step-by-step guide. Copy and paste each command exactly as shown.

---

## Step 1: Check and Kill Any Running Servers

Open Terminal and copy/paste these commands one at a time:

```bash
lsof -i :8081
```

**If you see output with numbers:**
- Look for the number in the second column (the PID)
- Copy this command and replace `XXXX` with that number:
```bash
kill -9 XXXX
```

Then check port 3000:
```bash
lsof -i :3000
```

**If you see output with numbers:**
- Look for the number in the second column (the PID)
- Copy this command and replace `XXXX` with that number:
```bash
kill -9 XXXX
```

**If you see "no matching processes" or nothing:**
- Ports are free, continue to Step 2

---

## Step 2: Start WebSocket Service

Open a **new Terminal window** (keep the old one open or close it).

Copy and paste these commands one at a time:

```bash
cd /Users/lukecarter/Downloads/PolyVec-main/ws-service
```

```bash
HTTP_PORT=8081 npm run dev
```

**Wait until you see these messages:**
- `[Server] HTTP server listening on http://localhost:8081`
- `[Server] WebSocket server listening on ws://localhost:8081/ws`

**Important:** Keep this terminal window open and running.

---

## Step 3: Start Next.js (Frontend)

Open **another new Terminal window**.

Copy and paste these commands one at a time:

```bash
cd /Users/lukecarter/Downloads/PolyVec-main
```

```bash
npm run dev
```

**Wait until you see:**
- `✓ Ready in X seconds`
- `○ Local: http://localhost:3000`

**Important:** Keep this terminal window open and running.

---

## Step 4: Open in Browser

Open your web browser and go to:

```
http://localhost:3000
```

You should see the PolyVec homepage.

---

## Troubleshooting

### Port 8081 is busy?

Copy and paste these commands:

```bash
lsof -i :8081
```

Find the PID number (second column), then:

```bash
kill -9 XXXX
```
(Replace XXXX with the PID number)

### Port 3000 is busy?

Copy and paste these commands:

```bash
lsof -i :3000
```

Find the PID number (second column), then:

```bash
kill -9 XXXX
```
(Replace XXXX with the PID number)

### Check if servers are running?

Copy and paste:

```bash
curl http://localhost:8081/health
```

Should show: `{"status":"ok"}`

```bash
curl http://localhost:3000
```

Should show HTML (lots of text).

---

## Quick Reference

**You need 2 terminal windows:**

**Terminal 1 - WebSocket Service:**
   ```bash
   cd /Users/lukecarter/Downloads/PolyVec-main/ws-service
   HTTP_PORT=8081 npm run dev
   ```

**Terminal 2 - Next.js Frontend:**
   ```bash
   cd /Users/lukecarter/Downloads/PolyVec-main
   npm run dev
   ```

Then open: `http://localhost:3000` in your browser.

---

## Notes

- Copy commands exactly as shown (including the `cd` commands)
- Don't copy the `bash` part - that's just showing it's a bash command
- Keep both terminal windows open while using the app
- If you close a terminal, that server stops running
