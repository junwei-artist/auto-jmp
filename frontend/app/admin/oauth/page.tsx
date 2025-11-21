'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface OAuthClient {
  id: string
  client_id: string
  client_name: string
  description?: string
  redirect_uris: string[]
  owner_id: string
  is_active: boolean
  created_at: string
}

export default function AdminOAuthPage() {
  const router = useRouter()
  const [clients, setClients] = useState<OAuthClient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newClient, setNewClient] = useState({ client_name: '', description: '', redirect_uris: '' })
  const [createdClient, setCreatedClient] = useState<any>(null)

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token')
      if (!token) { router.push('/admin'); return }
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (response.ok) {
          const userData = await response.json()
          if (userData.is_admin) {
            setIsAuthenticated(true)
            await fetchClients()
          } else { router.push('/admin') }
        } else { router.push('/admin') }
      } catch { router.push('/admin') } finally { setIsLoading(false) }
    }
    checkAuth()
  }, [router])

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/oauth/clients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) setClients(await response.json())
    } catch (error) { console.error('Failed to fetch:', error) }
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('access_token')
      const redirectUris = newClient.redirect_uris.split(',').map(u => u.trim()).filter(u => u)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/oauth/clients`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: newClient.client_name,
          description: newClient.description || null,
          redirect_uris: redirectUris
        })
      })
      if (response.ok) {
        setCreatedClient(await response.json())
        setShowCreateForm(false)
        setNewClient({ client_name: '', description: '', redirect_uris: '' })
        await fetchClients()
      } else { alert(`Failed: ${(await response.json()).detail}`) }
    } catch { alert('Failed to create') }
  }

  const handleDeleteClient = async (clientId: string) => {
    if (!confirm('Delete this client?')) return
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/oauth/clients/${clientId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) { await fetchClients(); alert('Deleted') }
    } catch { alert('Failed') }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    alert(`${label} copied!`)
    setCreatedClient(null)
  }

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div><p>Loading...</p></div>
    </div>
  }

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/admin/dashboard')} className="text-blue-600 hover:text-blue-800">← Back</button>
              <div><h1 className="text-2xl font-bold">OAuth2 Clients</h1><p className="text-gray-600">Manage external app access</p></div>
            </div>
            <button onClick={() => setShowCreateForm(!showCreateForm)} className="bg-blue-600 text-white px-4 py-2 rounded">Create Client</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {createdClient && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-6 mb-6">
            <h3 className="font-bold mb-4">⚠️ Save These Credentials!</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Client ID:</label>
                <div className="flex gap-2 mt-1">
                  <code className="bg-white px-3 py-2 rounded border flex-1 font-mono text-sm">{createdClient.client_id}</code>
                  <button onClick={() => copyToClipboard(createdClient.client_id, 'Client ID')} className="bg-blue-600 text-white px-4 py-2 rounded">Copy</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Client Secret:</label>
                <div className="flex gap-2 mt-1">
                  <code className="bg-white px-3 py-2 rounded border flex-1 font-mono text-sm">{createdClient.client_secret}</code>
                  <button onClick={() => copyToClipboard(createdClient.client_secret, 'Secret')} className="bg-blue-600 text-white px-4 py-2 rounded">Copy & Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreateForm && (
          <div className="bg-white p-6 rounded shadow mb-6">
            <h3 className="font-medium mb-4">Create OAuth2 Client</h3>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Client Name *</label>
                <input type="text" value={newClient.client_name} onChange={(e) => setNewClient({...newClient, client_name: e.target.value})} required className="w-full px-3 py-2 border rounded" /></div>
              <div><label className="block text-sm font-medium mb-1">Description</label>
                <input type="text" value={newClient.description} onChange={(e) => setNewClient({...newClient, description: e.target.value})} className="w-full px-3 py-2 border rounded" /></div>
              <div><label className="block text-sm font-medium mb-1">Redirect URIs * (comma-separated)</label>
                <input type="text" value={newClient.redirect_uris} onChange={(e) => setNewClient({...newClient, redirect_uris: e.target.value})} placeholder="http://localhost:3000/callback" required className="w-full px-3 py-2 border rounded" /></div>
              <div className="flex gap-3">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Create</button>
                <button type="button" onClick={() => setShowCreateForm(false)} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white shadow rounded">
          <div className="px-6 py-4 border-b"><h3 className="font-medium">OAuth2 Clients ({clients.length})</h3></div>
          {clients.length === 0 ? (
            <div className="p-12 text-center"><p className="text-gray-500">No clients yet</p>
              <button onClick={() => setShowCreateForm(true)} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded">Create Client</button></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y">
                <thead className="bg-gray-50">
                  <tr><th className="px-6 py-3 text-left text-xs font-medium uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Client ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Redirect URIs</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clients.map((client) => (
                    <tr key={client.id}>
                      <td className="px-6 py-4"><div className="font-medium">{client.client_name}</div></td>
                      <td className="px-6 py-4"><code className="bg-gray-100 px-2 py-1 rounded text-xs">{client.client_id}</code></td>
                      <td className="px-6 py-4">{client.redirect_uris.map((uri, i) => <div key={i}><code className="text-xs">{uri}</code></div>)}</td>
                      <td className="px-6 py-4"><button onClick={() => handleDeleteClient(client.client_id)} className="text-red-600">Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
