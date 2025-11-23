'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, ArrowRight, LayoutDashboard, FolderKanban, GitBranch, Box, LogIn, UserPlus, User } from 'lucide-react'
import { DashboardIconSVG, WorkspacesIconSVG, WorkflowsIconSVG, ModulesIconSVG } from '@/components/svg/PortalIcons'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'
import { AuthModal } from '@/components/AuthModal'

import { HeroSection } from '@/components/HeroSection'
import { TopNavBar } from '@/components/TopNavBar'
import { QualityManagementInfo } from '@/components/QualityManagementInfo'

import { UniverseBackground } from '@/components/UniverseBackground'

export default function HomePage() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  }

  const apps = [
    {
      titleKey: 'home.app.dashboard.title',
      descKey: 'home.app.dashboard.description',
      icon: <DashboardIconSVG />,
      color: 'from-blue-500 to-cyan-500',
      link: '/dashboard'
    },
    {
      titleKey: 'home.app.workspaces.title',
      descKey: 'home.app.workspaces.description',
      icon: <WorkspacesIconSVG />,
      color: 'from-purple-500 to-pink-500',
      link: '/workspace'
    },
    {
      titleKey: 'home.app.workflows.title',
      descKey: 'home.app.workflows.description',
      icon: <WorkflowsIconSVG />,
      color: 'from-orange-500 to-red-500',
      link: '/workflows'
    },
    {
      titleKey: 'home.app.modules.title',
      descKey: 'home.app.modules.description',
      icon: <ModulesIconSVG />,
      color: 'from-green-500 to-emerald-500',
      link: '/modules'
    }
  ]

  return (
    <div className="min-h-screen relative overflow-hidden font-sans selection:bg-blue-500/30">
      <UniverseBackground />

      {/* Top Navigation Bar */}
      <TopNavBar onSignInClick={() => setShowAuthModal(true)} />

      <main className="relative z-10 max-w-screen-2xl mx-auto min-h-screen flex flex-col pt-24 pb-12">
        <div className="w-full backdrop-blur-xl bg-black/20 rounded-[3rem] border border-white/10 py-6 md:py-12 shadow-2xl">
          {/* Hero Section */}
          <HeroSection onGetStartedClick={() => setShowAuthModal(true)} />

          {/* Quality Management Info Section */}
          <QualityManagementInfo />
        </div>

        {/* Welcome Text (Only show if user is logged in, otherwise Hero covers it) */}
        {user && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center mb-12 mt-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight drop-shadow-md">
              {t('home.welcomeBack')}
            </h2>
          </motion.div>
        )}

        {/* App Grid / Widgets */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl mx-auto"
        >
          {apps.map((app, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
              className="group cursor-pointer"
              onClick={() => router.push(app.link)}
            >
              <div className="backdrop-blur-md h-full p-6 rounded-[2rem] flex flex-col items-center text-center transition-all duration-300 hover:shadow-2xl border border-white/10 bg-white/10 hover:bg-white/20 shadow-xl">
                <div className={`w-24 h-24 rounded-[1.5rem] bg-gradient-to-br ${app.color} flex items-center justify-center mb-6 shadow-lg group-hover:shadow-xl transition-all duration-300`}>
                  <div className="text-white drop-shadow-md transform group-hover:scale-110 transition-transform duration-300">
                    {app.icon}
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-2">{t(app.titleKey)}</h3>
                <p className="text-sm text-white/80 leading-relaxed">
                  {t(app.descKey)}
                </p>
                <div className="mt-auto pt-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="inline-flex items-center text-sm font-medium text-blue-300">
                    Open App <ArrowRight className="ml-1 w-4 h-4" />
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Auth Modal */}
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </main>

      {/* Footer Credit */}
      <footer className="relative z-10 w-full py-6 text-center">
        <p className="text-sm text-white/40 font-light tracking-wider">
          {t('home.footer.developedBy')}
        </p>
      </footer>
    </div>
  )
}
