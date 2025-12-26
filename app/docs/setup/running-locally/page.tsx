'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsCodeBlock, DocsSubheading } from '@/components/DocsPage'

export default function RunningLocallyPage() {
  return (
    <DocsPage
      breadcrumb="Configuration"
      title="Running Locally"
      description="Complete guide to running all PolyVec services locally for development."
      tableOfContents={[
        { name: 'Quick Start', href: '#quick-start' },
        { name: 'Manual Start', href: '#manual' },
        { name: 'Verify Services', href: '#verify' },
        { name: 'Common Issues', href: '#issues' },
      ]}
      prevPage={{ name: 'Database Setup', href: '/docs/setup/database' }}
    >
      <DocsSection id="quick-start" title="Quick Start">
        <DocsParagraph>
          Use the automated startup script to launch all services:
        </DocsParagraph>

        <DocsCodeBlock language="bash" code="bash scripts/startup.sh" />

        <DocsParagraph>
          This script will:
        </DocsParagraph>

        <DocsParagraph>
          <strong>1. Start TimescaleDB</strong> — Launches Docker container for the database<br />
          <strong>2. Build WebSocket Service</strong> — Compiles TypeScript and starts ws-service on port 8081<br />
          <strong>3. Start Next.js</strong> — Launches the frontend on port 3000<br />
          <strong>4. Verify Services</strong> — Checks all services are running correctly
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="manual" title="Manual Startup">
        <DocsParagraph>
          Start services manually in separate terminal windows:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`# Terminal 1: Database
docker-compose up -d timescaledb

# Terminal 2: WebSocket Service
cd ws-service
npm install
npm run build
HTTP_PORT=8081 npm run start

# Terminal 3: Next.js Frontend
cd /path/to/PolyVec-main
npm install
npm run dev`}
        />

        <DocsNote type="warning">
          Kill any existing processes on ports 3000 and 8081 before starting:
        </DocsNote>
        <DocsCodeBlock language="bash" code="lsof -ti :3000 :8081 | xargs kill -9" />
      </DocsSection>

      <DocsSection id="verify" title="Verify Services">
        <DocsParagraph>
          Check all services are running:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`# Check database
docker-compose ps timescaledb

# Check WebSocket service
curl http://localhost:8081/health
# Expected: {"status":"ok"}

# Check Next.js
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200`}
        />

        <DocsParagraph>
          Then open <strong>http://localhost:3000</strong> in your browser.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="issues" title="Common Issues">
        <DocsSubheading>WebSocket connection errors in browser</DocsSubheading>
        <DocsParagraph>
          Ensure ws-service is running on port 8081 and .env.local has correct 
          NEXT_PUBLIC_WEBSOCKET_SERVER_URL.
        </DocsParagraph>

        <DocsSubheading>No market data loading</DocsSubheading>
        <DocsParagraph>
          The ws-service needs to be running to fetch market data. Check its logs 
          for connection errors.
        </DocsParagraph>

        <DocsSubheading>Database connection failed</DocsSubheading>
        <DocsParagraph>
          Verify TimescaleDB container is healthy and DATABASE_URL is correct.
        </DocsParagraph>

        <DocsSubheading>TypeScript build errors</DocsSubheading>
        <DocsParagraph>
          Run <code>npm install</code> in ws-service directory to ensure 
          all dependencies are installed.
        </DocsParagraph>

        <DocsNote type="tip">
          Next.js supports hot reload. For ws-service changes, you&apos;ll need to rebuild 
          (<code>npm run build</code>) and restart.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
