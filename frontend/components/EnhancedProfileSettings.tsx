'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { User, Mail, Building, Users, Save, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface UserProfile {
  id: string
  email?: string
  display_name?: string
  department_id?: string
  department_name?: string
  business_group_id?: string
  business_group_name?: string
  is_admin: boolean
  is_guest: boolean
  created_at?: string
  last_login?: string
}

interface Department {
  id: string
  name: string
  description?: string
  user_count: number
}

interface BusinessGroup {
  id: string
  name: string
  description?: string
  user_count: number
}

interface EnhancedProfileSettingsProps {
  className?: string
}

const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token')
  }
  return null
}

export function EnhancedProfileSettings({ className }: EnhancedProfileSettingsProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [businessGroups, setBusinessGroups] = useState<BusinessGroup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Form state
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [businessGroupId, setBusinessGroupId] = useState('')

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'

  // Fetch user profile
  const fetchProfile = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${backendUrl}/api/v1/profile/profile`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch profile')
      }
      
      const data = await response.json()
      setProfile(data)
      
      // Set form values
      setDisplayName(data.display_name || '')
      setEmail(data.email || '')
      setDepartmentId(data.department_id || 'none')
      setBusinessGroupId(data.business_group_id || 'none')
    } catch (error) {
      console.error('Error fetching profile:', error)
      toast.error('Failed to load profile')
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/organization/departments`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch departments')
      }
      
      const data = await response.json()
      setDepartments(data)
    } catch (error) {
      console.error('Error fetching departments:', error)
    }
  }

  // Fetch business groups
  const fetchBusinessGroups = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/organization/business-groups`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch business groups')
      }
      
      const data = await response.json()
      setBusinessGroups(data)
    } catch (error) {
      console.error('Error fetching business groups:', error)
    }
  }

  // Save profile
  const saveProfile = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`${backendUrl}/api/v1/profile/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          display_name: displayName,
          email: email,
          department_id: departmentId === 'none' ? null : departmentId,
          business_group_id: businessGroupId === 'none' ? null : businessGroupId
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to update profile')
      }
      
      toast.success('Profile updated successfully')
      await fetchProfile() // Refresh profile data
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    fetchProfile()
    fetchDepartments()
    fetchBusinessGroups()
  }, [])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">Loading profile...</div>
        </CardContent>
      </Card>
    )
  }

  if (!profile) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            Failed to load profile
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Settings
        </CardTitle>
        <CardDescription>
          Update your personal information and organizational details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Basic Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
              />
            </div>
            
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                disabled={profile.is_guest}
              />
              {profile.is_guest && (
                <p className="text-sm text-gray-500 mt-1">
                  Guest users cannot change their email address
                </p>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Organizational Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Building className="h-4 w-4" />
            Organizational Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="department">Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                      {dept.description && (
                        <span className="text-gray-500 ml-2">- {dept.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="business-group">Business Group</Label>
              <Select value={businessGroupId} onValueChange={setBusinessGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select business group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No business group</SelectItem>
                  {businessGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                      {group.description && (
                        <span className="text-gray-500 ml-2">- {group.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Account Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Account Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-gray-600">Account Type</Label>
              <div className="mt-1">
                {profile.is_admin ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Administrator
                  </span>
                ) : profile.is_guest ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    Guest User
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Regular User
                  </span>
                )}
              </div>
            </div>
            
            <div>
              <Label className="text-gray-600">Member Since</Label>
              <div className="mt-1 text-gray-900">
                {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'}
              </div>
            </div>
            
            <div>
              <Label className="text-gray-600">Last Login</Label>
              <div className="mt-1 text-gray-900">
                {profile.last_login ? new Date(profile.last_login).toLocaleString() : 'Never'}
              </div>
            </div>
            
            <div>
              <Label className="text-gray-600">Current Department</Label>
              <div className="mt-1 text-gray-900">
                {profile.department_name || 'Not assigned'}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={saveProfile} 
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
