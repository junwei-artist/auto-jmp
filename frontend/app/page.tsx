'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Upload, FileText, BarChart3, Users, Share2, HelpCircle, Menu } from 'lucide-react'
import { DataUploadSVG, RealTimeProcessingSVG, ShareCollaborateSVG, AnalyticsDashboardSVG, PluginEcosystemSVG } from '@/components/svg/Illustrations'
import { AnimatedWaveBackground, AnimatedDataFlowSVG, InteractiveDashboardSVG, FloatingElementsSVG, ClickToUseDemoSVG } from '@/components/svg/AnimatedIllustrations'
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
      console.log('Checking setup status...')
      const response = await fetch('/api/v1/setup/setup/status')
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 z-0">
        <FloatingElementsSVG className="w-full h-full opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-purple-600/5 to-indigo-600/5" />
      </div>

      {/* Top Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-md shadow-sm border-b border-white/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <BarChart3 className="h-8 w-8 text-blue-600" />
                <div className="absolute -top-1 -right-1">
                  <PluginEcosystemSVG className="w-6 h-6" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('landing.title')}</h1>
                <p className="text-xs text-gray-500">by Dr J. Sun</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => window.open('/help', '_blank')}
                className="flex items-center space-x-2 hover:bg-blue-50"
              >
                <HelpCircle className="h-4 w-4" />
                <span>{t('help.title')}</span>
              </Button>
              <LanguageSelector />
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 py-20 px-4">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              <div className="space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-2 animate-pulse"></span>
                  {t('landing.badge')}
                </motion.div>
                
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight"
                >
                  {t('landing.hero.title')}
                  <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent block">
                    {t('landing.hero.subtitle')}
                  </span>
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="text-xl text-gray-600 leading-relaxed max-w-lg"
                >
                  {t('landing.hero.description')}
                </motion.p>
              </div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Button
                  onClick={handleGuestAccess}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                  disabled={guestMutation.isPending}
                >
                  {guestMutation.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                  {t('landing.cta.tryNow')}
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-gray-300 hover:border-blue-500 text-gray-700 hover:text-blue-600 px-8 py-3 text-lg font-semibold rounded-xl hover:bg-blue-50 transition-all duration-300"
                  onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  {t('landing.cta.getStarted')}
                </Button>
              </motion.div>

              {/* Quick Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="grid grid-cols-3 gap-8 pt-8"
              >
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
              </motion.div>
            </div>

            {/* Right Column - Interactive Demo */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="relative"
            >
              <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                  {t('svg.liveDemo')}
                </div>
                <ClickToUseDemoSVG className="w-full h-64" instructionText={t('svg.clickToUpload')} />
              </div>
              
              {/* Floating Elements */}
              <div className="absolute -top-8 -left-8 z-10">
                <AnimatedDataFlowSVG className="w-32 h-32 opacity-60" />
              </div>
              <div className="absolute -bottom-8 -right-8 z-10">
                <InteractiveDashboardSVG className="w-40 h-32 opacity-60" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 px-4 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">{t('landing.features.title')}</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-blue-100 rounded-2xl group-hover:bg-blue-200 transition-colors duration-300">
                      <DataUploadSVG className="w-16 h-16" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">{t('landing.features.easyUpload.title')}</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    {t('landing.features.easyUpload.description')}
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-green-100 rounded-2xl group-hover:bg-green-200 transition-colors duration-300">
                      <RealTimeProcessingSVG className="w-16 h-16" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">{t('landing.features.realTime.title')}</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    {t('landing.features.realTime.description.custom')}
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
            >
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-purple-100 rounded-2xl group-hover:bg-purple-200 transition-colors duration-300">
                      <ShareCollaborateSVG className="w-16 h-16" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">{t('landing.features.share.title')}</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    {t('landing.features.share.description')}
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Auth Section */}
      <section id="auth-section" className="relative z-10 py-20 px-4">
        <div className="container mx-auto max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 p-8"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('landing.auth.title')}</h2>
              <p className="text-gray-600">{t('landing.auth.subtitle')}</p>
            </div>
            
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 rounded-xl">
                <TabsTrigger value="login" className="rounded-lg">{t('auth.login')}</TabsTrigger>
                <TabsTrigger value="register" className="rounded-lg">{t('auth.register')}</TabsTrigger>
                <TabsTrigger value="guest" className="rounded-lg">{t('auth.guest')}</TabsTrigger>
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
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t('auth.password')}</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        className="rounded-xl"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl"
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
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t('auth.password')}</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        className="rounded-xl"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl"
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
                  <Alert className="mb-4 rounded-xl">
                    <AlertDescription>
                      {t('auth.guestWarning')}
                    </AlertDescription>
                  </Alert>
                  <Button 
                    onClick={handleGuestAccess}
                    className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 rounded-xl"
                    disabled={guestMutation.isPending}
                  >
                    {guestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {guestMutation.isPending ? t('auth.creatingGuest') : t('auth.guest')}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-white/50 backdrop-blur-sm border-t border-white/20 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-600 text-sm">
            Developed by Dr J. Sun • {t('landing.footer.platform')}
          </p>
        </div>
      </footer>
    </div>
  )
}
