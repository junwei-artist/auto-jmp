'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Users, UserPlus, Crown, Shield, Eye, Trash2, Edit } from 'lucide-react'
import { toast } from 'sonner'

interface ProjectMember {
  user_id: string
  email?: string
  role: 'owner' | 'member' | 'watcher'
  is_guest: boolean
}

interface ProjectMembershipProps {
  projectId: string
  currentUserRole: 'owner' | 'member' | 'watcher'
  onMembershipChange?: () => void
}

export function ProjectMembership({ projectId, currentUserRole, onMembershipChange }: ProjectMembershipProps) {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null)
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<'member' | 'watcher'>('member')

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'

  // Helper function to get auth token
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
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
      toast.error('Failed to load members')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [projectId])

  // Add member
  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) {
      toast.error('Please enter an email address')
      return
    }

    try {
      // First, we need to find the user by email
      const userResponse = await fetch(`${backendUrl}/api/v1/admin/users`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!userResponse.ok) {
        throw new Error('Failed to fetch users')
      }
      
      const users = await userResponse.json()
      const user = users.find((u: any) => u.email === newMemberEmail.trim())
      
      if (!user) {
        toast.error('User not found')
        return
      }

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

      toast.success('Member added successfully')
      setNewMemberEmail('')
      setNewMemberRole('member')
      setIsAddDialogOpen(false)
      fetchMembers()
      onMembershipChange?.()
    } catch (error: any) {
      console.error('Error adding member:', error)
      toast.error(error.message || 'Failed to add member')
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

      toast.success('Member role updated successfully')
      fetchMembers()
      onMembershipChange?.()
    } catch (error: any) {
      console.error('Error updating member role:', error)
      toast.error(error.message || 'Failed to update member role')
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

      toast.success('Member removed successfully')
      fetchMembers()
      onMembershipChange?.()
    } catch (error: any) {
      console.error('Error removing member:', error)
      toast.error(error.message || 'Failed to remove member')
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-4 w-4 text-yellow-600" />
      case 'member': return <Shield className="h-4 w-4 text-blue-600" />
      case 'watcher': return <Eye className="h-4 w-4 text-gray-600" />
      default: return <Users className="h-4 w-4" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-yellow-100 text-yellow-800'
      case 'member': return 'bg-blue-100 text-blue-800'
      case 'watcher': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const canManageMembers = currentUserRole === 'owner'

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Project Members</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading members...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Project Members</span>
            </CardTitle>
            <CardDescription>
              Manage project access and permissions
            </CardDescription>
          </div>
          {canManageMembers && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Project Member</DialogTitle>
                  <DialogDescription>
                    Add a new member to this project with appropriate permissions.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <Select value={newMemberRole} onValueChange={(value: 'member' | 'watcher') => setNewMemberRole(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">
                          <div className="flex items-center space-x-2">
                            <Shield className="h-4 w-4 text-blue-600" />
                            <span>Member - Can initiate runs and edit</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="watcher">
                          <div className="flex items-center space-x-2">
                            <Eye className="h-4 w-4 text-gray-600" />
                            <span>Watcher - Can only view</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddMember}>
                    Add Member
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                {getRoleIcon(member.role)}
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">
                      {member.email || 'Guest User'}
                    </span>
                    {member.is_guest && (
                      <Badge variant="outline" className="text-xs">
                        Guest
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge className={getRoleColor(member.role)}>
                      {member.role}
                    </Badge>
                  </div>
                </div>
              </div>
              {canManageMembers && member.role !== 'owner' && (
                <div className="flex items-center space-x-2">
                  <Dialog open={isEditDialogOpen && editingMember?.user_id === member.user_id} onOpenChange={(open) => {
                    if (!open) {
                      setEditingMember(null)
                      setIsEditDialogOpen(false)
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingMember(member)
                          setIsEditDialogOpen(true)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Update Member Role</DialogTitle>
                        <DialogDescription>
                          Change the role for {member.email || 'Guest User'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="edit-role">Role</Label>
                          <Select 
                            value={editingMember?.role || 'member'} 
                            onValueChange={(value: 'member' | 'watcher') => {
                              if (editingMember) {
                                setEditingMember({ ...editingMember, role: value })
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">
                                <div className="flex items-center space-x-2">
                                  <Shield className="h-4 w-4 text-blue-600" />
                                  <span>Member - Can initiate runs and edit</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="watcher">
                                <div className="flex items-center space-x-2">
                                  <Eye className="h-4 w-4 text-gray-600" />
                                  <span>Watcher - Can only view</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setEditingMember(null)
                          setIsEditDialogOpen(false)
                        }}>
                          Cancel
                        </Button>
                        <Button onClick={() => {
                          if (editingMember) {
                            handleUpdateMemberRole(editingMember.user_id, editingMember.role)
                            setEditingMember(null)
                            setIsEditDialogOpen(false)
                          }
                        }}>
                          Update Role
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Member</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove {member.email || 'Guest User'} from this project? 
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Remove Member
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No members found</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
