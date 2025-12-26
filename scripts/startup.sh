#!/bin/bash
# PolyVec Complete Startup Script
# Run: bash scripts/startup.sh
# This script starts all services from scratch

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="/Users/lukecarter/Downloads/PolyVec-main"
cd "$PROJECT_ROOT"

echo -e "${BLUE}🚀 PolyVec Startup Script${NC}"
echo "=========================================="
echo ""
echo -e "${YELLOW}Note:${NC} If Docker Desktop is not running, this script will attempt to start it."
echo -e "${YELLOW}      This may take 60-90 seconds. You can also start it manually first.${NC}"
echo ""

# Step 1: Check Prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js.${NC}"
    exit 1
fi

# Check Docker - handle case where Docker Desktop is installed but not running
DOCKER_AVAILABLE=false

# First, check if docker command is available and working
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    DOCKER_AVAILABLE=true
    echo -e "${GREEN}✅ Docker is running${NC}"
else
    # Check if Docker Desktop app exists
    if [ -d "/Applications/Docker.app" ]; then
        # Check if Docker Desktop process is running
        if pgrep -f "Docker.app" > /dev/null; then
            echo -e "${YELLOW}⚠️  Docker Desktop is starting...${NC}"
            echo "⏳ Waiting for Docker daemon to be ready (this may take 60-90 seconds)..."
        else
            echo -e "${YELLOW}⚠️  Docker Desktop is installed but not running.${NC}"
            echo -e "${YELLOW}   Attempting to start Docker Desktop...${NC}"
            open -a Docker
            echo "⏳ Waiting for Docker to start (this may take 60-90 seconds)..."
        fi
        
        # Wait for docker command to become available and working
        # Check every 2 seconds for up to 90 seconds
        for i in {1..45}; do
            # Try to find docker in common locations if not in PATH
            if ! command -v docker &> /dev/null; then
                # Docker Desktop usually adds to /usr/local/bin
                if [ -f "/usr/local/bin/docker" ]; then
                    export PATH="/usr/local/bin:$PATH"
                fi
            fi
            
            if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
                echo -e "${GREEN}✅ Docker is now running${NC}"
                DOCKER_AVAILABLE=true
                break
            fi
            
            # Show progress every 10 seconds
            if [ $((i % 5)) -eq 0 ]; then
                echo "   Still waiting... ($((i * 2))s elapsed)"
            fi
            
            sleep 2
        done
        
        if [ "$DOCKER_AVAILABLE" = false ]; then
            echo ""
            echo -e "${RED}❌ Docker failed to start within 90 seconds.${NC}"
            echo -e "${YELLOW}   Please ensure Docker Desktop is fully started, then run this script again.${NC}"
            echo -e "${YELLOW}   You can check Docker Desktop status in the menu bar (whale icon).${NC}"
            echo ""
            echo -e "${BLUE}   To start manually:${NC}"
            echo -e "${BLUE}   1. Open Docker Desktop from Applications${NC}"
            echo -e "${BLUE}   2. Wait until the whale icon in menu bar shows 'Docker Desktop is running'${NC}"
            echo -e "${BLUE}   3. Run this script again${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Docker Desktop not found. Please install Docker Desktop from:${NC}"
        echo -e "${YELLOW}   https://www.docker.com/products/docker-desktop${NC}"
        exit 1
    fi
fi

# Final verification
if ! docker info &> /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not responding. Please ensure Docker Desktop is fully started.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Step 2: Start Database
echo -e "${YELLOW}Step 2: Starting TimescaleDB...${NC}"
docker-compose up -d timescaledb
echo "⏳ Waiting for database to be ready..."
for i in {1..30}; do
    if docker-compose exec -T timescaledb pg_isready -U polyvec &> /dev/null; then
        echo -e "${GREEN}✅ Database is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Database failed to start${NC}"
        docker-compose logs timescaledb | tail -20
        exit 1
    fi
    sleep 1
done

# Verify tables exist
if ! docker-compose exec -T timescaledb psql -U polyvec -d polyvec -c "\dt" | grep -q price_history; then
    echo "📊 Running migrations..."
    docker-compose exec -T timescaledb psql -U polyvec -d polyvec < database/migrations/001_create_price_history.sql
fi
echo ""

# Step 3: Verify Environment
echo -e "${YELLOW}Step 3: Verifying environment...${NC}"
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local..."
    cat > .env.local << 'EOF'
DATABASE_URL=postgresql://polyvec:polyvec_dev_password@localhost:5432/polyvec
NEXT_PUBLIC_WEBSOCKET_SERVER_URL=ws://localhost:8081
WEBSOCKET_SERVER_HTTP_URL=http://localhost:8081
EOF
    echo -e "${GREEN}✅ Created .env.local${NC}"
else
    # Verify WebSocket URL is correct
    if ! grep -q "NEXT_PUBLIC_WEBSOCKET_SERVER_URL=ws://localhost:8081" .env.local; then
        echo "🔧 Fixing WebSocket URL in .env.local..."
        sed -i '' 's|NEXT_PUBLIC_WEBSOCKET_SERVER_URL=.*|NEXT_PUBLIC_WEBSOCKET_SERVER_URL=ws://localhost:8081|' .env.local
        echo -e "${GREEN}✅ Updated .env.local${NC}"
    else
        echo -e "${GREEN}✅ Environment configured${NC}"
    fi
fi
echo ""

# Step 4: Kill Existing Servers
echo -e "${YELLOW}Step 4: Cleaning up existing servers...${NC}"
lsof -ti :8081 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 2
echo -e "${GREEN}✅ Ports cleared${NC}"
echo ""

# Step 5: Build WebSocket Service
echo -e "${YELLOW}Step 5: Building WebSocket service...${NC}"
cd "$PROJECT_ROOT/ws-service"
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi
echo "🔨 Building TypeScript..."
npm run build
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Step 6: Start WebSocket Service
echo -e "${YELLOW}Step 6: Starting WebSocket service...${NC}"
cd "$PROJECT_ROOT/ws-service"
HTTP_PORT=8081 npm run start > /tmp/ws-service.log 2>&1 &
WS_PID=$!
sleep 3

# Verify ws-service started
for i in {1..10}; do
    if curl -s http://localhost:8081/health | grep -q "ok"; then
        echo -e "${GREEN}✅ WebSocket service running (PID: $WS_PID)${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ WebSocket service failed to start${NC}"
        cat /tmp/ws-service.log
        exit 1
    fi
    sleep 1
done
echo ""

# Step 7: Start Next.js
echo -e "${YELLOW}Step 7: Starting Next.js frontend...${NC}"
cd "$PROJECT_ROOT"
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi
npm run dev > /tmp/nextjs.log 2>&1 &
NEXTJS_PID=$!
sleep 5

# Verify Next.js started
for i in {1..15}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
        echo -e "${GREEN}✅ Next.js running (PID: $NEXTJS_PID)${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}❌ Next.js failed to start${NC}"
        cat /tmp/nextjs.log | tail -20
        kill $WS_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done
echo ""

# Step 8: Verify Data Collection
echo -e "${YELLOW}Step 8: Verifying data collection...${NC}"
sleep 3
RECORD_COUNT=$(docker-compose exec -T timescaledb psql -U polyvec -d polyvec -t -c "SELECT COUNT(*) FROM price_history;" 2>/dev/null | tr -d ' ' || echo "0")
if [ "$RECORD_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✅ Database has $RECORD_COUNT price records${NC}"
else
    echo -e "${YELLOW}⚠️  No price records yet (this is OK if markets just started)${NC}"
fi
echo ""

# Final Summary
echo "=========================================="
echo -e "${GREEN}✅ All services are running!${NC}"
echo ""
echo "Services:"
echo "  📊 Database:     http://localhost:5432 (PostgreSQL)"
echo "  🔌 WebSocket:    ws://localhost:8081/ws"
echo "  🌐 HTTP API:     http://localhost:8081"
echo "  🎨 Frontend:     http://localhost:3000"
echo ""
echo "Process IDs:"
echo "  WebSocket Service: $WS_PID"
echo "  Next.js:           $NEXTJS_PID"
echo ""
echo "To stop all services:"
echo "  kill $WS_PID $NEXTJS_PID"
echo "  docker-compose down"
echo ""
echo -e "${BLUE}🌐 Open http://localhost:3000 in your browser${NC}"
echo ""

