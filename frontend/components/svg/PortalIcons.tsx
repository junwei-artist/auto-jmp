import React from 'react'

// Dashboard Icon - Glass Panel with Vibrant Chart
export const DashboardIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="dashBg" x1="0" y1="0" x2="200" y2="200">
        <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id="dashGlass" x1="50" y1="50" x2="150" y2="150">
        <stop offset="0%" stopColor="white" stopOpacity="0.4" />
        <stop offset="100%" stopColor="white" stopOpacity="0.1" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Background Glow */}
    <circle cx="100" cy="100" r="80" fill="url(#dashBg)" filter="url(#glow)" />

    {/* Main Glass Panel */}
    <rect x="40" y="40" width="120" height="120" rx="24" fill="url(#dashGlass)" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />

    {/* Chart Elements */}
    <path d="M60 130 L60 130" stroke="#3B82F6" strokeWidth="12" strokeLinecap="round" />
    <path d="M85 130 L85 100" stroke="#10B981" strokeWidth="12" strokeLinecap="round" />
    <path d="M110 130 L110 80" stroke="#F59E0B" strokeWidth="12" strokeLinecap="round" />
    <path d="M135 130 L135 110" stroke="#8B5CF6" strokeWidth="12" strokeLinecap="round" />

    {/* Floating Data Line */}
    <path d="M55 100 Q85 70 110 75 T145 90" stroke="white" strokeWidth="3" strokeLinecap="round" filter="url(#glow)" />
    <circle cx="110" cy="75" r="4" fill="white" />
  </svg>
)

// Workspaces Icon - Stacked Glass Folders
export const WorkspacesIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="folder1" x1="0" y1="0" x2="0" y2="100%">
        <stop offset="0%" stopColor="#34D399" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id="folder2" x1="0" y1="0" x2="0" y2="100%">
        <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#2563EB" stopOpacity="0.9" />
      </linearGradient>
      <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2" />
      </filter>
    </defs>

    {/* Back Folder */}
    <path d="M50 70 H90 L100 80 H150 V130 A10 10 0 0 1 140 140 H60 A10 10 0 0 1 50 130 V70 Z" fill="url(#folder1)" transform="translate(0, -10)" opacity="0.6" />

    {/* Front Folder */}
    <path d="M40 90 H80 L90 100 H160 V150 A12 12 0 0 1 148 162 H52 A12 12 0 0 1 40 150 V90 Z" fill="url(#folder2)" filter="url(#dropShadow)" />

    {/* Folder Highlight */}
    <path d="M42 92 H78 L88 102 H158" stroke="white" strokeWidth="2" strokeOpacity="0.4" fill="none" />

    {/* User Icon on Folder */}
    <circle cx="100" cy="130" r="12" fill="white" fillOpacity="0.2" />
  </svg>
)

// Workflows Icon - Glowing Connected Nodes
export const WorkflowsIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#A78BFA" stopOpacity="1" />
        <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
      </radialGradient>
      <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Connections */}
    <path d="M60 140 C60 100 140 100 140 60" stroke="#C4B5FD" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 8" />
    <path d="M60 60 C100 60 100 140 140 140" stroke="#C4B5FD" strokeWidth="4" strokeLinecap="round" />

    {/* Nodes */}
    <circle cx="60" cy="60" r="15" fill="#8B5CF6" filter="url(#neon)" />
    <circle cx="60" cy="60" r="6" fill="white" />

    <circle cx="140" cy="60" r="15" fill="#EC4899" filter="url(#neon)" />
    <circle cx="140" cy="60" r="6" fill="white" />

    <circle cx="60" cy="140" r="15" fill="#10B981" filter="url(#neon)" />
    <circle cx="60" cy="140" r="6" fill="white" />

    <circle cx="140" cy="140" r="15" fill="#F59E0B" filter="url(#neon)" />
    <circle cx="140" cy="140" r="6" fill="white" />

    {/* Moving Particle (Simulated) */}
    <circle cx="100" cy="100" r="4" fill="white" filter="url(#neon)" />
  </svg>
)

// Modules Icon - 3D Floating Block
export const ModulesIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cubeTop" x1="0" y1="0" x2="0" y2="100%">
        <stop offset="0%" stopColor="#FCD34D" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="cubeLeft" x1="0" y1="0" x2="0" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
      <linearGradient id="cubeRight" x1="0" y1="0" x2="0" y2="100%">
        <stop offset="0%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
    </defs>

    <g transform="translate(100, 100)">
      {/* Main Cube */}
      <path d="M0 -40 L35 -20 V20 L0 40 L-35 20 V-20 Z" fill="#F59E0B" opacity="0.2" />

      {/* Top Face */}
      <path d="M0 -30 L-30 -15 L0 0 L30 -15 Z" fill="url(#cubeTop)" />

      {/* Left Face */}
      <path d="M-30 -15 V25 L0 40 V0 Z" fill="url(#cubeLeft)" />

      {/* Right Face */}
      <path d="M30 -15 V25 L0 40 V0 Z" fill="url(#cubeRight)" />

      {/* Floating Elements */}
      <rect x="-45" y="-50" width="15" height="15" rx="4" fill="#FCD34D" opacity="0.8" />
      <rect x="30" y="10" width="12" height="12" rx="3" fill="#FCD34D" opacity="0.6" />
      <circle cx="0" cy="-50" r="4" fill="#FCD34D" />
    </g>
  </svg>
)
