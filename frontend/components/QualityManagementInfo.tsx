'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    TrendingDown,
    Activity,
    Search,
    RefreshCw,
    ShieldCheck,
    BarChart3,
    Users,
    Clock
} from 'lucide-react'
import { useLanguage } from '@/lib/language'

export function QualityManagementInfo() {
    const [isHovered, setIsHovered] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const { t } = useLanguage()
    const [scrollPosition, setScrollPosition] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isSafari, setIsSafari] = useState(false)
    const [containerWidth, setContainerWidth] = useState(0)

    useEffect(() => {
        // Check if browser is Safari
        const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
        setIsSafari(isSafariBrowser)

        // Update container width
        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.clientWidth)
            }
        }

        updateWidth()
        window.addEventListener('resize', updateWidth)
        return () => window.removeEventListener('resize', updateWidth)
    }, [])

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current || !isHovered) return

        const container = containerRef.current
        const rect = container.getBoundingClientRect()
        const x = e.clientX - rect.left // Mouse X relative to container
        const width = rect.width

        // Calculate normalized X position (0 to 1)
        const normalizedX = Math.max(0, Math.min(1, x / width))

        // Define edge threshold (e.g., 20% on each side)
        const edgeThreshold = 0.2

        let scrollPercentage = 0.5 // Default to center

        if (normalizedX < edgeThreshold) {
            // Left edge: map 0..0.2 to 0..0.5
            scrollPercentage = 0.5 * (normalizedX / edgeThreshold)
        } else if (normalizedX > (1 - edgeThreshold)) {
            // Right edge: map 0.8..1 to 0.5..1
            // (normalizedX - 0.8) / 0.2 goes from 0 to 1
            scrollPercentage = 0.5 + 0.5 * ((normalizedX - (1 - edgeThreshold)) / edgeThreshold)
        } else {
            // Center "dead zone": keep centered
            scrollPercentage = 0.5
        }

        // Total scrollable width
        const totalWidth = (features.length * 300) + 300 // Cards width + extra padding
        const maxScroll = totalWidth - width

        // Calculate target scroll position
        const targetScroll = maxScroll * scrollPercentage

        setScrollPosition(targetScroll)
    }

    const features = [
        {
            titleKey: 'home.quality.defectReduction.title',
            descKey: 'home.quality.defectReduction.description',
            icon: TrendingDown,
            color: "text-red-400",
            bg: "bg-red-400/10"
        },
        {
            titleKey: 'home.quality.processControl.title',
            descKey: 'home.quality.processControl.description',
            icon: Activity,
            color: "text-blue-400",
            bg: "bg-blue-400/10"
        },
        {
            titleKey: 'home.quality.rootCause.title',
            descKey: 'home.quality.rootCause.description',
            icon: Search,
            color: "text-amber-400",
            bg: "bg-amber-400/10"
        },
        {
            titleKey: 'home.quality.continuousImprovement.title',
            descKey: 'home.quality.continuousImprovement.description',
            icon: RefreshCw,
            color: "text-green-400",
            bg: "bg-green-400/10"
        },
        {
            titleKey: 'home.quality.compliance.title',
            descKey: 'home.quality.compliance.description',
            icon: ShieldCheck,
            color: "text-purple-400",
            bg: "bg-purple-400/10"
        },
        {
            titleKey: 'home.quality.predictive.title',
            descKey: 'home.quality.predictive.description',
            icon: Clock,
            color: "text-cyan-400",
            bg: "bg-cyan-400/10"
        },
        {
            titleKey: 'home.quality.supplyChain.title',
            descKey: 'home.quality.supplyChain.description',
            icon: BarChart3,
            color: "text-indigo-400",
            bg: "bg-indigo-400/10"
        },
        {
            titleKey: 'home.quality.customerSat.title',
            descKey: 'home.quality.customerSat.description',
            icon: Users,
            color: "text-pink-400",
            bg: "bg-pink-400/10"
        }
    ]

    return (
        <section className="relative z-10 w-full pb-16">
            {/* Stacked Cards Container */}
            <div
                className="container mx-auto px-4 flex justify-center relative group/container min-h-[320px] items-center"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => { setIsHovered(false); setScrollPosition(0); }}
                onMouseMove={handleMouseMove}
            >
                <div
                    ref={containerRef}
                    className="relative h-[280px] w-full max-w-[95vw] flex items-center justify-center cursor-pointer overflow-hidden"
                >
                    <motion.div
                        className="relative w-full h-full flex items-center justify-center"
                        animate={{ x: isHovered ? -scrollPosition + ((features.length * 300) / 2) - 300 : 0 }} // Center the scroll initially
                        transition={{ type: "tween", ease: "linear", duration: 0.2 }} // Smooth tracking
                    >
                        {features.map((feature, index) => {
                            const Icon = feature.icon
                            const totalCards = features.length
                            const middleIndex = (totalCards - 1) / 2

                            // Calculate spread position
                            let spreadOffset, rotation, scale, opacity

                            if (selectedIndex !== null) {
                                // When a card is selected
                                if (index === selectedIndex) {
                                    spreadOffset = 0
                                    rotation = 0
                                    scale = 1.1
                                    opacity = 1
                                } else {
                                    // Distribute others around the selected one, but keep them close
                                    const relativeIndex = index - selectedIndex
                                    spreadOffset = relativeIndex * 40 // Tighter spread when one is selected
                                    rotation = relativeIndex * 5
                                    scale = 0.85
                                    opacity = 0.6
                                }
                            } else if (isHovered) {
                                // Hover state - Fully spread out with NO overlapping
                                // Card width is 280px, so we need at least 290px spacing
                                // Align from left side
                                spreadOffset = (index - middleIndex) * 300
                                rotation = 0 // No rotation when fully spread for readability
                                scale = 1
                                opacity = 1
                            } else {
                                // Default state - Partially overlapping (like previous spread)
                                // Calculate dynamic step based on container width
                                // We need: (totalCards - 1) * step + cardWidth <= containerWidth
                                // step <= (containerWidth - cardWidth) / (totalCards - 1)
                                const cardWidth = 280
                                const padding = 40
                                const maxStep = 120
                                const availableWidth = Math.max(320, containerWidth - padding) // Ensure non-negative
                                const calculatedStep = Math.min(maxStep, (availableWidth - cardWidth) / (totalCards - 1))

                                spreadOffset = (index - middleIndex) * calculatedStep
                                rotation = (index - middleIndex) * 3 // Slight rotation
                                scale = 1
                                opacity = 1
                            }

                            const stackOffset = 0
                            const zIndex = selectedIndex === index ? 100 : (isHovered ? index : totalCards - index)

                            return (
                                <motion.div
                                    key={index}
                                    className={`absolute backdrop-blur-md p-6 rounded-2xl border border-white/20 hover:bg-white/20 transition-colors duration-300 group w-[280px] h-[200px] shadow-xl ${isSafari ? 'bg-gray-900' : 'bg-white/10'}`}
                                    style={{ zIndex }}
                                    animate={{
                                        x: spreadOffset,
                                        y: stackOffset,
                                        rotate: rotation,
                                        scale: scale,
                                        opacity: opacity,
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 30
                                    }}
                                    onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
                                >
                                    <div className={`w-12 h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                        <Icon className={`w-6 h-6 ${feature.color}`} />
                                    </div>
                                    <h3 className="text-xl font-semibold text-white mb-2">{t(feature.titleKey)}</h3>
                                    <p className="text-sm text-white/60 leading-relaxed">
                                        {t(feature.descKey)}
                                    </p>
                                </motion.div>
                            )
                        })}
                    </motion.div>
                </div>
            </div>

        </section>
    )
}
