'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Upload, FileText, BarChart3, Users, Share2, HelpCircle, Menu } from 'lucide-react'
import { DataUploadSVG, RealTimeProcessingSVG, ShareCollaborateSVG, AnalyticsDashboardSVG, PluginEcosystemSVG } from '@/components/svg/Illustrations'
import { useAuth } from '@/lib/auth'
import { authApi } from '@/lib/api'
import { useMutation } from '@tanstack/react-query'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import toast from 'react-hot-toast'

export default function HomePage() {
  const router = useRouter()
  const { user, login, register, createGuestSession } = useAuth()
  const { t } = useLanguage()
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

  // Redirect to dashboard if user is already logged in
  useEffect(() => {
    if (user) {
      router.push('/dashboard')
    }
  }, [user, router])

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
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Top Menu Bar */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('landing.title')}</h1>
                <p className="text-xs text-gray-500">by Dr J. Sun</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => window.open('/help', '_blank')}
                className="flex items-center space-x-2"
              >
                <HelpCircle className="h-4 w-4" />
                <span>{t('help.title')}</span>
              </Button>
              <LanguageSelector />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="relative mb-6">
              <AnalyticsDashboardSVG className="w-24 h-24" />
              <div className="absolute -top-2 -right-2">
                <PluginEcosystemSVG className="w-16 h-16" />
              </div>
            </div>
            <h1 className="text-5xl font-bold text-gray-900 mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {t('landing.title')}
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              {t('landing.subtitle')}
            </p>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mb-12">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">3+</div>
              <div className="text-sm text-gray-600">Analysis Plugins</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">Real-time</div>
              <div className="text-sm text-gray-600">Processing</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">Multi-lang</div>
              <div className="text-sm text-gray-600">Support</div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <DataUploadSVG className="w-16 h-16" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">{t('landing.features.easyUpload.title')}</CardTitle>
              <CardDescription className="text-gray-600 leading-relaxed">
                {t('landing.features.easyUpload.description')}
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <RealTimeProcessingSVG className="w-16 h-16" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">{t('landing.features.realTime.title')}</CardTitle>
              <CardDescription className="text-gray-600 leading-relaxed">
                {t('landing.features.realTime.description')}
              </CardDescription>
            </CardHeader>
          </Card>
          
          <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <ShareCollaborateSVG className="w-16 h-16" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">{t('landing.features.share.title')}</CardTitle>
              <CardDescription className="text-gray-600 leading-relaxed">
                {t('landing.features.share.description')}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Auth Forms */}
        <div className="max-w-lg mx-auto">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Get Started</h2>
              <p className="text-gray-600">Choose how you'd like to access the platform</p>
            </div>
            
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 rounded-lg">
                <TabsTrigger value="login" className="rounded-md">{t('auth.login')}</TabsTrigger>
                <TabsTrigger value="register" className="rounded-md">{t('auth.register')}</TabsTrigger>
                <TabsTrigger value="guest" className="rounded-md">{t('auth.guest')}</TabsTrigger>
              </TabsList>
            
            <TabsContent value="login" className="mt-6">
              <div>
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">{t('auth.loginTitle')}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('auth.loginSubtitle')}
                  </p>
                </div>
                <div>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('auth.email')}</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t('auth.password')}</Label>
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
                      {loginMutation.isPending ? t('auth.signingIn') : t('auth.login')}
                    </Button>
                  </form>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="register" className="mt-6">
              <div>
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">{t('auth.registerTitle')}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('auth.registerSubtitle')}
                  </p>
                </div>
                <div>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('auth.email')}</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="your@email.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t('auth.password')}</Label>
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
                      {registerMutation.isPending ? t('auth.creatingAccount') : t('auth.register')}
                    </Button>
                  </form>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="guest" className="mt-6">
              <div>
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">{t('auth.tryAsGuest')}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('auth.guestDescription')}
                  </p>
                </div>
                <div>
                  <Alert className="mb-4">
                    <AlertDescription>
                      {t('auth.guestWarning')}
                    </AlertDescription>
                  </Alert>
                  <Button 
                    onClick={handleGuestAccess}
                    className="w-full"
                    variant="outline"
                    disabled={guestMutation.isPending}
                  >
                    {guestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {guestMutation.isPending ? t('auth.creatingGuest') : t('auth.guest')}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white/50 backdrop-blur-sm border-t border-white/20 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-600 text-sm">
            Developed by Dr J. Sun
          </p>
        </div>
      </footer>
    </div>
  )
}
