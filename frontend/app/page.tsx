'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Upload, FileText, BarChart3, Users, Share2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { authApi } from '@/lib/api'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'

export default function HomePage() {
  const router = useRouter()
  const { user, login, register, createGuestSession } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [setupStatus, setSetupStatus] = useState<{is_setup: boolean} | null>(null)

  // Check setup status on component mount
  useEffect(() => {
    // For now, skip setup check since system is already configured
    setSetupStatus({ is_setup: true })
    // checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
      console.log('Backend URL:', backendUrl)
      const response = await fetch(`${backendUrl}/api/v1/setup/setup/status`)
      console.log('Setup status response:', response.status)
      if (response.ok) {
        const status = await response.json()
        console.log('Setup status:', status)
        setSetupStatus(status)
        
        if (!status.is_setup) {
          // Not set up, redirect to setup page
          router.push('/admin/setup')
        }
      }
    } catch (error) {
      console.error('Failed to check setup status:', error)
      // If we can't check setup status, assume it's not set up
      router.push('/admin/setup')
    }
  }

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return authApi.login(email, password)
    },
    onSuccess: (data) => {
      login(data.access_token, data.refresh_token, data.user_id, data.is_guest, data.is_admin)
      toast.success('Welcome back!')
      router.push('/dashboard')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const registerMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return authApi.register(email, password)
    },
    onSuccess: (data) => {
      login(data.access_token, data.refresh_token, data.user_id, data.is_guest, data.is_admin)
      toast.success('Account created successfully!')
      router.push('/dashboard')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const guestMutation = useMutation({
    mutationFn: async () => {
      return authApi.createGuestSession()
    },
    onSuccess: (data) => {
      login(data.access_token, '', data.user_id, data.is_guest, false)
      toast.success('Welcome! You are now using guest access.')
      router.push('/dashboard')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    
    loginMutation.mutate({ email, password })
  }

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    
    registerMutation.mutate({ email, password })
  }

  const handleGuestAccess = () => {
    guestMutation.mutate()
  }

  // Skip setup check for now
  // if (setupStatus === null) {
  //   return (
  //     <div className="min-h-screen bg-gray-50 flex items-center justify-center">
  //       <div className="text-center">
  //         <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
  //         <p className="text-gray-600">Checking system status...</p>
  //       </div>
  //     </div>
  //   )
  // }

  if (user) {
    router.push('/dashboard')
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <BarChart3 className="h-12 w-12 text-blue-600 mr-4" />
            <h1 className="text-4xl font-bold text-gray-900">Data Analysis Platform</h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Upload your CSV and JSL files to generate beautiful boxplot visualizations with JMP.
            Real-time processing, interactive galleries, and seamless sharing.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <Upload className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Easy Upload</CardTitle>
              <CardDescription>
                Drag and drop your CSV and JSL files for instant analysis
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader>
              <BarChart3 className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Real-time Processing</CardTitle>
              <CardDescription>
                Watch your analysis progress in real-time with live updates
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader>
              <Share2 className="h-8 w-8 text-purple-600 mb-2" />
              <CardTitle>Share & Collaborate</CardTitle>
              <CardDescription>
                Share your results with team members or create public links
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Auth Forms */}
        <div className="max-w-md mx-auto">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
              <TabsTrigger value="guest">Guest</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome Back</CardTitle>
                  <CardDescription>
                    Sign in to your account to continue
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign In
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle>Create Account</CardTitle>
                  <CardDescription>
                    Sign up for a new account to get started
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Account
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="guest">
              <Card>
                <CardHeader>
                  <CardTitle>Try as Guest</CardTitle>
                  <CardDescription>
                    Experience the platform without creating an account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <AlertDescription>
                      Guest access has limited features and file size restrictions.
                      Create an account for full access.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    onClick={handleGuestAccess}
                    className="w-full"
                    variant="outline"
                    disabled={guestMutation.isPending}
                  >
                    {guestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue as Guest
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
