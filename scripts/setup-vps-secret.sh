#!/bin/bash

# Script to set TRADING_KEY_SECRET on VPS
# Run this on your VPS or use the commands manually

TRADING_KEY_SECRET="a18192d1f072a905a934c3c6f486fe62aadcfc0abc18fdc1098a62d27257d1db"

echo "🔐 Setting TRADING_KEY_SECRET on VPS"
echo "====================================="
echo ""

echo "Option 1: Add to .bashrc (persistent for user)"
echo "Run: echo 'export TRADING_KEY_SECRET=$TRADING_KEY_SECRET' >> ~/.bashrc"
echo "Then: source ~/.bashrc"
echo ""

echo "Option 2: Add to systemd service (if running as service)"
echo "Edit your service file and add:"
echo "Environment=\"TRADING_KEY_SECRET=$TRADING_KEY_SECRET\""
echo ""

echo "Option 3: Add to .env file in app directory"
echo "Run: echo 'TRADING_KEY_SECRET=$TRADING_KEY_SECRET' >> /path/to/your/app/.env"
echo ""

echo "Option 4: Export for current session"
echo "Run: export TRADING_KEY_SECRET=$TRADING_KEY_SECRET"
echo ""

echo "To verify, run:"
echo "echo \$TRADING_KEY_SECRET"

