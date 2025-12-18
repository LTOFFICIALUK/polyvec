'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface TableOfContentsItem {
  name: string
  href: string
}

interface DocsPageProps {
  breadcrumb: string
  title: string
  description: string
  tableOfContents: TableOfContentsItem[]
  prevPage?: { name: string; href: string }
  nextPage?: { name: string; href: string }
  children: React.ReactNode
}

export function DocsPage({
  breadcrumb,
  title,
  description,
  tableOfContents,
  prevPage,
  nextPage,
  children,
}: DocsPageProps) {
  const [activeSection, setActiveSection] = useState(tableOfContents[0]?.href.slice(1) || '')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0% -35% 0%' }
    )

    document.querySelectorAll('section[id]').forEach((section) => {
      observer.observe(section)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Main Content */}
      <div className="flex-1 mr-56">
        <div className="max-w-3xl mx-auto px-8 py-12">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gold-hover mb-6">
            <span>{breadcrumb}</span>
          </div>

          <h1 className="text-4xl font-bold text-white mb-6">{title}</h1>
          
          <p className="text-gray-300 text-lg leading-relaxed mb-8">
            {description}
          </p>

          {children}

          {/* Navigation Footer */}
          <div className="flex justify-between items-center pt-8 mt-12 border-t border-gray-800">
            {prevPage ? (
              <Link 
                href={prevPage.href}
                className="flex items-center gap-2 text-gold-hover hover:text-gold-primary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {prevPage.name}
              </Link>
            ) : <div />}
            {nextPage ? (
              <Link 
                href={nextPage.href}
                className="flex items-center gap-2 text-gold-hover hover:text-gold-primary transition-colors"
              >
                {nextPage.name}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : <div />}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Table of Contents */}
      <aside className="fixed right-0 top-16 bottom-0 w-56 border-l border-gray-800 bg-[#0d0d0d] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            On this page
          </div>
          <nav className="space-y-2">
            {tableOfContents.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={`block text-sm transition-colors ${
                  activeSection === item.href.slice(1)
                    ? 'text-gold-hover'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {item.name}
              </a>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  )
}

// Reusable components for docs content
export function DocsSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="text-2xl font-semibold text-white mb-4">{title}</h2>
      {children}
    </section>
  )
}

export function DocsParagraph({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-300 leading-relaxed mb-4">{children}</p>
}

export function DocsSubheading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-medium text-white mt-6 mb-3">{children}</h3>
}

export function DocsNote({ type = 'info', children }: { type?: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: 'border-l-gold-primary bg-gold-primary/5',
    warning: 'border-l-yellow-500 bg-yellow-500/5',
    tip: 'border-l-green-500 bg-green-500/5',
  }
  
  return (
    <div className={`border-l-2 ${styles[type]} pl-4 py-3 mb-6`}>
      <div className="text-gray-300 text-sm">{children}</div>
    </div>
  )
}

export function DocsList({ items }: { items: { title: string; description: string }[] }) {
  return (
    <ul className="space-y-3 text-gray-300 mb-6">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="text-gray-600 mt-0.5">•</span>
          <span>
            <strong className="text-white">{item.title}</strong>
            {item.description && ` — ${item.description}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function DocsCodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group mb-6">
      <pre className="bg-[#0a0a0a] border border-gray-800/50 rounded-lg p-4 overflow-x-auto text-sm">
        <code className={`language-${language} text-gray-300`}>{code}</code>
      </pre>
      <button
        onClick={copyToClipboard}
        className="absolute top-3 right-3 p-2 bg-gray-800/80 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-700"
      >
        {copied ? (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}

export function DocsEndpointCard({ method, path, description }: { method: string; path: string; description: string }) {
  const methodColors: Record<string, string> = {
    GET: 'bg-green-500/20 text-green-400',
    POST: 'bg-blue-500/20 text-blue-400',
    PUT: 'bg-yellow-500/20 text-yellow-400',
    DELETE: 'bg-red-500/20 text-red-400',
  }
  
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-800/50 last:border-0">
      <span className={`px-2 py-0.5 text-xs font-mono font-medium rounded ${methodColors[method]}`}>
        {method}
      </span>
      <code className="text-sm text-gray-300 font-mono">{path}</code>
      <span className="text-sm text-gray-500 ml-auto">{description}</span>
    </div>
  )
}
