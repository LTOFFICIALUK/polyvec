import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from '@/contexts/WalletContext'
import { WebSocketProvider } from '@/contexts/WebSocketContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { ConditionalHeader } from '@/components/ConditionalHeader'

export const metadata: Metadata = {
  title: 'PolyTrade - Terminal Trading Platform',
  description: 'Trade Polymarkets crypto next candle events',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ToastProvider>
        <WalletProvider>
          <WebSocketProvider>
            <ConditionalHeader />
            {children}
          </WebSocketProvider>
        </WalletProvider>
        </ToastProvider>
      </body>
    </html>
  )
}

