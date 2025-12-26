#!/bin/bash

# Script to set up market insights pre-computation cron job on VPS
# This will pre-compute market insights every 5 minutes for instant loading

VPS_IP="${VPS_IP:-206.189.70.100}"
VPS_URL="${VPS_URL:-https://polyvec.com}"
CRON_SECRET="${CRON_SECRET}"

if [ -z "$CRON_SECRET" ]; then
  echo "ERROR: CRON_SECRET environment variable is required"
  exit 1
fi

echo "========================================="
echo "Setting up Market Insights Pre-computation Cron Job"
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

# Create cron job command (runs every 5 minutes)
CRON_COMMAND="*/5 * * * * curl -X POST ${VPS_URL}/api/cron/precompute-market-insights -H \"Authorization: Bearer ${CRON_SECRET}\" > /dev/null 2>&1"

echo "Setting up cron job on VPS..."
echo "This will pre-compute market insights every 5 minutes"
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
  if crontab -l 2>/dev/null | grep -q "precompute-market-insights"; then
    echo "Cron job already exists. Updating..."
    # Remove old entry
    crontab -l 2>/dev/null | grep -v "precompute-market-insights" | crontab -
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
echo "✅ Cron job configured to run every 5 minutes"
echo ""
echo "⚠️  IMPORTANT: Add CRON_SECRET to Vercel:"
echo "   1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables"
echo "   2. Add: CRON_SECRET=${CRON_SECRET}"
echo "   3. Select all environments (Production, Preview, Development)"
echo "   4. Click Save and redeploy"
echo ""
echo "To test the cron endpoint manually:"
echo "  curl -X POST ${VPS_URL}/api/cron/precompute-market-insights \\"
echo "    -H \"Authorization: Bearer ${CRON_SECRET}\""
echo ""
echo "To view cron logs on VPS:"
echo "  ssh root@${VPS_IP} 'tail -f /var/log/cron'"
echo ""
echo "To run the migration on VPS database:"
echo "  ssh root@${VPS_IP}"
echo "  psql -U postgres -d your_database < database/migrations/012_create_market_insights_cache.sql"
echo ""

