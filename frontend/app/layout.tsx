import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/lib/auth'
import { QueryProvider } from '@/lib/query-provider'
import { SocketProvider } from '@/lib/socket'
import { LanguageProvider } from '@/lib/language'
import Navbar from '@/components/Navbar'

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
          <LanguageProvider>
            <AuthProvider>
              <SocketProvider>
                <Navbar />
                <main className="min-h-screen bg-gray-50">
                  {children}
                </main>
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
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
