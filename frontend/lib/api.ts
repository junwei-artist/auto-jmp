'use client'

import { useAuth } from './auth'

// Use relative URLs for API calls (they'll be rewritten by Next.js)
const API_BASE_URL = '/api'

export class ApiClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('access_token')
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    return headers
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid, clear auth data
        localStorage.removeItem('access_token')
        localStorage.removeItem('user_id')
        localStorage.removeItem('is_guest')
        window.location.href = '/'
        throw new Error('Authentication failed')
      }
      
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }
    
    return response.json()
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    })
    
    return this.handleResponse<T>(response)
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    
    return this.handleResponse<T>(response)
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    
    return this.handleResponse<T>(response)
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PATCH',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })
    
    return this.handleResponse<T>(response)
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    })
    
    return this.handleResponse<T>(response)
  }
}

// Create a default instance
export const apiClient = new ApiClient()

// Auth-specific API methods
export const authApi = {
  async login(email: string, password: string): Promise<any> {
    return apiClient.post('/v1/auth/login', { email, password })
  },

  async register(email: string, password: string): Promise<any> {
    return apiClient.post('/v1/auth/register', { email, password })
  },

  async createGuestSession(): Promise<any> {
    return apiClient.post('/v1/auth/guest')
  },

  async getCurrentUser(): Promise<any> {
    return apiClient.get('/v1/auth/me')
  },

  async refreshToken(): Promise<any> {
    const token = localStorage.getItem('refresh_token')
    if (!token) {
      throw new Error('No refresh token available')
    }
    
    // Use relative URL - Next.js will rewrite it
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    })
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid, clear auth data
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_id')
        localStorage.removeItem('is_guest')
        window.location.href = '/'
        throw new Error('Authentication failed')
      }
      
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }
    
    return response.json()
  }
}

// Project-specific API methods
export const projectApi = {
  async createProject(data: { name: string; description?: string; allow_guest?: boolean; is_public?: boolean }): Promise<any> {
    return apiClient.post('/v1/projects/', data)
  },

  async getProjects(): Promise<any[]> {
    return apiClient.get('/v1/projects/')
  },

  async getOwnedProjects(): Promise<any[]> {
    return apiClient.get('/v1/projects/owned')
  },

  async getMemberProjects(): Promise<any[]> {
    return apiClient.get('/v1/projects/member')
  },

  async getProject(id: string): Promise<any> {
    return apiClient.get(`/v1/projects/${id}`)
  },

  async updateProject(id: string, data: any): Promise<any> {
    return apiClient.patch(`/v1/projects/${id}`, data)
  },

  async deleteProject(id: string): Promise<any> {
    return apiClient.delete(`/v1/projects/${id}`)
  },

  async getProjectRuns(projectId: string): Promise<any[]> {
    return apiClient.get(`/v1/projects/${projectId}/runs`)
  },

  async getProjectArtifacts(projectId: string): Promise<any[]> {
    return apiClient.get(`/v1/projects/${projectId}/artifacts`)
  },

  async getProjectHistory(projectId: string): Promise<any[]> {
    return apiClient.get(`/v1/projects/${projectId}/history`)
  },

  // Drawing folder methods
  async getDrawingFolders(projectId: string): Promise<any[]> {
    return apiClient.get(`/v1/projects/${projectId}/drawing-folders`)
  },

  async createDrawingFolder(projectId: string, description: string): Promise<any> {
    const formData = new FormData()
    formData.append('description', description || '')
    
    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to create folder' }))
      throw new Error(errorData.detail || 'Failed to create folder')
    }
    
    return response.json()
  },

  async createDrawingFolderFromPdf(projectId: string, pdfFile: File, description?: string): Promise<any> {
    const formData = new FormData()
    formData.append('pdf_file', pdfFile)
    if (description) {
      formData.append('description', description)
    }
    
    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders/from-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to create folder from PDF' }))
      throw new Error(errorData.detail || 'Failed to create folder from PDF')
    }
    
    return response.json()
  },

  async updateDrawingFolder(projectId: string, folderId: string, description: string): Promise<any> {
    const formData = new FormData()
    formData.append('description', description || '')
    
    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders/${folderId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to update folder' }))
      throw new Error(errorData.detail || 'Failed to update folder')
    }
    
    return response.json()
  },

  async deleteDrawingFolder(projectId: string, folderId: string): Promise<any> {
    return apiClient.delete(`/v1/projects/${projectId}/drawing-folders/${folderId}`)
  },

  async getDrawingFolder(projectId: string, folderId: string): Promise<any> {
    return apiClient.get(`/v1/projects/${projectId}/drawing-folders/${folderId}`)
  },

  async getDrawingImages(projectId: string, folderId: string): Promise<any[]> {
    return apiClient.get(`/v1/projects/${projectId}/drawing-folders/${folderId}/images`)
  },

  async uploadDrawingImage(projectId: string, folderId: string, file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)
    
    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders/${folderId}/images`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to upload image' }))
      throw new Error(errorData.detail || 'Failed to upload image')
    }
    
    return response.json()
  },

  async deleteDrawingImage(projectId: string, folderId: string, imageId: string): Promise<any> {
    return apiClient.delete(`/v1/projects/${projectId}/drawing-folders/${folderId}/images/${imageId}`)
  },

  async downloadDrawingFolderZip(projectId: string, folderId: string): Promise<void> {
    const token = localStorage.getItem('access_token')
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
    const url = `${backendUrl}/api/v1/projects/${projectId}/drawing-folders/${folderId}/download-zip`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to download folder' }))
      throw new Error(errorData.detail || 'Failed to download folder')
    }
    
    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition')
    let filename = `drawing_folder_${folderId}.zip`
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
      if (filenameMatch) {
        filename = filenameMatch[1]
      }
    }
    
    // Create blob and download
    const blob = await response.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)
  },

  async getDrawingAnnotations(projectId: string, folderId: string): Promise<any> {
    return apiClient.get(`/v1/projects/${projectId}/drawing-folders/${folderId}/annotations`)
  },

  async updateDrawingAnnotations(projectId: string, folderId: string, annotations: any[]): Promise<any> {
    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders/${folderId}/annotations`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(annotations),
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to update annotations' }))
      throw new Error(errorData.detail || 'Failed to update annotations')
    }
    
    return response.json()
  },

  async generateDrawingOutput(projectId: string, folderId: string, drawYolo: boolean = false): Promise<any> {
    const formData = new FormData()
    formData.append('draw_yolo', drawYolo.toString())
    
    const token = localStorage.getItem('access_token')
    const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders/${folderId}/generate-output`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to generate output' }))
      throw new Error(errorData.detail || 'Failed to generate output')
    }
    
    return response.json()
  }
}

// Run-specific API methods
export const runApi = {
  async getRuns(): Promise<any[]> {
    return apiClient.get('/v1/runs/')
  },

  async getRun(id: string): Promise<any> {
    return apiClient.get(`/v1/runs/${id}`)
  },

  async createRun(data: any): Promise<any> {
    return apiClient.post('/v1/runs/', data)
  },

  async updateRun(id: string, data: any): Promise<any> {
    return apiClient.put(`/v1/runs/${id}`, data)
  },

  async deleteRun(id: string): Promise<any> {
    return apiClient.delete(`/v1/runs/${id}`)
  },

  async updateRunTaskName(id: string, taskName: string): Promise<any> {
    return apiClient.patch(`/v1/runs/${id}/task-name`, { task_name: taskName })
  }
}

// Profile-specific API methods
export const profileApi = {
  async getProfile(): Promise<any> {
    return apiClient.get('/v1/profile/profile')
  },

  async updateProfile(data: { email?: string }): Promise<any> {
    return apiClient.put('/v1/profile/profile', data)
  },

  async changePassword(data: { current_password: string; new_password: string }): Promise<any> {
    return apiClient.put('/v1/profile/password', data)
  },

  async deleteAccount(): Promise<any> {
    return apiClient.delete('/v1/profile/account')
  }
}
