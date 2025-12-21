import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from '@/contexts/WalletContext'
import { WebSocketProvider } from '@/contexts/WebSocketContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { PlanModalProvider } from '@/contexts/PlanModalContext'
import { ConditionalHeader } from '@/components/ConditionalHeader'
import PaymentWarningBanner from '@/components/PaymentWarningBanner'

export const metadata: Metadata = {
  title: 'PolyVec - Polymarket Trading Terminal',
  description: 'Identify when short-term markets are worth trading',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased flex flex-col min-h-screen" suppressHydrationWarning>
        <ToastProvider>
          <AuthProvider>
        <WalletProvider>
          <WebSocketProvider>
            <PlanModalProvider>
              <ConditionalHeader />
              <PaymentWarningBanner />
              <main className="flex-1 flex flex-col">
              {children}
              </main>
            </PlanModalProvider>
          </WebSocketProvider>
        </WalletProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
