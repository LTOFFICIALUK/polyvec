'use client'

import { DocsPage, DocsSection, DocsParagraph } from '@/components/DocsPage'

export default function ChangelogPage() {
  return (
    <DocsPage
      breadcrumb="Changelog"
      title="Changelog"
      description="Track updates, new features, and improvements to PolyVec."
      tableOfContents={[
        { name: 'Overview', href: '#overview' },
      ]}
    >
      <DocsSection id="overview" title="No releases yet">
        <DocsParagraph>
          This changelog will be updated as new versions are released. Check back soon for updates 
          on new features, improvements, and bug fixes.
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}

