'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Database, User, Settings, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface SetupStatus {
  is_setup: boolean
  admin_count: number
}

export default function AdminSetupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [formData, setFormData] = useState({
    postgres_username: '',
    postgres_password: '',
    admin_email: '',
    admin_password: '',
    admin_name: ''
  })

  // Check setup status on component mount
  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/setup/setup/status`)
      if (response.ok) {
        const status = await response.json()
        setSetupStatus(status)
        
        if (status.is_setup) {
          // Already set up, redirect to admin dashboard
          router.push('/admin/dashboard')
        }
      }
    } catch (error) {
      console.error('Failed to check setup status:', error)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/setup/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Setup completed successfully!')
        // Redirect to admin dashboard
        router.push('/admin/dashboard')
      } else {
        toast.error(result.detail || 'Setup failed')
      }
    } catch (error) {
      console.error('Setup error:', error)
      toast.error('Setup failed. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (setupStatus === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Checking setup status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Data Analysis Platform Setup
          </h1>
          <p className="text-gray-600">
            Configure your database and create the first admin user
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Initial Configuration
            </CardTitle>
            <CardDescription>
              Set up PostgreSQL database and create your admin account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* PostgreSQL Configuration */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold">PostgreSQL Configuration</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="postgres_username">PostgreSQL Username</Label>
                    <Input
                      id="postgres_username"
                      name="postgres_username"
                      type="text"
                      value={formData.postgres_username}
                      onChange={handleInputChange}
                      placeholder="postgres"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="postgres_password">PostgreSQL Password</Label>
                    <Input
                      id="postgres_password"
                      name="postgres_password"
                      type="password"
                      value={formData.postgres_password}
                      onChange={handleInputChange}
                      placeholder="Enter PostgreSQL password"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Admin User Configuration */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-semibold">Admin User Configuration</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="admin_name">Admin Name</Label>
                    <Input
                      id="admin_name"
                      name="admin_name"
                      type="text"
                      value={formData.admin_name}
                      onChange={handleInputChange}
                      placeholder="Administrator"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin_email">Admin Email</Label>
                    <Input
                      id="admin_email"
                      name="admin_email"
                      type="email"
                      value={formData.admin_email}
                      onChange={handleInputChange}
                      placeholder="admin@example.com"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="admin_password">Admin Password</Label>
                  <Input
                    id="admin_password"
                    name="admin_password"
                    type="password"
                    value={formData.admin_password}
                    onChange={handleInputChange}
                    placeholder="Enter admin password"
                    required
                  />
                </div>
              </div>

              {/* Setup Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Complete Setup
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Information Alert */}
        <Alert className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> This setup will create a new PostgreSQL database and user. 
            Make sure PostgreSQL is running and you have the correct credentials. 
            The admin user created here will have full access to the platform.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
