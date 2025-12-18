'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import Image from 'next/image'

// Navigation structure matching Polymarket's docs
const navigation = [
  {
    title: 'PolyTrade',
    type: 'links',
    items: [
      { name: 'Discord Community', href: '#', icon: 'discord' },
      { name: 'GitHub', href: 'https://github.com', icon: 'github' },
    ],
  },
  {
    title: 'Get Started',
    type: 'section',
    basePath: '/docs/learn/get-started',
    items: [
      { name: 'What is PolyTrade?', href: '/docs/learn/get-started/what-is-polytrade' },
      { name: 'How to Sign-Up', href: '/docs/learn/get-started/how-to-sign-up' },
      { name: 'How to Deposit', href: '/docs/learn/get-started/how-to-deposit' },
      { name: 'Making Your First Trade', href: '/docs/learn/get-started/first-trade' },
    ],
  },
  {
    title: 'Trading',
    type: 'section',
    basePath: '/docs/learn/trading',
    items: [
      { name: 'Terminal Overview', href: '/docs/learn/trading/terminal' },
      { name: 'Understanding Markets', href: '/docs/learn/trading/understanding-markets' },
      { name: 'Order Types', href: '/docs/learn/trading/order-types' },
      { name: 'Reading the Order Book', href: '/docs/learn/trading/orderbook' },
    ],
  },
  {
    title: 'API Reference',
    type: 'section',
    basePath: '/docs/developers',
    items: [
      { name: 'Overview', href: '/docs/developers/overview' },
      { name: 'Authentication', href: '/docs/developers/authentication' },
      { name: 'Market Data', href: '/docs/developers/api/market-data' },
      { name: 'User Data', href: '/docs/developers/api/user-data' },
    ],
  },
  {
    title: 'WebSocket',
    type: 'section',
    basePath: '/docs/developers/websocket',
    items: [
      { name: 'Connection', href: '/docs/developers/websocket/connection' },
      { name: 'Subscriptions', href: '/docs/developers/websocket/subscriptions' },
      { name: 'Message Types', href: '/docs/developers/websocket/messages' },
    ],
  },
  {
    title: 'Configuration',
    type: 'section',
    basePath: '/docs/setup',
    items: [
      { name: 'Environment Setup', href: '/docs/setup/environment' },
      { name: 'Database Setup', href: '/docs/setup/database' },
      { name: 'Running Locally', href: '/docs/setup/running-locally' },
    ],
  },
]

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'Get Started', 'Trading', 'API Reference', 'WebSocket', 'Configuration'
  ])

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    )
  }

  // Determine which tab is active
  const isLearnSection = pathname?.includes('/docs/learn')
  const isDevelopersSection = pathname?.includes('/docs/developers') || pathname?.includes('/docs/setup')
  const isChangelog = pathname?.includes('/docs/changelog')

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col">
      {/* Docs Header - Fixed */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-gray-800 bg-[#0d0d0d]">
        <div className="flex h-full items-center justify-between px-6">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/logo.png"
                alt="PolyTrade"
                width={96}
                height={32}
                className="h-6 w-auto"
                priority
              />
            </button>
            
            {/* Nav Tabs */}
            <nav className="flex items-center gap-6">
              <button 
                onClick={() => router.push('/docs/learn/get-started/what-is-polytrade')}
                className={`text-sm font-medium pb-1 transition-colors ${
                  isLearnSection 
                    ? 'text-white border-b-2 border-gold-primary' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                User Guide
              </button>
              <button 
                onClick={() => router.push('/docs/developers/overview')}
                className={`text-sm font-medium pb-1 transition-colors ${
                  isDevelopersSection 
                    ? 'text-white border-b-2 border-gold-primary' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                For Developers
              </button>
              <button 
                onClick={() => router.push('/docs/changelog')}
                className={`text-sm font-medium pb-1 transition-colors ${
                  isChangelog 
                    ? 'text-white border-b-2 border-gold-primary' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Changelog
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] rounded-lg border border-gray-800 hover:border-gray-700 transition-colors cursor-pointer min-w-[240px]">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-sm text-gray-500">Search...</span>
                <kbd className="ml-auto px-2 py-0.5 text-xs font-mono bg-[#252525] text-gray-500 rounded">⌘K</kbd>
              </div>
            </div>

            {/* Main Site Button */}
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 px-4 py-2 bg-gold-primary hover:bg-gold-dark text-white text-sm font-medium rounded-lg transition-colors"
            >
              Main Site
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Theme Toggle */}
            <button className="p-2 text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Content wrapper with top padding for fixed header */}
      <div className="flex flex-1 pt-16">
        {/* Left Sidebar - Fixed */}
        <aside className="fixed left-0 top-16 bottom-0 w-64 border-r border-gray-800 bg-[#0d0d0d] overflow-y-auto">
          <nav className="p-4 space-y-6">
            {navigation.map((section) => (
              <div key={section.title}>
                {section.type === 'links' ? (
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                      >
                        {'icon' in item && item.icon === 'discord' && (
                          <svg className="w-5 h-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                          </svg>
                        )}
                        {'icon' in item && item.icon === 'github' && (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                          </svg>
                        )}
                        {item.name}
                      </a>
                    ))}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => toggleSection(section.title)}
                      className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                    >
                      {section.title}
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedSections.includes(section.title) ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {expandedSections.includes(section.title) && (
                      <div className="mt-1 space-y-1">
                        {section.items.map((item) => {
                          const isActive = pathname === item.href
                          return (
                            <button
                              key={item.name}
                              onClick={() => router.push(item.href)}
                              className={`block w-full text-left px-3 py-2 pl-6 text-sm transition-colors ${
                                isActive
                                  ? 'text-gold-hover bg-gold-primary/10 border-l-2 border-gold-primary -ml-[2px] pl-[26px]'
                                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              {item.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64 min-h-[calc(100vh-64px)]">
          {children}
        </main>
      </div>
    </div>
  )
}
