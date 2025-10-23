'use client'

import React, { useEffect, useRef } from 'react'
import { motion, useAnimation, useInView } from 'framer-motion'

// Animated Wave Background
export const AnimatedWaveBackground = ({ className = "w-full h-full" }: { className?: string }) => {
  const controls = useAnimation()
  
  useEffect(() => {
    controls.start({
      pathLength: [0, 1],
      transition: { duration: 2, ease: "easeInOut" }
    })
  }, [controls])

  return (
    <div className={className}>
      <svg viewBox="0 0 1200 400" className="w-full h-full">
        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        
        <motion.path
          d="M0,200 Q300,100 600,200 T1200,200 L1200,400 L0,400 Z"
          fill="url(#waveGradient)"
          initial={{ pathLength: 0 }}
          animate={controls}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        
        <motion.path
          d="M0,250 Q300,150 600,250 T1200,250 L1200,400 L0,400 Z"
          fill="url(#waveGradient)"
          initial={{ pathLength: 0 }}
          animate={controls}
          transition={{ duration: 2.5, ease: "easeInOut", delay: 0.5 }}
        />
      </svg>
    </div>
  )
}

// Animated Data Flow SVG
export const AnimatedDataFlowSVG = ({ className = "w-64 h-64" }: { className?: string }) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const controls = useAnimation()

  useEffect(() => {
    if (isInView) {
      controls.start({
        pathLength: [0, 1],
        transition: { duration: 2, ease: "easeInOut" }
      })
    }
  }, [isInView, controls])

  return (
    <div ref={ref} className={className}>
      <svg viewBox="0 0 300 300" className="w-full h-full">
        <defs>
          <linearGradient id="dataFlowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        
        {/* Central Processing Hub */}
        <motion.circle
          cx="150"
          cy="150"
          r="40"
          fill="url(#dataFlowGradient)"
          initial={{ scale: 0 }}
          animate={isInView ? { scale: 1 } : { scale: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        
        {/* Data Nodes */}
        {[
          { x: 80, y: 80, delay: 0.2 },
          { x: 220, y: 80, delay: 0.4 },
          { x: 80, y: 220, delay: 0.6 },
          { x: 220, y: 220, delay: 0.8 }
        ].map((node, index) => (
          <motion.circle
            key={index}
            cx={node.x}
            cy={node.y}
            r="15"
            fill="#3B82F6"
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : { scale: 0 }}
            transition={{ duration: 0.5, delay: node.delay, ease: "easeOut" }}
          />
        ))}
        
        {/* Animated Connection Lines */}
        <motion.path
          d="M95 95 L130 130"
          stroke="#3B82F6"
          strokeWidth="3"
          fill="none"
          strokeDasharray="5 5"
          initial={{ pathLength: 0 }}
          animate={controls}
        />
        <motion.path
          d="M205 95 L170 130"
          stroke="#8B5CF6"
          strokeWidth="3"
          fill="none"
          strokeDasharray="5 5"
          initial={{ pathLength: 0 }}
          animate={controls}
          transition={{ delay: 0.3 }}
        />
        <motion.path
          d="M95 205 L130 170"
          stroke="#10B981"
          strokeWidth="3"
          fill="none"
          strokeDasharray="5 5"
          initial={{ pathLength: 0 }}
          animate={controls}
          transition={{ delay: 0.6 }}
        />
        <motion.path
          d="M205 205 L170 170"
          stroke="#F59E0B"
          strokeWidth="3"
          fill="none"
          strokeDasharray="5 5"
          initial={{ pathLength: 0 }}
          animate={controls}
          transition={{ delay: 0.9 }}
        />
        
        {/* Floating Data Points */}
        {[...Array(8)].map((_, i) => (
          <motion.circle
            key={i}
            cx={50 + (i * 30)}
            cy={50 + (i % 2) * 200}
            r="3"
            fill="#3B82F6"
            opacity="0.6"
            animate={{
              y: [0, -10, 0],
              opacity: [0.6, 1, 0.6]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut"
            }}
          />
        ))}
      </svg>
    </div>
  )
}

// Interactive Dashboard Preview
export const InteractiveDashboardSVG = ({ className = "w-80 h-60" }: { className?: string }) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <div ref={ref} className={className}>
      <svg viewBox="0 0 400 300" className="w-full h-full">
        {/* Dashboard Frame */}
        <motion.rect
          x="20"
          y="20"
          width="360"
          height="260"
          rx="12"
          fill="#F8FAFC"
          stroke="#E2E8F0"
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        
        {/* Sidebar */}
        <motion.rect
          x="20"
          y="20"
          width="60"
          height="260"
          fill="#3B82F6"
          opacity="0.1"
          initial={{ x: -60 }}
          animate={isInView ? { x: 0 } : { x: -60 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        
        {/* Chart Area */}
        <motion.rect
          x="100"
          y="60"
          width="260"
          height="180"
          rx="8"
          fill="white"
          stroke="#E2E8F0"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        />
        
        {/* Animated Bar Chart */}
        {[
          { x: 120, y: 200, height: 30, color: "#3B82F6", delay: 0.5 },
          { x: 150, y: 190, height: 40, color: "#10B981", delay: 0.7 },
          { x: 180, y: 180, height: 50, color: "#F59E0B", delay: 0.9 },
          { x: 210, y: 170, height: 60, color: "#EF4444", delay: 1.1 },
          { x: 240, y: 185, height: 45, color: "#8B5CF6", delay: 1.3 }
        ].map((bar, index) => (
          <motion.rect
            key={index}
            x={bar.x}
            y={bar.y}
            width="20"
            height={bar.height}
            fill={bar.color}
            rx="2"
            initial={{ height: 0 }}
            animate={isInView ? { height: bar.height } : { height: 0 }}
            transition={{ duration: 0.8, delay: bar.delay, ease: "easeOut" }}
          />
        ))}
        
        {/* Menu Items */}
        {[30, 50, 70, 90].map((y, index) => (
          <motion.rect
            key={index}
            x="30"
            y={y}
            width="8"
            height="8"
            rx="2"
            fill="#3B82F6"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
          />
        ))}
        
        {/* Status Indicators */}
        <motion.circle
          cx="320"
          cy="40"
          r="6"
          fill="#10B981"
          initial={{ scale: 0 }}
          animate={isInView ? { scale: 1 } : { scale: 0 }}
          transition={{ duration: 0.5, delay: 1.5, ease: "easeOut" }}
        />
        <motion.circle
          cx="350"
          cy="40"
          r="6"
          fill="#F59E0B"
          initial={{ scale: 0 }}
          animate={isInView ? { scale: 1 } : { scale: 0 }}
          transition={{ duration: 0.5, delay: 1.7, ease: "easeOut" }}
        />
      </svg>
    </div>
  )
}

// Floating Elements Animation
export const FloatingElementsSVG = ({ className = "w-full h-full" }: { className?: string }) => {
  return (
    <div className={className}>
      <svg viewBox="0 0 1200 800" className="w-full h-full">
        {/* Floating geometric shapes */}
        {[...Array(12)].map((_, i) => (
          <motion.g
            key={i}
            animate={{
              y: [0, -20, 0],
              rotate: [0, 180, 360],
              opacity: [0.3, 0.8, 0.3]
            }}
            transition={{
              duration: 4 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut"
            }}
          >
            <circle
              cx={100 + (i * 100)}
              cy={100 + (i % 3) * 200}
              r="8"
              fill="#3B82F6"
              opacity="0.4"
            />
          </motion.g>
        ))}
        
        {/* Floating squares */}
        {[...Array(8)].map((_, i) => (
          <motion.g
            key={i}
            animate={{
              x: [0, 30, 0],
              y: [0, -15, 0],
              rotate: [0, 90, 0]
            }}
            transition={{
              duration: 3 + i * 0.3,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeInOut"
            }}
          >
            <rect
              x={200 + (i * 120)}
              y={150 + (i % 2) * 300}
              width="12"
              height="12"
              fill="#8B5CF6"
              opacity="0.3"
              rx="2"
            />
          </motion.g>
        ))}
      </svg>
    </div>
  )
}

// Click-to-Use Interactive Demo
export const ClickToUseDemoSVG = ({ className = "w-96 h-64", instructionText = "Click to upload and process" }: { className?: string; instructionText?: string }) => {
  const [isClicked, setIsClicked] = React.useState(false)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <div ref={ref} className={className}>
      <svg viewBox="0 0 500 400" className="w-full h-full">
        {/* Upload Area */}
        <motion.rect
          x="50"
          y="50"
          width="200"
          height="120"
          rx="12"
          fill={isClicked ? "#10B981" : "#F3F4F6"}
          stroke={isClicked ? "#10B981" : "#D1D5DB"}
          strokeWidth="2"
          strokeDasharray={isClicked ? "0" : "8 8"}
          animate={{
            scale: isClicked ? 1.05 : 1,
            boxShadow: isClicked ? "0 0 20px rgba(16, 185, 129, 0.3)" : "0 0 0px rgba(16, 185, 129, 0)"
          }}
          transition={{ duration: 0.3 }}
          onClick={() => setIsClicked(!isClicked)}
          className="cursor-pointer"
        />
        
        {/* Upload Icon */}
        <motion.path
          d="M150 90L150 130M150 90L130 110M150 90L170 110"
          stroke={isClicked ? "white" : "#6B7280"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{
            y: isClicked ? -5 : 0
          }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Processing Animation */}
        <motion.rect
          x="300"
          y="50"
          width="150"
          height="120"
          rx="12"
          fill="#F8FAFC"
          stroke="#E2E8F0"
          strokeWidth="2"
          initial={{ opacity: 0 }}
          animate={isClicked ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
        
        {/* Processing Indicator */}
        <motion.circle
          cx="375"
          cy="110"
          r="20"
          fill="#3B82F6"
          initial={{ scale: 0 }}
          animate={isClicked ? { scale: 1 } : { scale: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        />
        
        <motion.path
          d="M365 110L375 120L385 100"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={isClicked ? { pathLength: 1 } : { pathLength: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        />
        
        {/* Results Area */}
        <motion.rect
          x="50"
          y="220"
          width="400"
          height="120"
          rx="12"
          fill="#F0FDF4"
          stroke="#10B981"
          strokeWidth="2"
          initial={{ opacity: 0, y: 20 }}
          animate={isClicked ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        />
        
        {/* Chart Preview */}
        <motion.rect
          x="70"
          y="240"
          width="60"
          height="40"
          fill="#10B981"
          rx="4"
          initial={{ scaleX: 0 }}
          animate={isClicked ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.8, delay: 1.5 }}
        />
        <motion.rect
          x="150"
          y="250"
          width="60"
          height="30"
          fill="#3B82F6"
          rx="4"
          initial={{ scaleX: 0 }}
          animate={isClicked ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.8, delay: 1.7 }}
        />
        <motion.rect
          x="230"
          y="235"
          width="60"
          height="45"
          fill="#8B5CF6"
          rx="4"
          initial={{ scaleX: 0 }}
          animate={isClicked ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.8, delay: 1.9 }}
        />
        
        {/* Arrow Flow */}
        <motion.path
          d="M250 110L250 200"
          stroke="#3B82F6"
          strokeWidth="3"
          fill="none"
          strokeDasharray="5 5"
          initial={{ pathLength: 0 }}
          animate={isClicked ? { pathLength: 1 } : { pathLength: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        />
        
        <motion.path
          d="M250 200L250 220"
          stroke="#10B981"
          strokeWidth="3"
          fill="none"
          strokeDasharray="5 5"
          initial={{ pathLength: 0 }}
          animate={isClicked ? { pathLength: 1 } : { pathLength: 0 }}
          transition={{ duration: 1, delay: 1.2 }}
        />
        
        {/* Click Instruction */}
        <motion.text
          x="150"
          y="40"
          textAnchor="middle"
          className="text-sm font-medium fill-gray-600"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {instructionText}
        </motion.text>
      </svg>
    </div>
  )
}
