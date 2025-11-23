'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/language'
import { DashboardIconSVG, WorkspacesIconSVG, WorkflowsIconSVG, ModulesIconSVG } from '@/components/svg/PortalIcons'

interface HeroSectionProps {
    onGetStartedClick?: () => void
}

export function HeroSection({ onGetStartedClick }: HeroSectionProps) {
    const { t } = useLanguage()
    // Generate random stars
    const [stars, setStars] = useState<{ id: number; x: number; y: number; size: number; delay: number; duration: number }[]>([])

    useEffect(() => {
        const newStars = Array.from({ length: 20 }).map((_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 2 + 1,
            delay: Math.random() * 5,
            duration: Math.random() * 3 + 2
        }))
        setStars(newStars)
    }, [])

    // Animation variants
    const starAnimation = (duration: number, delay: number) => ({
        animate: {
            opacity: [0.2, 1, 0.2],
            scale: [1, 1.5, 1],
            transition: {
                duration: duration,
                repeat: Infinity,
                delay: delay,
                ease: "easeInOut"
            }
        }
    })

    const floatAnimation = {
        animate: {
            y: [-10, 10, -10],
            transition: {
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
            }
        }
    }

    return (
        <section className="relative w-full min-h-[60vh] flex items-center justify-center overflow-hidden py-20">
            {/* Background Ambience - Reduced opacity for subtle glow */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">


                {/* Subtle Gradient Orbs */}
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
                    transition={{ duration: 10, repeat: Infinity }}
                    className="absolute top-[-10%] left-[20%] w-[30rem] h-[30rem] rounded-full bg-blue-400/5 blur-[100px]"
                />
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                    transition={{ duration: 12, repeat: Infinity, delay: 2 }}
                    className="absolute bottom-[-10%] right-[20%] w-[25rem] h-[25rem] rounded-full bg-purple-400/5 blur-[100px]"
                />

                {/* Particle System / Stars */}
                {stars.map((star) => (
                    <motion.div
                        key={star.id}
                        className="absolute rounded-full bg-yellow-200 dark:bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                        style={{
                            left: `${star.x}%`,
                            top: `${star.y}%`,
                            width: star.size,
                            height: star.size,
                        }}
                        variants={starAnimation(star.duration, star.delay)}
                        animate="animate"
                    />
                ))}

                {/* Floating "Glory" Objects (Sparkles/Stars) */}
                <motion.div
                    variants={floatAnimation}
                    animate="animate"
                    className="absolute top-[20%] left-[15%] text-yellow-400/60 dark:text-yellow-200/40"
                >
                    <Sparkles className="w-8 h-8 blur-[1px]" />
                </motion.div>

                <motion.div
                    variants={floatAnimation}
                    animate="animate"
                    transition={{ delay: 1 }}
                    className="absolute bottom-[25%] right-[15%] text-blue-400/60 dark:text-blue-200/40"
                >
                    <Star className="w-6 h-6 blur-[0.5px] fill-current" />
                </motion.div>

                <motion.div
                    variants={floatAnimation}
                    animate="animate"
                    transition={{ delay: 2 }}
                    className="absolute top-[15%] right-[25%] text-purple-400/50 dark:text-purple-200/30"
                >
                    <div className="w-4 h-4 rounded-full bg-current blur-[2px]" />
                </motion.div>
            </div>

            {/* Hero Content */}
            <div className="relative z-10 container mx-auto px-4 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/2 backdrop-blur-sm border border-white/5 mb-8 shadow-sm hover:bg-white/5 transition-colors cursor-default">
                        <Sparkles className="w-4 h-4 text-yellow-300" />
                        <span className="text-sm font-medium text-white/90">{t('home.hero.badge')}</span>
                    </div>

                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white mb-8 drop-shadow-lg pb-2">
                        {t('home.hero.title')}
                    </h1>

                    <p className="text-xl md:text-2xl text-white/80 max-w-3xl mx-auto mb-12 leading-relaxed font-light drop-shadow-md">
                        {t('home.hero.subtitle')}
                    </p>


                    <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                        <Button
                            size="lg"
                            onClick={onGetStartedClick}
                            className="h-14 px-10 rounded-full bg-white text-black hover:bg-white/90 text-lg shadow-xl shadow-white/10 transition-all hover:scale-105 hover:shadow-2xl"
                        >
                            {t('home.hero.getStarted')} <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                    </div>

                    {/* Decorative Halo between buttons */}
                    <motion.div
                        initial={{ opacity: 0, scaleX: 0.5 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: 0.4, duration: 1.5, ease: "easeOut" }}
                        className="absolute left-1/2 -translate-x-1/2 bottom-24 w-full max-w-3xl flex justify-center pointer-events-none z-0"
                    >
                        <svg width="800" height="200" viewBox="0 0 800 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto opacity-60">
                            <g filter="url(#filter0_f_halo)">
                                <ellipse cx="400" cy="100" rx="300" ry="40" fill="url(#paint0_radial_halo)" fillOpacity="0.4" />
                            </g>
                            <path d="M100 100 Q 400 160 700 100" stroke="url(#paint1_linear_halo)" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.3" />
                            <defs>
                                <filter id="filter0_f_halo" x="0" y="0" width="800" height="200" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                                    <feGaussianBlur stdDeviation="30" result="effect1_foregroundBlur" />
                                </filter>
                                <radialGradient id="paint0_radial_halo" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(400 100) rotate(90) scale(40 300)">
                                    <stop stopColor="#3B82F6" />
                                    <stop offset="0.5" stopColor="#8B5CF6" />
                                    <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
                                </radialGradient>
                                <linearGradient id="paint1_linear_halo" x1="100" y1="100" x2="700" y2="100" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#3B82F6" stopOpacity="0" />
                                    <stop offset="0.5" stopColor="#60A5FA" />
                                    <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </motion.div>


                </motion.div>
            </div>

            {/* Quick Access App Buttons - Positioned at bottom */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="absolute bottom-8 left-0 right-0 z-20 flex justify-center px-4"
            >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full max-w-4xl">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto h-10 px-4 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 backdrop-blur-sm transition-all hover:scale-105 text-sm"
                        onClick={() => window.location.href = '/dashboard'}
                    >
                        <DashboardIconSVG className="w-4 h-4 mr-2" />
                        {t('home.app.dashboard.title')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto h-10 px-4 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 backdrop-blur-sm transition-all hover:scale-105 text-sm"
                        onClick={() => window.location.href = '/workspace'}
                    >
                        <WorkspacesIconSVG className="w-4 h-4 mr-2" />
                        {t('home.app.workspaces.title')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto h-10 px-4 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 backdrop-blur-sm transition-all hover:scale-105 text-sm"
                        onClick={() => window.location.href = '/workflows'}
                    >
                        <WorkflowsIconSVG className="w-4 h-4 mr-2" />
                        {t('home.app.workflows.title')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto h-10 px-4 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 backdrop-blur-sm transition-all hover:scale-105 text-sm"
                        onClick={() => window.location.href = '/modules'}
                    >
                        <ModulesIconSVG className="w-4 h-4 mr-2" />
                        {t('home.app.modules.title')}
                    </Button>
                </div>
            </motion.div>
        </section>
    )
}
