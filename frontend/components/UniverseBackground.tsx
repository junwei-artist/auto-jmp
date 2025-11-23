'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useSpring, useMotionValue, useTransform, MotionValue } from 'framer-motion'

interface Star {
    id: number
    x: number
    y: number
    size: number
    opacity: number
    duration: number
}

const StarItem = ({ star, springX, springY }: { star: Star, springX: MotionValue<number>, springY: MotionValue<number> }) => {
    const x = useTransform(springX, (val) => val * (star.size * 0.5))
    const y = useTransform(springY, (val) => val * (star.size * 0.5))

    return (
        <motion.circle
            cx={`${star.x}%`}
            cy={`${star.y}%`}
            r={star.size}
            fill="white"
            initial={{ opacity: star.opacity }}
            animate={{
                opacity: [star.opacity, star.opacity * 0.3, star.opacity],
                scale: [1, 1.2, 1],
            }}
            transition={{
                duration: star.duration,
                repeat: Infinity,
                ease: "easeInOut"
            }}
            style={{ x, y }}
        />
    )
}

export const UniverseBackground = () => {
    const [stars, setStars] = useState<Star[]>([])
    const containerRef = useRef<HTMLDivElement>(null)

    // Mouse position for parallax effect
    const mouseX = useMotionValue(0)
    const mouseY = useMotionValue(0)

    // Smooth spring animation for mouse movement
    const springConfig = { damping: 25, stiffness: 150 }
    const springX = useSpring(mouseX, springConfig)
    const springY = useSpring(mouseY, springConfig)

    useEffect(() => {
        // Generate random stars
        const generateStars = () => {
            const newStars: Star[] = []
            const count = 15 // Significantly reduced number of stars

            for (let i = 0; i < count; i++) {
                newStars.push({
                    id: i,
                    x: Math.random() * 100, // percentage
                    y: Math.random() * 100, // percentage
                    size: Math.random() * 2 + 1, // size between 1 and 3px
                    opacity: Math.random() * 0.7 + 0.3, // opacity between 0.3 and 1
                    duration: Math.random() * 3 + 2 // animation duration between 2 and 5s
                })
            }
            setStars(newStars)
        }

        generateStars()

        const handleMouseMove = (e: MouseEvent) => {
            // Calculate mouse position relative to window center (-1 to 1)
            const { innerWidth, innerHeight } = window
            const x = (e.clientX - innerWidth / 2) / (innerWidth / 2)
            const y = (e.clientY - innerHeight / 2) / (innerHeight / 2)

            mouseX.set(x * 20) // Max shift of 20px
            mouseY.set(y * 20)
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [mouseX, mouseY])

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-0 overflow-hidden bg-slate-950"
            style={{
                background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)'
            }}
        >
            {/* Aurora Effect */}
            <motion.div
                className="absolute -top-[20%] -left-[10%] w-[70%] h-[60%] bg-emerald-500/30 rounded-full blur-[120px] mix-blend-screen"
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.6, 0.8, 0.6],
                    rotate: [0, 10, 0]
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />
            <motion.div
                className="absolute top-[10%] left-[20%] w-[60%] h-[50%] bg-teal-500/30 rounded-full blur-[100px] mix-blend-screen"
                animate={{
                    x: [-50, 50, -50],
                    y: [-20, 20, -20],
                    opacity: [0.5, 0.7, 0.5]
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 2
                }}
            />
            <motion.div
                className="absolute -top-[10%] left-[40%] w-[50%] h-[60%] bg-purple-500/30 rounded-full blur-[130px] mix-blend-screen"
                animate={{
                    scale: [1.2, 1, 1.2],
                    opacity: [0.5, 0.8, 0.5],
                    rotate: [0, -15, 0]
                }}
                transition={{
                    duration: 18,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 5
                }}
            />

            {/* Central Halo/Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/25 rounded-full blur-[120px]" />

            <svg className="absolute inset-0 w-full h-full">
                {stars.map((star) => (
                    <StarItem key={star.id} star={star} springX={springX} springY={springY} />
                ))}
            </svg>

            {/* Nebula/Glow effects for extra depth */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/30 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/30 rounded-full blur-[100px] animate-pulse delay-1000" />
            <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-cyan-500/30 rounded-full blur-[80px] animate-pulse delay-500" />

            {/* Corner Aurora Effects */}
            <motion.div
                className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-400/60 rounded-full blur-[150px] mix-blend-screen"
                animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.7, 1, 0.7],
                }}
                transition={{
                    duration: 12,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />
            <motion.div
                className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-400/60 rounded-full blur-[150px] mix-blend-screen"
                animate={{
                    scale: [1.2, 1, 1.2],
                    opacity: [0.7, 1, 0.7],
                }}
                transition={{
                    duration: 14,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                }}
            />
            <motion.div
                className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-green-400/60 rounded-full blur-[150px] mix-blend-screen"
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.7, 1, 0.7],
                }}
                transition={{
                    duration: 16,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 2
                }}
            />
            <motion.div
                className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-400/60 rounded-full blur-[150px] mix-blend-screen"
                animate={{
                    scale: [1.3, 1, 1.3],
                    opacity: [0.7, 1, 0.7],
                }}
                transition={{
                    duration: 13,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 3
                }}
            />
        </div>
    )
}
