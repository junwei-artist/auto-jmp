'use client'

import { createContext, useContext, ReactNode, useRef } from 'react'
import { useEffect, useState } from 'react'

interface SocketContextType {
  socket: WebSocket | null
  isConnected: boolean
  subscribeToRun: (runId: string, callback: (data: any) => void) => void
  unsubscribeFromRun: (runId: string) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const updateCallbacks = useRef<Map<string, (data: any) => void>>(new Map())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connectWebSocket = () => {
    // For WebSocket, we still need the full URL since rewrites don't work with WS
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
    const wsUrl = backendUrl.replace('http', 'ws')
    
    try {
      const newSocket = new WebSocket(`${wsUrl}/ws/general`)

      newSocket.onopen = () => {
        console.log('Connected to WebSocket')
        setIsConnected(true)
        // Clear any pending reconnection attempts
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
      }

      newSocket.onclose = (event) => {
        console.log('Disconnected from WebSocket', event.code, event.reason)
        setIsConnected(false)
        
        // Attempt to reconnect after 3 seconds if not a clean close
        if (event.code !== 1000 && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect WebSocket...')
            connectWebSocket()
          }, 3000)
        }
      }

      newSocket.onerror = (error) => {
        console.error('WebSocket connection error:', error)
        setIsConnected(false)
      }

      newSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('WebSocket message received:', data)
          
          // Handle different message types
          if (data.run_id) {
            // Route any run-scoped messages to the subscriber (run_created, run_started, run_progress, run_completed, run_failed, run_canceled, run_update)
            const callback = updateCallbacks.current.get(data.run_id)
            if (callback) {
              callback(data)
            }
          } else if (data.type === 'pong') {
            // Handle ping/pong for connection health
            console.log('Received pong:', data.data)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      setSocket(newSocket)
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      setIsConnected(false)
    }
  }

  useEffect(() => {
    connectWebSocket()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (socket) {
        socket.close(1000, 'Component unmounting')
      }
    }
  }, [])

  const subscribeToRun = (runId: string, callback: (data: any) => void) => {
    updateCallbacks.current.set(runId, callback)
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'subscribe', run_id: runId }))
    }
  }

  const unsubscribeFromRun = (runId: string) => {
    updateCallbacks.current.delete(runId)
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'unsubscribe', run_id: runId }))
    }
  }

  return (
    <SocketContext.Provider value={{ socket, isConnected, subscribeToRun, unsubscribeFromRun }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
