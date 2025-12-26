#!/bin/bash

# Script to set up renewal reminder cron job on VPS
# This will configure the cron job to run daily

VPS_IP="${VPS_IP:-206.189.70.100}"
VPS_URL="${VPS_URL:-https://polyvec.com}"
CRON_SECRET="${CRON_SECRET}"

if [ -z "$CRON_SECRET" ]; then
  echo "ERROR: CRON_SECRET environment variable is required"
  exit 1
fi

echo "========================================="
echo "Setting up Renewal Reminder Cron Job"
echo "========================================="
echo ""
echo "VPS IP: ${VPS_IP}"
echo "Production URL: ${VPS_URL}"
echo ""

# Read the cron secret from .env.local if it exists
if [ -f .env.local ]; then
  ENV_CRON_SECRET=$(grep "^CRON_SECRET=" .env.local | cut -d'=' -f2)
  if [ ! -z "$ENV_CRON_SECRET" ]; then
    CRON_SECRET="$ENV_CRON_SECRET"
    echo "Using CRON_SECRET from .env.local"
  fi
fi

echo "CRON_SECRET: ${CRON_SECRET:0:10}..."
echo ""

# Create cron job command
CRON_COMMAND="0 9 * * * curl -X POST ${VPS_URL}/api/cron/send-renewal-reminders -H \"Authorization: Bearer ${CRON_SECRET}\" > /dev/null 2>&1"

echo "Setting up cron job on VPS..."
echo ""

# SSH into VPS and set up cron
ssh root@${VPS_IP} << EOF
  # Check if cron is installed
  if ! command -v crontab &> /dev/null; then
    echo "Installing cron..."
    apt-get update
    apt-get install -y cron
    systemctl enable cron
    systemctl start cron
  fi

  # Check if cron job already exists
  if crontab -l 2>/dev/null | grep -q "send-renewal-reminders"; then
    echo "Cron job already exists. Updating..."
    # Remove old entry
    crontab -l 2>/dev/null | grep -v "send-renewal-reminders" | crontab -
  fi

  # Add new cron job
  (crontab -l 2>/dev/null; echo "${CRON_COMMAND}") | crontab -
  
  echo "✅ Cron job added successfully!"
  echo ""
  echo "Current cron jobs:"
  crontab -l
  echo ""
  echo "Cron service status:"
  systemctl status cron --no-pager | head -5
EOF

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "✅ Cron job configured to run daily at 9 AM UTC"
echo ""
echo "⚠️  IMPORTANT: Add CRON_SECRET to Vercel:"
echo "   1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables"
echo "   2. Add: CRON_SECRET=${CRON_SECRET}"
echo "   3. Select all environments (Production, Preview, Development)"
echo "   4. Click Save and redeploy"
echo ""
echo "To test the cron endpoint manually:"
echo "  curl -X POST ${VPS_URL}/api/cron/send-renewal-reminders \\"
echo "    -H \"Authorization: Bearer ${CRON_SECRET}\""
echo ""
echo "To view cron logs on VPS:"
echo "  ssh root@${VPS_IP} 'tail -f /var/log/cron'"
echo ""

