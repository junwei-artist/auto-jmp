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
import { Loader2, Upload, FileText, BarChart3, Users, Share2, HelpCircle, Menu, ArrowRight } from 'lucide-react'
import { DataUploadSVG, RealTimeProcessingSVG, ShareCollaborateSVG, AnalyticsDashboardSVG, PluginEcosystemSVG } from '@/components/svg/Illustrations'
import { AnimatedWaveBackground, AnimatedDataFlowSVG, InteractiveDashboardSVG, FloatingElementsSVG, ClickToUseDemoSVG } from '@/components/svg/AnimatedIllustrations'
import { DashboardIconSVG, WorkspacesIconSVG, WorkflowsIconSVG, ModulesIconSVG } from '@/components/svg/PortalIcons'
import { AllFunctionsHeroSlide, DashboardHeroSlide, WorkspacesHeroSlide, WorkflowsHeroSlide, ModulesHeroSlide } from '@/components/svg/HeroSlides'
import { Carousel } from '@/components/Carousel'
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
      toast.success(t('auth.welcome'))
      // Stay on home page to explore interfaces
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
      toast.success(t('auth.accountCreated'))
      // Stay on home page to explore interfaces
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
      toast.success(t('auth.guestWelcome'))
      // Stay on home page to explore interfaces
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

  // Carousel slides data
  const carouselSlides = [
    {
      id: 'all-functions',
      title: 'Welcome to Data Analysis Platform',
      subtitle: 'Explore All Functions',
      description: 'Discover our comprehensive suite of tools for data visualization, organization, automation, and analysis',
      ctaText: 'Get Started',
      ctaLink: '#',
      heroImage: (
        <div className="relative w-full h-full">
          <AllFunctionsHeroSlide className="w-full h-full" />
          <div className="absolute inset-0 flex flex-col items-center text-white z-10 px-4 overflow-y-auto">
            <div className="flex flex-col items-center justify-center min-h-full w-full py-8 md:py-12 space-y-6 md:space-y-8">
              {/* Text at top */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center flex-shrink-0"
              >
                <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-2 md:mb-4">
                  {t('home.carousel.allFunctions.title')}
                </h2>
                <p className="text-lg md:text-xl lg:text-2xl max-w-2xl mx-auto">
                  {t('home.carousel.allFunctions.subtitle')}
                </p>
              </motion.div>
              
              {/* Four function icons in middle */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 lg:gap-8 max-w-5xl w-full flex-shrink-0 px-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="flex flex-col items-center cursor-pointer group"
                  onClick={() => router.push('/dashboard')}
                >
                  <div className="p-3 md:p-4 bg-white/20 rounded-2xl group-hover:bg-white/30 transition-colors mb-2">
                    <DashboardIconSVG className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20" />
                  </div>
                  <span className="text-xs md:text-sm lg:text-base font-semibold text-center">{t('home.interface.dashboard')}</span>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="flex flex-col items-center cursor-pointer group"
                  onClick={() => router.push('/workspace')}
                >
                  <div className="p-3 md:p-4 bg-white/20 rounded-2xl group-hover:bg-white/30 transition-colors mb-2">
                    <WorkspacesIconSVG className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20" />
                  </div>
                  <span className="text-xs md:text-sm lg:text-base font-semibold text-center">{t('home.interface.workspaces')}</span>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="flex flex-col items-center cursor-pointer group"
                  onClick={() => router.push('/workflows')}
                >
                  <div className="p-3 md:p-4 bg-white/20 rounded-2xl group-hover:bg-white/30 transition-colors mb-2">
                    <WorkflowsIconSVG className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20" />
                  </div>
                  <span className="text-xs md:text-sm lg:text-base font-semibold text-center">{t('home.interface.workflows')}</span>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                  className="flex flex-col items-center cursor-pointer group"
                  onClick={() => router.push('/modules')}
                >
                  <div className="p-3 md:p-4 bg-white/20 rounded-2xl group-hover:bg-white/30 transition-colors mb-2">
                    <ModulesIconSVG className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20" />
                  </div>
                  <span className="text-xs md:text-sm lg:text-base font-semibold text-center">{t('home.interface.modules')}</span>
                </motion.div>
              </div>
              
              {/* Text at bottom */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="text-center flex-shrink-0"
              >
                <p className="text-base md:text-lg lg:text-xl opacity-90">
                  {t('home.carousel.allFunctions.clickToStart')}
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'dashboard',
      title: 'JMP Visualization Dashboard',
      subtitle: 'Transform Data into Insights',
      description: 'Create powerful visualizations and analyze your data with advanced JMP tools',
      ctaText: 'Explore Dashboard',
      ctaLink: '/dashboard',
      heroImage: (
        <div className="relative w-full h-full">
          <DashboardHeroSlide className="w-full h-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 px-4">
            {/* Text - centered and moved lower */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mt-16 md:mt-24"
            >
              <h2 className="text-4xl md:text-6xl font-bold mb-4">
                {t('home.carousel.dashboard.title')}
              </h2>
              <p className="text-xl md:text-2xl max-w-2xl mx-auto">
                {t('home.carousel.dashboard.subtitle')}
              </p>
            </motion.div>
            
            {/* SVG in middle - already in background */}
            
            {/* Button at bottom */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="absolute bottom-8 md:bottom-12"
            >
              <Button
                size="lg"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold rounded-xl shadow-lg"
              >
                {t('home.carousel.startNow')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          </div>
        </div>
      )
    },
    {
      id: 'workspaces',
      title: 'Organize Your Workspaces',
      subtitle: 'Categorize and Manage Tasks',
      description: 'Create organized workspaces to structure your projects and workflows efficiently',
      ctaText: 'View Workspaces',
      ctaLink: '/workspace',
      heroImage: (
        <div className="relative w-full h-full">
          <WorkspacesHeroSlide className="w-full h-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 px-4">
            {/* Text - centered and moved lower */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mt-16 md:mt-24"
            >
              <h2 className="text-4xl md:text-6xl font-bold mb-4">
                {t('home.carousel.workspaces.title')}
              </h2>
              <p className="text-xl md:text-2xl max-w-2xl mx-auto">
                {t('home.carousel.workspaces.subtitle')}
              </p>
            </motion.div>
            
            {/* SVG in middle - already in background */}
            
            {/* Button at bottom */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="absolute bottom-8 md:bottom-12"
            >
              <Button
                size="lg"
                onClick={() => router.push('/workspace')}
                className="bg-white text-green-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold rounded-xl shadow-lg"
              >
                {t('home.carousel.startNow')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          </div>
        </div>
      )
    },
    {
      id: 'workflows',
      title: 'Automate with Workflows',
      subtitle: 'Node-Based Automation',
      description: 'Build powerful automated workflows using visual node-based programming',
      ctaText: 'Create Workflow',
      ctaLink: '/workflows',
      heroImage: (
        <div className="relative w-full h-full">
          <WorkflowsHeroSlide className="w-full h-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 px-4">
            {/* Text - centered and moved lower */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mt-16 md:mt-24"
            >
              <h2 className="text-4xl md:text-6xl font-bold mb-4">
                {t('home.carousel.workflows.title')}
              </h2>
              <p className="text-xl md:text-2xl max-w-2xl mx-auto">
                {t('home.carousel.workflows.subtitle')}
              </p>
            </motion.div>
            
            {/* SVG in middle - already in background */}
            
            {/* Button at bottom */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="absolute bottom-8 md:bottom-12"
            >
              <Button
                size="lg"
                onClick={() => router.push('/workflows')}
                className="bg-white text-purple-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold rounded-xl shadow-lg"
              >
                {t('home.carousel.startNow')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          </div>
        </div>
      )
    },
    {
      id: 'modules',
      title: 'Data Analysis Modules',
      subtitle: 'Powerful Analysis Functions',
      description: 'Access a wide range of specialized modules for comprehensive data analysis',
      ctaText: 'Browse Modules',
      ctaLink: '/modules',
      heroImage: (
        <div className="relative w-full h-full">
          <ModulesHeroSlide className="w-full h-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 px-4">
            {/* Text - centered and moved lower */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mt-16 md:mt-24"
            >
              <h2 className="text-4xl md:text-6xl font-bold mb-4">
                {t('home.carousel.modules.title')}
              </h2>
              <p className="text-xl md:text-2xl max-w-2xl mx-auto">
                {t('home.carousel.modules.subtitle')}
              </p>
            </motion.div>
            
            {/* SVG in middle - already in background */}
            
            {/* Button at bottom */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="absolute bottom-8 md:bottom-12"
            >
              <Button
                size="lg"
                onClick={() => router.push('/modules')}
                className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold rounded-xl shadow-lg"
              >
                {t('home.carousel.startNow')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          </div>
        </div>
      )
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 z-0">
        <FloatingElementsSVG className="w-full h-full opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-purple-600/5 to-indigo-600/5" />
      </div>

      {/* Carousel Hero Banner */}
      <section className="relative z-10 w-full h-[600px] md:h-[700px] overflow-hidden">
        <Carousel slides={carouselSlides} autoPlay={false} />
      </section>

      {/* Portal Interface Cards */}
      <section className="relative z-10 py-20 px-4 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">{t('home.portal.title')}</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('home.portal.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Dashboard Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <Card 
                className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full cursor-pointer"
                onClick={() => router.push('/dashboard')}
              >
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-blue-100 rounded-2xl group-hover:bg-blue-200 transition-colors duration-300">
                      <DashboardIconSVG className="w-20 h-20" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">{t('home.portal.dashboard.title')}</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    {t('home.portal.dashboard.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/dashboard')
                    }}
                  >
                    {t('home.portal.dashboard.cta')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Workspaces Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <Card 
                className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full cursor-pointer"
                onClick={() => router.push('/workspace')}
              >
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-green-100 rounded-2xl group-hover:bg-green-200 transition-colors duration-300">
                      <WorkspacesIconSVG className="w-20 h-20" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">{t('home.portal.workspaces.title')}</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    {t('home.portal.workspaces.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/workspace')
                    }}
                  >
                    {t('home.portal.workspaces.cta')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Workflows Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
            >
              <Card 
                className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full cursor-pointer"
                onClick={() => router.push('/workflows')}
              >
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-purple-100 rounded-2xl group-hover:bg-purple-200 transition-colors duration-300">
                      <WorkflowsIconSVG className="w-20 h-20" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">{t('home.portal.workflows.title')}</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    {t('home.portal.workflows.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/workflows')
                    }}
                  >
                    {t('home.portal.workflows.cta')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Modules Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
            >
              <Card 
                className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/90 backdrop-blur-sm h-full cursor-pointer"
                onClick={() => router.push('/modules')}
              >
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-orange-100 rounded-2xl group-hover:bg-orange-200 transition-colors duration-300">
                      <ModulesIconSVG className="w-20 h-20" />
                    </div>
                  </div>
                  <CardTitle className="text-xl font-semibold text-gray-900">{t('home.portal.modules.title')}</CardTitle>
                  <CardDescription className="text-gray-600 leading-relaxed">
                    {t('home.portal.modules.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/modules')
                    }}
                  >
                    {t('home.portal.modules.cta')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Auth Section - Only show for non-logged-in users */}
      {!user && (
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
      )}

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
