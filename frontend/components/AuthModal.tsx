'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, LogIn, UserPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth'
import { authApi } from '@/lib/api'
import { useMutation } from '@tanstack/react-query'
import { useLanguage } from '@/lib/language'
import toast from 'react-hot-toast'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { login } = useAuth()
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('login')

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return authApi.login(email, password)
    },
    onSuccess: (data) => {
      login(data.access_token, data.refresh_token, data.user_id, data.is_guest, data.is_admin)
      toast.success(t('auth.welcome'))
      onClose()
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
      onClose()
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
      onClose()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    loginMutation.mutate({
      email: formData.get('email') as string,
      password: formData.get('password') as string
    })
  }

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    registerMutation.mutate({
      email: formData.get('email') as string,
      password: formData.get('password') as string
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-md pointer-events-auto">
              <div className="relative glass-morphism rounded-[2rem] p-1 shadow-2xl bg-white/80 dark:bg-black/80 border border-white/20">

                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute -top-3 -right-3 p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors z-10"
                >
                  <X className="w-5 h-5" />
                </button>

                <Tabs defaultValue="login" className="w-full" onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2 bg-gray-100/50 dark:bg-gray-900/50 p-1 rounded-[1.8rem]">
                    <TabsTrigger
                      value="login"
                      className="rounded-[1.5rem] data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm transition-all duration-300"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      {t('auth.login')}
                    </TabsTrigger>
                    <TabsTrigger
                      value="register"
                      className="rounded-[1.5rem] data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm transition-all duration-300"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      {t('auth.register')}
                    </TabsTrigger>
                  </TabsList>

                  <div className="p-6">
                    <TabsContent value="login" className="mt-0 space-y-4">
                      <div className="text-center mb-6">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Welcome Back</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Enter your credentials to access your account</p>
                      </div>
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="email" className="ml-1 text-gray-700 dark:text-gray-300">Email</Label>
                          <Input id="email" name="email" type="email" required className="rounded-xl bg-white/50 dark:bg-white/10 border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/20 transition-all" placeholder="name@example.com" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password" className="ml-1 text-gray-700 dark:text-gray-300">Password</Label>
                          <Input id="password" name="password" type="password" required className="rounded-xl bg-white/50 dark:bg-white/10 border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/20 transition-all" placeholder="••••••••" />
                        </div>
                        <Button type="submit" className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 transition-all duration-300 h-11" disabled={loginMutation.isPending}>
                          {loginMutation.isPending ? <Loader2 className="animate-spin" /> : t('auth.login')}
                        </Button>
                      </form>
                    </TabsContent>

                    <TabsContent value="register" className="mt-0 space-y-4">
                      <div className="text-center mb-6">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Create Account</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Join us to start analyzing your data</p>
                      </div>
                      <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reg-email" className="ml-1 text-gray-700 dark:text-gray-300">Email</Label>
                          <Input id="reg-email" name="email" type="email" required className="rounded-xl bg-white/50 dark:bg-white/10 border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/20 transition-all" placeholder="name@example.com" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-password" className="ml-1 text-gray-700 dark:text-gray-300">Password</Label>
                          <Input id="reg-password" name="password" type="password" required className="rounded-xl bg-white/50 dark:bg-white/10 border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/20 transition-all" placeholder="••••••••" />
                        </div>
                        <Button type="submit" className="w-full rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/30 transition-all duration-300 h-11" disabled={registerMutation.isPending}>
                          {registerMutation.isPending ? <Loader2 className="animate-spin" /> : t('auth.register')}
                        </Button>
                      </form>
                    </TabsContent>

                    <div className="mt-6 pt-6 border-t border-gray-200/50 dark:border-white/10">
                      <Button
                        variant="ghost"
                        className="w-full rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
                        onClick={() => guestMutation.mutate()}
                        disabled={guestMutation.isPending}
                      >
                        {t('auth.tryAsGuest')}
                      </Button>
                    </div>
                  </div>
                </Tabs>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
