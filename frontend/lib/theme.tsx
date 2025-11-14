'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type ThemeName = 'dark' | 'light' | 'colorful' | 'ocean' | 'forest' | 'sunset'

interface ThemeContextType {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  themes: ThemeName[]
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const themes: ThemeName[] = ['dark', 'light', 'colorful', 'ocean', 'forest', 'sunset']

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('app-theme') as ThemeName
      return savedTheme && themes.includes(savedTheme) ? savedTheme : 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app-theme', theme)
      // Apply theme class to document root for global styling
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

