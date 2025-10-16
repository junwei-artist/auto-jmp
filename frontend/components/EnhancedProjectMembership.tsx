'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserPlus, Search, Users, Building, UserCheck, Mail, Trash2, Edit } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'

interface ProjectMember {
  user_id: string
  email?: string
  display_name?: string
  role: string
  is_guest: boolean
  department_name?: string
  business_group_name?: string
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

interface RoleItem {
  id: string
  name: string
  display_name: string
  description?: string
}

interface User {
  id: string
  email?: string
  display_name?: string
  department_name?: string
  business_group_name?: string
  is_admin: boolean
  is_guest: boolean
}

interface EnhancedProjectMembershipProps {
  projectId: string
  currentUserRole: string
}

const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token')
  }
  return null
}

export function EnhancedProjectMembership({ projectId, currentUserRole }: EnhancedProjectMembershipProps) {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [businessGroups, setBusinessGroups] = useState<BusinessGroup[]>([])
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [selectedBusinessGroup, setSelectedBusinessGroup] = useState<string>('all')
  const [newMemberRole, setNewMemberRole] = useState('watcher')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const { ready, user } = useAuth()
  const { t } = useLanguage()

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'

  // Fetch roles
  const fetchRoles = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/roles/roles`, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` },
        credentials: 'include'
      })
      if (!response.ok) throw new Error('Failed to fetch roles')
      const data = await response.json()
      setRoles(data)
      // set default add-member role to first non-owner role if available
      const nonOwner = data.find((r: RoleItem) => r.name !== 'OWNER')
      if (nonOwner) setNewMemberRole(nonOwner.name.toLowerCase())
    } catch (err) {
      // Fallback to default roles if API not available
      const fallback: RoleItem[] = [
        { id: 'MEMBER', name: 'MEMBER', display_name: 'Member' },
        { id: 'WATCHER', name: 'WATCHER', display_name: 'Watcher' }
      ]
      setRoles(fallback)
    }
  }

  // Fetch members
  const fetchMembers = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/members`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch members')
      }
      
      const data = await response.json()
      setMembers(data)
    } catch (error) {
      console.error('Error fetching members:', error)
      toast.error(t('membership.loadMembersFailed'))
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

  // Search users
  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.append('q', searchQuery.trim())
      if (selectedDepartment && selectedDepartment !== 'all') params.append('department_id', selectedDepartment)
      if (selectedBusinessGroup && selectedBusinessGroup !== 'all') params.append('business_group_id', selectedBusinessGroup)

      const response = await fetch(`${backendUrl}/api/v1/organization/users/search?${params}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to search users')
      }
      
      const data = await response.json()
      setSearchResults(data)
    } catch (error) {
      console.error('Error searching users:', error)
      toast.error(t('membership.searchUsersFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // Add member
  const handleAddMember = async (user: User) => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          user_id: user.id,
          role: newMemberRole
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to add member')
      }

      toast.success(t('membership.memberAdded', { name: user.display_name || user.email, role: newMemberRole }))
      await fetchMembers()
      setShowAddDialog(false)
      setSelectedUser(null)
    } catch (error) {
      console.error('Error adding member:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add member')
    }
  }

  // Update member role
  const handleUpdateMemberRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/members/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          user_id: userId,
          role: newRole
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to update member role')
      }

      toast.success(t('membership.roleUpdated'))
      await fetchMembers()
    } catch (error) {
      console.error('Error updating member role:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update member role')
    }
  }

  // Remove member
  const handleRemoveMember = async (userId: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to remove member')
      }

      toast.success(t('membership.memberRemoved'))
      await fetchMembers()
    } catch (error) {
      console.error('Error removing member:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to remove member')
    }
  }

  useEffect(() => {
    if (!ready || !user) return
    fetchMembers()
    fetchDepartments()
    fetchBusinessGroups()
    fetchRoles()
  }, [ready, user, projectId])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers()
    }, 300) // Debounce search

    return () => clearTimeout(timeoutId)
  }, [searchQuery, selectedDepartment, selectedBusinessGroup])

  if (currentUserRole !== 'owner') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('membership.title')}
          </CardTitle>
          <CardDescription>
            {t('membership.viewOnly.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    <UserCheck className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="font-medium">
                      {member.display_name || member.email || 'Unknown User'}
                    </div>
                    <div className="text-sm text-gray-600">
                      {member.department_name && (
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          {member.department_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                  {member.role}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t('membership.title')}
        </CardTitle>
        <CardDescription>
          {t('membership.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members">{t('membership.tabs.current')}</TabsTrigger>
            <TabsTrigger value="add">{t('membership.tabs.add')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="members" className="space-y-4">
            <div className="space-y-4">
              {members.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <UserCheck className="h-4 w-4 text-gray-600" />
                    </div>
                    <div>
                      <div className="font-medium">
                        {member.display_name || member.email || 'Unknown User'}
                      </div>
                      <div className="text-sm text-gray-600">
                        {member.department_name && (
                          <span className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            {member.department_name}
                          </span>
                        )}
                        {member.business_group_name && (
                          <span className="ml-2 text-blue-600">
                            {member.business_group_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role.toLowerCase() !== 'owner' && (
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => handleUpdateMemberRole(member.user_id, newRole)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles
                            .filter(r => r.name !== 'OWNER')
                            .map(r => (
                              <SelectItem key={r.id} value={r.name.toLowerCase()}>{r.display_name || r.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    {member.role.toLowerCase() !== 'owner' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('membership.removeMember')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('membership.removeConfirm', { name: member.display_name || member.email })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemoveMember(member.user_id)}>
                              {t('membership.remove')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {member.role.toLowerCase() === 'owner' && (
                      <Badge variant="default">{t('membership.owner')}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="add" className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="search">{t('membership.searchUsers')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="search"
                      placeholder={t('membership.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Button variant="outline" onClick={searchUsers}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="role">{t('membership.role')}</Label>
                  <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles
                        .filter(r => r.name !== 'OWNER')
                        .map(r => (
                          <SelectItem key={r.id} value={r.name.toLowerCase()}>{r.display_name || r.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="department">{t('membership.filterDepartment')}</Label>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('membership.allDepartments')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('membership.allDepartments')}</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name} ({dept.user_count} users)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="business-group">{t('membership.filterBusinessGroup')}</Label>
                  <Select value={selectedBusinessGroup} onValueChange={setSelectedBusinessGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('membership.allBusinessGroups')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('membership.allBusinessGroups')}</SelectItem>
                      {businessGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name} ({group.user_count} users)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>{t('membership.searchResults')}</Label>
                {isLoading ? (
                  <div className="text-center py-4">{t('membership.searching')}</div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    {searchQuery ? t('membership.noUsersFound') : t('membership.enterSearchTerm')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-medium">
                              {user.display_name || user.email || 'Unknown User'}
                            </div>
                            <div className="text-sm text-gray-600">
                              {user.department_name && (
                                <span className="flex items-center gap-1">
                                  <Building className="h-3 w-3" />
                                  {user.department_name}
                                </span>
                              )}
                              {user.business_group_name && (
                                <span className="ml-2 text-blue-600">
                                  {user.business_group_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleAddMember(user)}
                          disabled={members.some(m => m.user_id === user.id)}
                        >
                          {members.some(m => m.user_id === user.id) ? t('membership.alreadyMember') : t('membership.add')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
