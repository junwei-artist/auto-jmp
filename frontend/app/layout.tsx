import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/lib/auth'
import { QueryProvider } from '@/lib/query-provider'
import { SocketProvider } from '@/lib/socket'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Data Analysis Platform',
  description: 'JMP Boxplot Analysis Platform with Real-time Processing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            <SocketProvider>
              {children}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                  },
                }}
              />
            </SocketProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
