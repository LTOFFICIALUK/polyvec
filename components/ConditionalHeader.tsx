'use client'

import { usePathname } from 'next/navigation'
import Header from './Header'

export function ConditionalHeader() {
  const pathname = usePathname()
  
  // Don't show the main header on docs pages (they have their own header)
  if (pathname?.startsWith('/docs')) {
    return null
  }
  
  return <Header />
}

