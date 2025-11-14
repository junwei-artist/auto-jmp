'use client'

import React from 'react'
import { motion } from 'framer-motion'

// Hero Slide 1 - Dashboard Focus
export const DashboardHeroSlide = ({ className = "w-full h-full" }: { className?: string }) => (
  <div className={className}>
    <svg viewBox="0 0 1920 800" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        {/* Gradient background */}
        <linearGradient id="dashboardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#EC4899" stopOpacity="0.9" />
        </linearGradient>
        
        {/* Motion streaks */}
        <linearGradient id="streak1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Background gradient */}
      <rect width="1920" height="800" fill="url(#dashboardGradient)" />
      
      {/* Motion streaks */}
      <motion.path
        d="M0 400 Q480 200 960 400 T1920 400"
        stroke="url(#streak1)"
        strokeWidth="5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1, 
          opacity: [0, 0.7, 0],
          x: [0, 250, 0]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut",
          delay: 0.5
        }}
      />
      
      {/* Central Dashboard Visualization */}
      <g transform="translate(960, 300)">
        {/* Chart container */}
        <motion.rect
          x="-120"
          y="-80"
          width="240"
          height="160"
          rx="12"
          fill="rgba(255, 255, 255, 0.1)"
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        
        {/* Animated bar chart */}
        <motion.rect
          x="-100"
          y="20"
          width="30"
          height="40"
          fill="rgba(255, 255, 255, 0.7)"
          rx="4"
          initial={{ height: 0 }}
          animate={{ height: 40 }}
          transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
        />
        <motion.rect
          x="-50"
          y="0"
          width="30"
          height="60"
          fill="rgba(255, 255, 255, 0.7)"
          rx="4"
          initial={{ height: 0 }}
          animate={{ height: 60 }}
          transition={{ duration: 1, delay: 1, ease: "easeOut" }}
        />
        <motion.rect
          x="0"
          y="-10"
          width="30"
          height="70"
          fill="rgba(255, 255, 255, 0.7)"
          rx="4"
          initial={{ height: 0 }}
          animate={{ height: 70 }}
          transition={{ duration: 1, delay: 1.2, ease: "easeOut" }}
        />
        <motion.rect
          x="50"
          y="10"
          width="30"
          height="50"
          fill="rgba(255, 255, 255, 0.7)"
          rx="4"
          initial={{ height: 0 }}
          animate={{ height: 50 }}
          transition={{ duration: 1, delay: 1.4, ease: "easeOut" }}
        />
        <motion.rect
          x="100"
          y="-5"
          width="30"
          height="65"
          fill="rgba(255, 255, 255, 0.7)"
          rx="4"
          initial={{ height: 0 }}
          animate={{ height: 65 }}
          transition={{ duration: 1, delay: 1.6, ease: "easeOut" }}
        />
        
        {/* Data points with connecting line */}
        <motion.circle
          cx="-80"
          cy="-40"
          r="4"
          fill="rgba(255, 255, 255, 0.8)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1.8 }}
        />
        <motion.circle
          cx="-20"
          cy="-50"
          r="4"
          fill="rgba(255, 255, 255, 0.8)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 2 }}
        />
        <motion.circle
          cx="40"
          cy="-60"
          r="4"
          fill="rgba(255, 255, 255, 0.8)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 2.2 }}
        />
        <motion.circle
          cx="100"
          cy="-45"
          r="4"
          fill="rgba(255, 255, 255, 0.8)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 2.4 }}
        />
        
        <motion.path
          d="M-80 -40 L-20 -50 L40 -60 L100 -45"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="2"
          fill="none"
          strokeDasharray="5 5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, delay: 2.6 }}
        />
      </g>
      
      {/* Floating particles */}
      {[...Array(25)].map((_, i) => (
        <motion.circle
          key={i}
          cx={80 + (i * 75)}
          cy={80 + (i % 4) * 160}
          r="3"
          fill="rgba(255, 255, 255, 0.6)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            y: [0, -40, 0]
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
        />
      ))}
    </svg>
  </div>
)

// Hero Slide 2 - Workspaces Focus
export const WorkspacesHeroSlide = ({ className = "w-full h-full" }: { className?: string }) => (
  <div className={className}>
    <svg viewBox="0 0 1920 800" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="workspacesGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="streak2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      <rect width="1920" height="800" fill="url(#workspacesGradient)" />
      
      {/* Motion streaks */}
      <motion.path
        d="M0 400 Q480 200 960 400 T1920 400"
        stroke="url(#streak2)"
        strokeWidth="5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1, 
          opacity: [0, 0.7, 0],
          x: [0, 250, 0]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut",
          delay: 0.5
        }}
      />
      
      {/* Central Workspaces Organization */}
      <g transform="translate(960, 300)">
        {/* Folder stack */}
        <motion.g
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          {/* Folder 1 - Back */}
          <rect x="-100" y="-40" width="80" height="60" rx="6" fill="rgba(255, 255, 255, 0.15)" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="2" />
          <rect x="-100" y="-40" width="80" height="12" rx="6" fill="rgba(255, 255, 255, 0.3)" />
          
          {/* Folder 2 - Middle */}
          <rect x="-70" y="-20" width="80" height="60" rx="6" fill="rgba(255, 255, 255, 0.2)" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="2" />
          <rect x="-70" y="-20" width="80" height="12" rx="6" fill="rgba(255, 255, 255, 0.4)" />
          <rect x="-60" y="0" width="20" height="2" fill="rgba(255, 255, 255, 0.6)" />
          <rect x="-60" y="5" width="15" height="2" fill="rgba(255, 255, 255, 0.4)" />
          
          {/* Folder 3 - Front */}
          <rect x="-40" y="0" width="80" height="60" rx="6" fill="rgba(255, 255, 255, 0.25)" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2" />
          <rect x="-40" y="0" width="80" height="12" rx="6" fill="rgba(255, 255, 255, 0.5)" />
          <rect x="-30" y="20" width="25" height="2" fill="rgba(255, 255, 255, 0.7)" />
          <rect x="-30" y="25" width="20" height="2" fill="rgba(255, 255, 255, 0.5)" />
          <rect x="-30" y="30" width="18" height="2" fill="rgba(255, 255, 255, 0.4)" />
        </motion.g>
        
        {/* Tags/Labels floating around */}
        {[
          { x: -120, y: -60, color: 'rgba(16, 185, 129, 0.6)' },
          { x: 60, y: -50, color: 'rgba(59, 130, 246, 0.6)' },
          { x: -110, y: 40, color: 'rgba(139, 92, 246, 0.6)' },
          { x: 70, y: 50, color: 'rgba(245, 158, 11, 0.6)' }
        ].map((tag, i) => (
          <motion.circle
            key={i}
            cx={tag.x}
            cy={tag.y}
            r="6"
            fill={tag.color}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0.7, 1],
              scale: [0, 1.2, 1, 1.2],
              y: [0, -5, 0, -5]
            }}
            transition={{
              duration: 2 + i * 0.3,
              repeat: Infinity,
              delay: 1 + i * 0.2,
              ease: "easeInOut"
            }}
          />
        ))}
      </g>
      
      {/* Floating particles */}
      {[...Array(25)].map((_, i) => (
        <motion.circle
          key={i}
          cx={80 + (i * 75)}
          cy={80 + (i % 4) * 160}
          r="3"
          fill="rgba(255, 255, 255, 0.6)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            y: [0, -40, 0]
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
        />
      ))}
    </svg>
  </div>
)

// Hero Slide 3 - Workflows Focus
export const WorkflowsHeroSlide = ({ className = "w-full h-full" }: { className?: string }) => (
  <div className={className}>
    <svg viewBox="0 0 1920 800" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="workflowsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#EC4899" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="streak3" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      <rect width="1920" height="800" fill="url(#workflowsGradient)" />
      
      {/* Motion streaks */}
      <motion.path
        d="M0 400 Q480 200 960 400 T1920 400"
        stroke="url(#streak3)"
        strokeWidth="5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1, 
          opacity: [0, 0.7, 0],
          x: [0, 250, 0]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut",
          delay: 0.5
        }}
      />
      
      {/* Central Workflow Node Network */}
      <g transform="translate(960, 300)">
        {/* Central hub node */}
        <motion.circle
          cx="0"
          cy="0"
          r="30"
          fill="rgba(255, 255, 255, 0.3)"
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth="3"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        <motion.circle
          cx="0"
          cy="0"
          r="15"
          fill="rgba(255, 255, 255, 0.5)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        />
        
        {/* Connected nodes */}
        {[
          { x: -100, y: -80, delay: 0.7 },
          { x: 100, y: -80, delay: 0.9 },
          { x: -100, y: 80, delay: 1.1 },
          { x: 100, y: 80, delay: 1.3 }
        ].map((node, i) => (
          <motion.g key={i}>
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="20"
              fill="rgba(255, 255, 255, 0.2)"
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth="2"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: node.delay }}
            />
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="8"
              fill="rgba(255, 255, 255, 0.6)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: node.delay + 0.2 }}
            />
            
            {/* Connection lines with animation */}
            <motion.path
              d={`M${node.x > 0 ? node.x - 20 : node.x + 20} ${node.y > 0 ? node.y - 20 : node.y + 20} L${node.x > 0 ? 20 : -20} ${node.y > 0 ? 20 : -20}`}
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, delay: node.delay + 0.4 }}
            />
          </motion.g>
        ))}
        
        {/* Data flow indicators */}
        {[...Array(8)].map((_, i) => {
          const angle = (i * Math.PI * 2) / 8
          const radius = 60
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          return (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill="rgba(255, 255, 255, 0.7)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
                x: [x, x * 0.3, x],
                y: [y, y * 0.3, y]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.25,
                ease: "easeInOut"
              }}
            />
          )
        })}
      </g>
      
      {/* Floating particles */}
      {[...Array(25)].map((_, i) => (
        <motion.circle
          key={i}
          cx={80 + (i * 75)}
          cy={80 + (i % 4) * 160}
          r="3"
          fill="rgba(255, 255, 255, 0.6)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            y: [0, -40, 0]
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
        />
      ))}
    </svg>
  </div>
)

// Hero Slide 4 - Modules Focus
export const ModulesHeroSlide = ({ className = "w-full h-full" }: { className?: string }) => (
  <div className={className}>
    <svg viewBox="0 0 1920 800" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="modulesGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#EC4899" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="streak4" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      <rect width="1920" height="800" fill="url(#modulesGradient)" />
      
      {/* Motion streaks */}
      <motion.path
        d="M0 400 Q480 200 960 400 T1920 400"
        stroke="url(#streak4)"
        strokeWidth="5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1, 
          opacity: [0, 0.7, 0],
          x: [0, 250, 0]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut",
          delay: 0.5
        }}
      />
      
      {/* Central Modules Grid */}
      <g transform="translate(960, 300)">
        {/* Module boxes in grid */}
        {[
          { x: -90, y: -90, delay: 0.3 },
          { x: 0, y: -90, delay: 0.4 },
          { x: 90, y: -90, delay: 0.5 },
          { x: -90, y: 0, delay: 0.6 },
          { x: 0, y: 0, delay: 0.7 },
          { x: 90, y: 0, delay: 0.8 },
          { x: -90, y: 90, delay: 0.9 },
          { x: 0, y: 90, delay: 1.0 },
          { x: 90, y: 90, delay: 1.1 }
        ].map((module, i) => (
          <motion.g key={i}>
            <motion.rect
              x={module.x - 35}
              y={module.y - 35}
              width="70"
              height="70"
              rx="8"
              fill="rgba(255, 255, 255, 0.15)"
              stroke="rgba(255, 255, 255, 0.4)"
              strokeWidth="2"
              initial={{ opacity: 0, scale: 0, rotate: -180 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                rotate: 0,
                y: [module.y, module.y - 5, module.y]
              }}
              transition={{ 
                duration: 0.6, 
                delay: module.delay,
                ease: "easeOut"
              }}
            />
            <motion.rect
              x={module.x - 35}
              y={module.y - 35}
              width="70"
              height="12"
              rx="8"
              fill="rgba(255, 255, 255, 0.3)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: module.delay + 0.2 }}
            />
            <motion.circle
              cx={module.x}
              cy={module.y}
              r="6"
              fill="rgba(255, 255, 255, 0.5)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ 
                opacity: 1, 
                scale: [0, 1.2, 1],
                rotate: [0, 360]
              }}
              transition={{ 
                duration: 0.8, 
                delay: module.delay + 0.4,
                ease: "easeOut"
              }}
            />
          </motion.g>
        ))}
        
        {/* Connection lines between modules */}
        <motion.path
          d="M-55 -90 L55 -90 M-55 0 L55 0 M-55 90 L55 90 M-90 -55 L-90 55 M0 -55 L0 55 M90 -55 L90 55"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="3 3"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.3 }}
          transition={{ duration: 2, delay: 1.5 }}
        />
      </g>
      
      {/* Floating particles */}
      {[...Array(25)].map((_, i) => (
        <motion.circle
          key={i}
          cx={80 + (i * 75)}
          cy={80 + (i % 4) * 160}
          r="3"
          fill="rgba(255, 255, 255, 0.6)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            y: [0, -40, 0]
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
        />
      ))}
    </svg>
  </div>
)

// Hero Slide 0 - All Functions Overview
export const AllFunctionsHeroSlide = ({ className = "w-full h-full" }: { className?: string }) => (
  <div className={className}>
    <svg viewBox="0 0 1920 800" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="allFunctionsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.9" />
          <stop offset="25%" stopColor="#10B981" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.8" />
          <stop offset="75%" stopColor="#F59E0B" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#EC4899" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="streak0" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      <rect width="1920" height="800" fill="url(#allFunctionsGradient)" />
      
      {/* Motion streaks */}
      <motion.path
        d="M0 400 Q480 200 960 400 T1920 400"
        stroke="url(#streak0)"
        strokeWidth="5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1, 
          opacity: [0, 0.7, 0],
          x: [0, 250, 0]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut",
          delay: 0.5
        }}
      />
      
      {/* Floating particles */}
      {[...Array(25)].map((_, i) => (
        <motion.circle
          key={i}
          cx={80 + (i * 75)}
          cy={80 + (i % 4) * 160}
          r="3"
          fill="rgba(255, 255, 255, 0.6)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            y: [0, -40, 0]
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
        />
      ))}
    </svg>
  </div>
)
