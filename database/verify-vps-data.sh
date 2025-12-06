#!/bin/bash
# Quick script to verify price data is being stored on VPS

echo "🔍 Checking VPS database for price data..."
echo ""

# You'll need to update these with your actual values
VPS_IP="206.189.70.100"
DB_USER="polytrade"
DB_NAME="polytrade"
# Password will be prompted

echo "📊 Checking price_events table..."
ssh root@${VPS_IP} "psql -U ${DB_USER} -d ${DB_NAME} -c \"SELECT COUNT(*) as total_events, COUNT(DISTINCT market_id) as unique_markets, MAX(created_at) as latest_record FROM price_events;\""

echo ""
echo "📈 Sample of recent markets:"
ssh root@${VPS_IP} "psql -U ${DB_USER} -d ${DB_NAME} -c \"SELECT market_id, event_start, jsonb_array_length(prices) as price_points, updated_at FROM price_events ORDER BY updated_at DESC LIMIT 5;\""

echo ""
echo "✅ If you see data above, everything is working perfectly!"

