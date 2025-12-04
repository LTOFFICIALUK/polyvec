'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsCodeBlock, DocsSubheading } from '@/components/DocsPage'

export default function EnvironmentSetupPage() {
  return (
    <DocsPage
      breadcrumb="Configuration"
      title="Environment Setup"
      description="Configure your development environment with the required environment variables and settings for PolyTrade."
      tableOfContents={[
        { name: 'Prerequisites', href: '#prerequisites' },
        { name: 'Environment Variables', href: '#env-vars' },
        { name: '.env.local File', href: '#env-file' },
        { name: 'Verification', href: '#verification' },
      ]}
      prevPage={{ name: 'Message Types', href: '/docs/developers/websocket/messages' }}
      nextPage={{ name: 'Database Setup', href: '/docs/setup/database' }}
    >
      <DocsSection id="prerequisites" title="Prerequisites">
        <DocsParagraph>
          Ensure you have the following installed:
        </DocsParagraph>

        <DocsSubheading>Node.js (v18+)</DocsSubheading>
        <DocsParagraph>
          Required for running the Next.js frontend and WebSocket service.
        </DocsParagraph>
        <DocsCodeBlock language="bash" code="node --version" />

        <DocsSubheading>npm or yarn</DocsSubheading>
        <DocsParagraph>
          Package manager for installing dependencies.
        </DocsParagraph>
        <DocsCodeBlock language="bash" code="npm --version" />

        <DocsSubheading>Docker Desktop</DocsSubheading>
        <DocsParagraph>
          Required for running TimescaleDB database.
        </DocsParagraph>
        <DocsCodeBlock language="bash" code="docker --version" />

        <DocsSubheading>Git</DocsSubheading>
        <DocsParagraph>
          For version control and cloning the repository.
        </DocsParagraph>
        <DocsCodeBlock language="bash" code="git --version" />
      </DocsSection>

      <DocsSection id="env-vars" title="Environment Variables">
        <DocsParagraph>
          PolyTrade requires several environment variables to function properly:
        </DocsParagraph>

        <DocsSubheading>DATABASE_URL</DocsSubheading>
        <DocsParagraph>
          Connection string for TimescaleDB.
        </DocsParagraph>
        <DocsCodeBlock language="text" code="postgresql://polytrade:polytrade_dev_password@localhost:5432/polytrade" />

        <DocsSubheading>NEXT_PUBLIC_WEBSOCKET_SERVER_URL</DocsSubheading>
        <DocsParagraph>
          WebSocket server URL for real-time data.
        </DocsParagraph>
        <DocsCodeBlock language="text" code="ws://localhost:8081" />

        <DocsSubheading>WEBSOCKET_SERVER_HTTP_URL</DocsSubheading>
        <DocsParagraph>
          HTTP URL for the WebSocket service.
        </DocsParagraph>
        <DocsCodeBlock language="text" code="http://localhost:8081" />
      </DocsSection>

      <DocsSection id="env-file" title="Creating .env.local">
        <DocsParagraph>
          Create a <code>.env.local</code> file in the project root:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`cat > .env.local << 'EOF'
DATABASE_URL=postgresql://polytrade:polytrade_dev_password@localhost:5432/polytrade
NEXT_PUBLIC_WEBSOCKET_SERVER_URL=ws://localhost:8081
WEBSOCKET_SERVER_HTTP_URL=http://localhost:8081
EOF`}
        />

        <DocsNote type="warning">
          Never commit .env.local to version control. This file contains sensitive configuration 
          and should be in your .gitignore.
        </DocsNote>
      </DocsSection>

      <DocsSection id="verification" title="Verification">
        <DocsParagraph>
          Verify your environment is configured correctly:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`# Check environment file exists
ls -la .env.local

# View contents (be careful with sensitive data)
cat .env.local | grep -E "DATABASE_URL|WEBSOCKET"`}
        />

        <DocsNote type="tip">
          After changing environment variables, restart the Next.js dev server for changes to take effect.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
