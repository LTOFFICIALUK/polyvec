#!/bin/bash

# Script to set up VPS database connection in .env.local
# This will add/update the DATABASE_URL for the VPS

VPS_IP="206.189.70.100"
DB_USER="polytrade"
DB_NAME="polytrade"
DB_PASSWORD="6Te4WfZi*V/r"

# URL encode the password (replace * with %2A and / with %2F)
ENCODED_PASSWORD=$(echo "$DB_PASSWORD" | sed 's/\*/%2A/g' | sed 's/\//%2F/g')

DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@${VPS_IP}:5432/${DB_NAME}"

echo "Setting up VPS database connection..."
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
  # Check if DATABASE_URL already exists
  if grep -q "^DATABASE_URL=" .env.local; then
    echo "Updating existing DATABASE_URL in .env.local..."
    # Use sed to update the line (works on macOS)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env.local
    else
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" .env.local
    fi
  else
    echo "Adding DATABASE_URL to .env.local..."
    echo "" >> .env.local
    echo "# VPS Database Connection" >> .env.local
    echo "DATABASE_URL=${DATABASE_URL}" >> .env.local
  fi
  
  # Check if JWT_SECRET exists
  if ! grep -q "^JWT_SECRET=" .env.local; then
    echo "Adding JWT_SECRET to .env.local..."
    echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env.local
  fi
else
  echo "Creating .env.local file..."
  cat > .env.local << EOF
# VPS Database Connection
DATABASE_URL=${DATABASE_URL}

# JWT Secret for authentication
JWT_SECRET=$(openssl rand -base64 32)
EOF
fi

echo ""
echo "✓ Database connection configured!"
echo ""
echo "DATABASE_URL has been set to:"
echo "postgresql://${DB_USER}:***@${VPS_IP}:5432/${DB_NAME}"
echo ""
echo "Next steps:"
echo "1. Make sure PostgreSQL is running on the VPS"
echo "2. Run the database setup script: ./scripts/setup-vps-db.sh"
echo "3. Or manually set up the database on the VPS"
echo "4. Restart your dev server: npm run dev"

