'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsCodeBlock, DocsSubheading } from '@/components/DocsPage'

export default function DatabaseSetupPage() {
  return (
    <DocsPage
      breadcrumb="Configuration"
      title="Database Setup"
      description="Set up TimescaleDB for storing historical price data and trade information."
      tableOfContents={[
        { name: 'Start Database', href: '#start' },
        { name: 'Run Migrations', href: '#migrations' },
        { name: 'Verify Setup', href: '#verify' },
        { name: 'Troubleshooting', href: '#troubleshooting' },
      ]}
      prevPage={{ name: 'Environment Setup', href: '/docs/setup/environment' }}
      nextPage={{ name: 'Running Locally', href: '/docs/setup/running-locally' }}
    >
      <DocsSection id="start" title="Start TimescaleDB">
        <DocsParagraph>
          PolyTrade uses TimescaleDB (PostgreSQL with time-series extensions) running in Docker:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`# Navigate to project root
cd /path/to/PolyTrade-main

# Start TimescaleDB container
docker-compose up -d timescaledb

# Wait for container to be healthy (10-15 seconds)
docker-compose ps timescaledb`}
        />

        <DocsNote type="info">
          On first startup, Docker will pull the TimescaleDB image which may take a few minutes 
          depending on your connection.
        </DocsNote>
      </DocsSection>

      <DocsSection id="migrations" title="Run Migrations">
        <DocsParagraph>
          Apply database migrations to create required tables:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`# Run migrations
docker-compose exec -T timescaledb psql -U polytrade -d polytrade < database/migrations/001_create_price_history.sql

# Optional: Run optimization migrations
docker-compose exec -T timescaledb psql -U polytrade -d polytrade < database/migrations/002_optimize_storage.sql`}
        />

        <DocsSubheading>Migration Files</DocsSubheading>
        <DocsParagraph>
          <code>001_create_price_history.sql</code> — Creates price_history hypertable<br />
          <code>002_optimize_storage.sql</code> — Adds compression and retention policies
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="verify" title="Verify Setup">
        <DocsParagraph>
          Confirm the database is running and tables exist:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`# Check database is accepting connections
docker-compose exec timescaledb pg_isready -U polytrade
# Expected: timescaledb:5432 - accepting connections

# List tables
docker-compose exec timescaledb psql -U polytrade -d polytrade -c "\\dt"
# Expected: price_history table listed`}
        />
      </DocsSection>

      <DocsSection id="troubleshooting" title="Troubleshooting">
        <DocsSubheading>Container won&apos;t start?</DocsSubheading>
        <DocsParagraph>
          Check Docker Desktop is running and has sufficient resources allocated.
        </DocsParagraph>
        <DocsCodeBlock language="bash" code="docker-compose logs timescaledb" />

        <DocsSubheading>Connection refused?</DocsSubheading>
        <DocsParagraph>
          Ensure the container is healthy and port 5432 isn&apos;t in use.
        </DocsParagraph>
        <DocsCodeBlock language="bash" code="lsof -i :5432" />

        <DocsSubheading>Tables missing?</DocsSubheading>
        <DocsParagraph>
          Re-run migrations. Check for SQL errors in the output.
        </DocsParagraph>

        <DocsSubheading>Data not persisting?</DocsSubheading>
        <DocsParagraph>
          Docker volumes should preserve data. Check volume mounting:
        </DocsParagraph>
        <DocsCodeBlock language="bash" code="docker volume ls | grep polytrade" />
      </DocsSection>
    </DocsPage>
  )
}
