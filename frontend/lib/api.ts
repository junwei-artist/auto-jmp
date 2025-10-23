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
