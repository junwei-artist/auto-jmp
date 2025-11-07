'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { 
  Home, 
  LayoutDashboard, 
  FolderKanban, 
  User, 
  LogOut, 
  LogIn,
  Settings,
  Menu,
  X,
  Circle,
  Package,
  Workflow
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout, isLoading, ready } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    router.push('/')
  }

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/workspace', label: 'Workspaces', icon: FolderKanban },
    { href: '/workflows', label: 'Workflows', icon: Workflow },
    { href: '/modules', label: 'Modules', icon: Package },
  ]

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Navigation */}
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                <LayoutDashboard className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Data Analysis
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.href}
                    variant={isActive(item.href) ? "default" : "ghost"}
                    size="sm"
                    onClick={() => router.push(item.href)}
                    className={isActive(item.href) 
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700" 
                      : "hover:bg-gray-100"
                    }
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Right Side: Status and User Menu */}
          <div className="flex items-center space-x-4">
            {/* Status Indicator */}
            <div className="hidden sm:flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                <Circle className={`h-2 w-2 ${ready ? 'text-green-500 fill-green-500' : 'text-gray-400'}`} />
                <span className="text-xs text-gray-600">
                  {ready ? 'Ready' : 'Loading...'}
                </span>
              </div>
            </div>

            {/* User Menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2 hover:bg-gray-100">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                      {user.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="hidden md:block text-left">
                      <div className="text-sm font-medium text-gray-900">
                        {user.email || 'User'}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center space-x-1">
                        {user.is_guest && <Badge variant="outline" className="text-xs">Guest</Badge>}
                        {user.is_admin && <Badge variant="default" className="text-xs bg-indigo-600">Admin</Badge>}
                      </div>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user.email}</p>
                      <div className="flex items-center space-x-2">
                        {user.is_guest && <Badge variant="outline" className="text-xs">Guest</Badge>}
                        {user.is_admin && <Badge variant="default" className="text-xs bg-indigo-600">Admin</Badge>}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/profile')}>
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  {user.is_admin && (
                    <DropdownMenuItem onClick={() => router.push('/admin/dashboard')}>
                      <Settings className="h-4 w-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/')}
                  className="hidden sm:flex"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Login
                </Button>
                <Button
                  size="sm"
                  onClick={() => router.push('/')}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                >
                  Get Started
                </Button>
              </div>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t py-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Button
                  key={item.href}
                  variant={isActive(item.href) ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    router.push(item.href)
                    setIsMobileMenuOpen(false)
                  }}
                  className={`w-full justify-start ${isActive(item.href) 
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" 
                    : ""
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Button>
              )
            })}
            
            {!user && (
              <div className="pt-2 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    router.push('/')
                    setIsMobileMenuOpen(false)
                  }}
                  className="w-full"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Login
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    router.push('/')
                    setIsMobileMenuOpen(false)
                  }}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                >
                  Get Started
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

