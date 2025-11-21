'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Plus,
  Edit,
  Trash2,
  X,
  Save
} from 'lucide-react'
import { toast } from 'sonner'

interface Zone {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  is_active: boolean
  display_order: number
  post_count: number
  created_at: string
  updated_at: string
}

export default function AdminZonesPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [zones, setZones] = useState<Zone[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '',
    color: '#3B82F6',
    display_order: 0,
    is_active: true
  })

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token')
      if (!token) {
        router.push('/admin')
        return
      }

      try {
        const response = await fetch('/api/v1/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const userData = await response.json()
          if (userData.is_admin) {
            setIsAuthenticated(true)
            await fetchZones()
          } else {
            router.push('/admin')
          }
        } else {
          router.push('/admin')
        }
      } catch (error) {
        router.push('/admin')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const fetchZones = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/v1/community/zones', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setZones(data)
      } else {
        toast.error('Failed to load zones')
      }
    } catch (error) {
      console.error('Error fetching zones:', error)
      toast.error('Failed to load zones')
    }
  }

  const handleCreate = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/v1/community/zones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast.success('Zone created successfully')
        setShowCreateModal(false)
        setFormData({ name: '', description: '', icon: '', color: '#3B82F6', display_order: 0, is_active: true })
        await fetchZones()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to create zone')
      }
    } catch (error) {
      console.error('Error creating zone:', error)
      toast.error('Failed to create zone')
    }
  }

  const handleUpdate = async () => {
    if (!editingZone) return

    try {
      const token = localStorage.getItem('access_token')
      const updateData = {
        ...formData,
        is_active: formData.is_active !== undefined ? formData.is_active : editingZone.is_active
      }
      const response = await fetch(`/api/v1/community/zones/${editingZone.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      })

      if (response.ok) {
        toast.success('Zone updated successfully')
        setEditingZone(null)
        setFormData({ name: '', description: '', icon: '', color: '#3B82F6', display_order: 0, is_active: true })
        await fetchZones()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to update zone')
      }
    } catch (error) {
      console.error('Error updating zone:', error)
      toast.error('Failed to update zone')
    }
  }

  const handleDelete = async (zoneId: string) => {
    if (!confirm('Are you sure you want to delete this zone? Posts in this zone will not be deleted.')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/community/zones/${zoneId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        toast.success('Zone deleted successfully')
        await fetchZones()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to delete zone')
      }
    } catch (error) {
      console.error('Error deleting zone:', error)
      toast.error('Failed to delete zone')
    }
  }

  const startEdit = (zone: Zone) => {
    setEditingZone(zone)
    setFormData({
      name: zone.name,
      description: zone.description || '',
      icon: zone.icon || '',
      color: zone.color || '#3B82F6',
      display_order: zone.display_order,
      is_active: zone.is_active
    })
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_id')
    router.push('/admin')
    window.location.reload()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back to Dashboard
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Community Zones</h1>
                <p className="text-gray-600">Manage community zones</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Zone
              </Button>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {zones.map((zone) => (
            <Card key={zone.id} className={!zone.is_active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {zone.icon && (
                      <div 
                        className="text-2xl"
                        style={{ color: zone.color }}
                      >
                        {zone.icon}
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">{zone.name}</CardTitle>
                      {zone.description && (
                        <p className="text-sm text-gray-600 mt-1">{zone.description}</p>
                      )}
                    </div>
                  </div>
                  {!zone.is_active && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">Inactive</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Posts:</span> {zone.post_count}
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Order:</span> {zone.display_order}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(zone)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(zone.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {zones.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No zones yet. Create your first zone!</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingZone) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md m-4">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingZone ? 'Edit Zone' : 'Create Zone'}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreateModal(false)
                    setEditingZone(null)
                    setFormData({ name: '', description: '', icon: '', color: '#3B82F6', display_order: 0, is_active: true })
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Zone name"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Zone description"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="icon">Icon (emoji or icon name)</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="🎯 or forum"
                />
              </div>
              <div>
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-20"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#3B82F6"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              {editingZone && (
                <div>
                  <Label>
                    <input
                      type="checkbox"
                      checked={formData.is_active !== undefined ? formData.is_active : editingZone.is_active}
                      onChange={(e) => {
                        setFormData({ ...formData, is_active: e.target.checked })
                      }}
                      className="mr-2"
                    />
                    Active
                  </Label>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={editingZone ? handleUpdate : handleCreate}
                  className="flex-1"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingZone ? 'Update' : 'Create'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false)
                    setEditingZone(null)
                    setFormData({ name: '', description: '', icon: '', color: '#3B82F6', display_order: 0, is_active: true })
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

