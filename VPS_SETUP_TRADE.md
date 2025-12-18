# VPS Setup for Trade Submission

## Quick Setup Guide

### 1. SSH into your VPS
```bash
ssh root@206.189.70.100
```

### 2. Navigate to your project directory
```bash
# Assuming your project is in a directory like:
cd /root/PolyTrade-Rug  # or wherever your project is
```

### 3. Go to ws-service directory
```bash
cd ws-service
```

### 4. Build the service (if not already built)
```bash
npm install
npm run build
```

### 5. Start the service
```bash
# For development (will show logs):
npm run dev

# OR for production (background):
nohup npm start > ws-service.log 2>&1 &
```

### 6. Check if it's running
```bash
# Check if port 8081 is listening:
netstat -tuln | grep 8081
# OR
ss -tuln | grep 8081

# Check if the process is running:
ps aux | grep "node.*index.js"
```

### 7. Test the health endpoint
```bash
curl http://localhost:8081/health
# Should return JSON with service status
```

### 8. Open firewall port (if needed)
If the port isn't accessible from outside:

```bash
# Ubuntu/Debian with ufw:
sudo ufw allow 8081/tcp
sudo ufw reload

# CentOS/RHEL with firewalld:
sudo firewall-cmd --permanent --add-port=8081/tcp
sudo firewall-cmd --reload

# Or check iptables:
sudo iptables -L -n | grep 8081
```

### 9. Test from your local machine
From your local computer (not SSH'd into VPS):
```bash
curl http://206.189.70.100:8081/health
```

## Running as a Service (Recommended for Production)

Create a systemd service to keep it running:

```bash
sudo nano /etc/systemd/system/ws-service.service
```

Add this content:
```ini
[Unit]
Description=PolyTrade WebSocket Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/PolyTrade-Rug/ws-service
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=HTTP_PORT=8081

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ws-service
sudo systemctl start ws-service
sudo systemctl status ws-service
```

## Troubleshooting

### Service not responding
1. Check if it's running: `ps aux | grep node`
2. Check logs: `tail -f ws-service.log` or `journalctl -u ws-service -f`
3. Check port: `netstat -tuln | grep 8081`

### Port not accessible
1. Check firewall: `sudo ufw status` or `sudo firewall-cmd --list-all`
2. Check if service is binding to correct interface:
   - Should bind to `0.0.0.0:8081` (all interfaces), not `127.0.0.1:8081` (localhost only)

### Environment variables
Make sure the ws-service has access to any required environment variables in `.env` file:
```bash
cd ws-service
cat .env  # Check environment variables
```

