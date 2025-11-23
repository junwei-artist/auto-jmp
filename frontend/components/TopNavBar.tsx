'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter, usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    FolderKanban,
    GitBranch,
    Box,
    Settings,
    Bell,
    User,
    LogOut,
    Menu,
    X,
    Globe,
    Users,
    HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'

interface TopNavBarProps {
    onSignInClick?: () => void
}

export function TopNavBar({ onSignInClick }: TopNavBarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const { user, logout } = useAuth()
    const { language, setLanguage, t } = useLanguage()
    const [scrolled, setScrolled] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    // Handle scroll effect
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const navLinks = [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Workspaces', href: '/workspace', icon: FolderKanban },
        { name: 'Workflows', href: '/workflows', icon: GitBranch },
        { name: 'Modules', href: '/modules', icon: Box },
    ]

    return (
        <motion.header
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
                ? 'py-2 px-4'
                : 'py-4 px-6'
                }`}
        >
            <div
                className={`group/navbar mx-auto max-w-screen-2xl rounded-2xl ${scrolled
                    ? 'bg-white/30 dark:bg-black/30 backdrop-blur-xl border border-white/20 shadow-lg hover:bg-white/40 dark:hover:bg-black/40 hover:border-white/30 hover:shadow-xl'
                    : 'bg-transparent hover:bg-white/10 dark:hover:bg-black/20 hover:backdrop-blur-md border border-transparent'
                    }`}
                style={{
                    transition: 'background-color 300ms ease-in-out, backdrop-filter 300ms ease-in-out, box-shadow 300ms ease-in-out, border-color 150ms ease-in-out'
                }}
            >
                <div className="flex items-center justify-between h-14 px-4">
                    {/* Logo */}
                    <div
                        className="flex items-center gap-3 cursor-pointer group"
                        onClick={() => router.push('/')}
                    >
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-md group-hover:shadow-lg transition-all duration-300 group-hover:scale-105">
                            C
                        </div>
                        <span className="font-semibold text-lg text-white tracking-tight group-hover/navbar:text-white transition-colors">
                            {t('nav.platformName')}
                        </span>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-1">
                        {navLinks.map((link) => {
                            const Icon = link.icon
                            const isActive = pathname === link.href

                            return (
                                <button
                                    key={link.name}
                                    onClick={() => router.push(link.href)}
                                    className={`relative px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-all duration-200 group/link ${isActive
                                        ? 'text-blue-400 bg-blue-900/20 group-hover/navbar:text-white'
                                        : 'text-white/80 hover:text-white hover:bg-white/10 group-hover/navbar:text-white'
                                        }`}
                                >
                                    <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                                    {link.name}
                                </button>
                            )
                        })}
                    </nav>

                    {/* Right Side Actions */}
                    <div className="hidden md:flex items-center gap-2">
                        {/* Language Switcher */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
                            className="gap-2 text-white/80 hover:text-white"
                        >
                            <Globe className="w-4 h-4" />
                            <span className="text-sm font-medium">{language === 'en' ? 'EN' : '中文'}</span>
                        </Button>

                        {user ? (
                            <>
                                <div className="flex items-center gap-2 border-r border-gray-200 dark:border-gray-700 pr-3 mr-1">
                                    <button
                                        onClick={() => router.push('/notifications')}
                                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Bell className="w-5 h-5 stroke-[1.5px]" />
                                    </button>
                                    <button
                                        onClick={() => router.push('/community')}
                                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                        title="Community"
                                    >
                                        <Users className="w-5 h-5 stroke-[1.5px]" />
                                    </button>
                                    <button
                                        onClick={() => router.push('/help')}
                                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                        title="Help"
                                    >
                                        <HelpCircle className="w-5 h-5 stroke-[1.5px]" />
                                    </button>
                                    <button
                                        onClick={() => router.push('/profile')}
                                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Settings className="w-5 h-5 stroke-[1.5px]" />
                                    </button>
                                </div>

                                <div className="flex items-center gap-3 pl-2">
                                    <div className="flex flex-col items-end">
                                        <span className="text-sm font-medium text-white leading-none">
                                            {user.email?.split('@')[0]}
                                        </span>
                                        <span className="text-xs text-white/60 mt-0.5">
                                            {user.is_admin ? 'Admin' : 'User'}
                                        </span>
                                    </div>
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-gray-200 to-white border border-white/50 shadow-sm flex items-center justify-center">
                                        <User className="w-5 h-5 text-gray-600" />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    onClick={() => onSignInClick ? onSignInClick() : router.push('/#auth-section')}
                                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100/50"
                                >
                                    Sign In
                                </Button>
                                <Button
                                    onClick={() => onSignInClick ? onSignInClick() : router.push('/#auth-section')}
                                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 shadow-md hover:shadow-lg transition-all"
                                >
                                    Get Started
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2 rounded-xl bg-gray-100/50 dark:bg-white/10"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? (
                            <X className="w-6 h-6 text-gray-800 dark:text-white" />
                        ) : (
                            <Menu className="w-6 h-6 text-gray-800 dark:text-white" />
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute top-full left-4 right-4 mt-2 p-4 rounded-2xl bg-white/90 dark:bg-black/90 backdrop-blur-xl border border-white/20 shadow-2xl md:hidden"
                >
                    <div className="flex flex-col gap-2">
                        {navLinks.map((link) => {
                            const Icon = link.icon
                            return (
                                <button
                                    key={link.name}
                                    onClick={() => {
                                        router.push(link.href)
                                        setMobileMenuOpen(false)
                                    }}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
                                >
                                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium text-gray-900 dark:text-white">{link.name}</span>
                                </button>
                            )
                        })}

                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />

                        {user ? (
                            <div className="flex items-center justify-between p-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                        <User className="w-5 h-5 text-gray-600" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {user.email}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {user.is_admin ? 'Administrator' : 'Standard User'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => logout()}
                                    className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <Button
                                onClick={() => {
                                    if (onSignInClick) onSignInClick()
                                    else router.push('/#auth-section')
                                    setMobileMenuOpen(false)
                                }}
                                className="w-full bg-blue-600 text-white rounded-xl py-6"
                            >
                                Sign In / Register
                            </Button>
                        )}
                    </div>
                </motion.div>
            )}
        </motion.header>
    )
}
