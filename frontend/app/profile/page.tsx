'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  User, 
  Lock, 
  Mail, 
  Calendar, 
  Shield, 
  Trash2, 
  Save, 
  Eye, 
  EyeOff,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Building,
  Users
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { profileApi } from '@/lib/api'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLanguage } from '@/lib/language'
import { EnhancedProfileSettings } from '@/components/EnhancedProfileSettings'
import toast from 'react-hot-toast'

interface ProfileData {
  id: string
  email: string
  display_name?: string
  department_id?: string
  department_name?: string
  business_group_id?: string
  business_group_name?: string
  is_admin: boolean
  is_guest: boolean
  created_at: string
  last_login: string
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Fetch profile data
  const { data: profileData, isLoading: profileLoading, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.getProfile,
    enabled: !!user && !user.is_guest
  })

  // Update email mutation
  const updateEmailMutation = useMutation({
    mutationFn: profileApi.updateProfile,
    onSuccess: (data) => {
      toast.success(t('messages.profileUpdated'))
      setEmail(data.user.email)
      refetch()
    },
    onError: (error: any) => {
      toast.error(error.message || t('common.error'))
    }
  })

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: profileApi.changePassword,
    onSuccess: (data) => {
      toast.success(t('messages.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error: any) => {
      toast.error(error.message || t('common.error'))
    }
  })

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: profileApi.deleteAccount,
    onSuccess: () => {
      toast.success(t('messages.accountDeleted'))
      logout()
      router.push('/')
    },
    onError: (error: any) => {
      toast.error(error.message || t('common.error'))
    }
  })

  // Initialize email from profile data
  useEffect(() => {
    if (profileData) {
      setEmail(profileData.email || '')
    }
  }, [profileData])

  const handleUpdateEmail = () => {
    if (!email.trim()) {
      toast.error(t('messages.emailRequired'))
      return
    }
    
    if (email === profileData?.email) {
      toast.error(t('messages.emailSame'))
      return
    }

    updateEmailMutation.mutate({ email: email.trim() })
  }

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('messages.passwordRequired'))
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('messages.passwordMismatch'))
      return
    }

    if (newPassword.length < 8) {
      toast.error(t('messages.passwordTooShort'))
      return
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword
    })
  }

  const handleDeleteAccount = () => {
    if (window.confirm(t('profile.danger.deleteWarning'))) {
      deleteAccountMutation.mutate()
    }
  }

  // Redirect guest users
  if (user?.is_guest) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <CardTitle>{t('profile.notAvailable')}</CardTitle>
            <CardDescription>
              {t('profile.guestMessage')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => router.push('/')} 
              className="w-full"
            >
              {t('profile.goHome')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('profile.title')}</h1>
          <p className="text-gray-600 mt-2">{t('profile.subtitle')}</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {t('profile.tabs.profile')}
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {t('profile.tabs.security')}
            </TabsTrigger>
            <TabsTrigger value="danger" className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              {t('profile.tabs.danger')}
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <EnhancedProfileSettings />
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  {t('profile.security.title')}
                </CardTitle>
                <CardDescription>
                  {t('profile.security.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">{t('profile.security.currentPassword')}</Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter your current password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t('profile.security.newPassword')}</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter your new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t('profile.security.confirmPassword')}</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button 
                    onClick={handleChangePassword}
                    disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full md:w-auto"
                  >
                    {changePasswordMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('profile.security.changingPassword')}
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        {t('profile.security.changePassword')}
                      </>
                    )}
                  </Button>
                </div>

                {/* Password Requirements */}
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{t('profile.security.requirements')}</strong>
                    <ul className="mt-2 list-disc list-inside space-y-1">
                      <li>{t('profile.security.requirements.minLength')}</li>
                      <li>{t('profile.security.requirements.different')}</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Danger Zone Tab */}
          <TabsContent value="danger" className="space-y-6">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                  {t('profile.danger.title')}
                </CardTitle>
                <CardDescription>
                  {t('profile.danger.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <h3 className="font-medium text-red-800 mb-2">{t('profile.danger.deleteAccount')}</h3>
                  <p className="text-sm text-red-700 mb-4">
                    {t('profile.danger.deleteWarning')}
                  </p>
                  <Button 
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={deleteAccountMutation.isPending}
                    className="w-full md:w-auto"
                  >
                    {deleteAccountMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('profile.danger.deletingAccount')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('profile.danger.deleteAccount')}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
