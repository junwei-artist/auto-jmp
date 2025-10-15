import React from 'react'

export const ProjectStatsSVG = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2"/>
    
    {/* Project folder */}
    <rect x="70" y="60" width="60" height="45" rx="4" fill="#3B82F6" opacity="0.8"/>
    <rect x="70" y="50" width="30" height="15" rx="2" fill="#3B82F6" opacity="0.6"/>
    
    {/* Document icons */}
    <rect x="80" y="70" width="15" height="20" rx="2" fill="white" opacity="0.9"/>
    <rect x="100" y="70" width="15" height="20" rx="2" fill="white" opacity="0.9"/>
    <rect x="120" y="70" width="15" height="20" rx="2" fill="white" opacity="0.9"/>
    
    {/* Stats indicators */}
    <circle cx="50" cy="50" r="8" fill="#10B981"/>
    <text x="50" y="55" textAnchor="middle" className="text-xs font-bold fill-white">3</text>
    
    <circle cx="150" cy="50" r="8" fill="#F59E0B"/>
    <text x="150" y="55" textAnchor="middle" className="text-xs font-bold fill-white">5</text>
    
    <circle cx="50" cy="150" r="8" fill="#8B5CF6"/>
    <text x="50" y="155" textAnchor="middle" className="text-xs font-bold fill-white">2</text>
  </svg>
)

export const RunStatsSVG = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#F0FDF4" stroke="#10B981" strokeWidth="2"/>
    
    {/* Chart area */}
    <rect x="60" y="80" width="80" height="40" rx="4" fill="white" stroke="#10B981" strokeWidth="1"/>
    
    {/* Bar chart */}
    <rect x="70" y="110" width="8" height="10" fill="#10B981"/>
    <rect x="85" y="105" width="8" height="15" fill="#10B981"/>
    <rect x="100" y="100" width="8" height="20" fill="#10B981"/>
    <rect x="115" y="95" width="8" height="25" fill="#10B981"/>
    <rect x="130" y="90" width="8" height="30" fill="#10B981"/>
    
    {/* Chart title */}
    <text x="100" y="70" textAnchor="middle" className="text-sm font-semibold fill-gray-700">Runs</text>
    
    {/* Status indicators */}
    <circle cx="50" cy="50" r="6" fill="#10B981"/>
    <circle cx="150" cy="50" r="6" fill="#F59E0B"/>
    <circle cx="50" cy="150" r="6" fill="#EF4444"/>
    <circle cx="150" cy="150" r="6" fill="#6B7280"/>
  </svg>
)

export const ActiveRunsSVG = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2"/>
    
    {/* Central processing unit */}
    <rect x="80" y="80" width="40" height="40" rx="4" fill="#F59E0B" opacity="0.8"/>
    
    {/* Processing indicators */}
    <circle cx="90" cy="90" r="2" fill="white" opacity="0.9"/>
    <circle cx="100" cy="90" r="2" fill="white" opacity="0.9"/>
    <circle cx="110" cy="90" r="2" fill="white" opacity="0.9"/>
    <circle cx="90" cy="100" r="2" fill="white" opacity="0.9"/>
    <circle cx="100" cy="100" r="2" fill="white" opacity="0.9"/>
    <circle cx="110" cy="100" r="2" fill="white" opacity="0.9"/>
    <circle cx="90" cy="110" r="2" fill="white" opacity="0.9"/>
    <circle cx="100" cy="110" r="2" fill="white" opacity="0.9"/>
    <circle cx="110" cy="110" r="2" fill="white" opacity="0.9"/>
    
    {/* Activity indicators */}
    <circle cx="50" cy="50" r="4" fill="#F59E0B" opacity="0.8"/>
    <circle cx="150" cy="50" r="4" fill="#F59E0B" opacity="0.8"/>
    <circle cx="50" cy="150" r="4" fill="#F59E0B" opacity="0.8"/>
    <circle cx="150" cy="150" r="4" fill="#F59E0B" opacity="0.8"/>
  </svg>
)

export const EmptyProjectsSVG = ({ className = "w-24 h-24" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background */}
    <rect x="20" y="20" width="160" height="160" rx="12" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
    
    {/* Empty folder */}
    <rect x="70" y="80" width="60" height="40" rx="4" fill="#E2E8F0" opacity="0.6"/>
    <rect x="70" y="70" width="30" height="15" rx="2" fill="#E2E8F0" opacity="0.4"/>
    
    {/* Plus icon */}
    <circle cx="100" cy="100" r="20" fill="#3B82F6" opacity="0.8"/>
    <path d="M100 90L100 110M100 90L90 100M100 90L110 100" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    
    {/* Floating elements */}
    <circle cx="60" cy="60" r="3" fill="#3B82F6" opacity="0.4"/>
    <circle cx="140" cy="60" r="3" fill="#3B82F6" opacity="0.4"/>
    <circle cx="60" cy="140" r="3" fill="#3B82F6" opacity="0.4"/>
    <circle cx="140" cy="140" r="3" fill="#3B82F6" opacity="0.4"/>
  </svg>
)

export const PluginCardSVG = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="2"/>
    
    {/* Plugin icon */}
    <rect x="80" y="80" width="40" height="40" rx="6" fill="#8B5CF6" opacity="0.8"/>
    
    {/* Plugin elements */}
    <rect x="85" y="85" width="8" height="8" rx="1" fill="white"/>
    <rect x="98" y="85" width="8" height="8" rx="1" fill="white"/>
    <rect x="111" y="85" width="8" height="8" rx="1" fill="white"/>
    <rect x="85" y="98" width="8" height="8" rx="1" fill="white"/>
    <rect x="98" y="98" width="8" height="8" rx="1" fill="white"/>
    <rect x="111" y="98" width="8" height="8" rx="1" fill="white"/>
    <rect x="85" y="111" width="8" height="8" rx="1" fill="white"/>
    <rect x="98" y="111" width="8" height="8" rx="1" fill="white"/>
    <rect x="111" y="111" width="8" height="8" rx="1" fill="white"/>
    
    {/* Connection lines */}
    <path d="M50 50L75 75" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M150 50L125 75" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M50 150L75 125" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M150 150L125 125" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
  </svg>
)

export const QuickAnalysisSVG = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#FEF2F2" stroke="#EF4444" strokeWidth="2"/>
    
    {/* Chart area */}
    <rect x="60" y="60" width="80" height="60" rx="4" fill="white" stroke="#EF4444" strokeWidth="1"/>
    
    {/* Boxplot elements */}
    <line x1="80" y1="80" x2="80" y2="100" stroke="#EF4444" strokeWidth="2"/>
    <line x1="75" y1="80" x2="85" y2="80" stroke="#EF4444" strokeWidth="2"/>
    <line x1="75" y1="100" x2="85" y2="100" stroke="#EF4444" strokeWidth="2"/>
    <rect x="77" y="85" width="6" height="10" fill="#EF4444" opacity="0.6"/>
    
    <line x1="100" y1="75" x2="100" y2="105" stroke="#EF4444" strokeWidth="2"/>
    <line x1="95" y1="75" x2="105" y2="75" stroke="#EF4444" strokeWidth="2"/>
    <line x1="95" y1="105" x2="105" y2="105" stroke="#EF4444" strokeWidth="2"/>
    <rect x="97" y="80" width="6" height="20" fill="#EF4444" opacity="0.6"/>
    
    <line x1="120" y1="85" x2="120" y2="95" stroke="#EF4444" strokeWidth="2"/>
    <line x1="115" y1="85" x2="125" y2="85" stroke="#EF4444" strokeWidth="2"/>
    <line x1="115" y1="95" x2="125" y2="95" stroke="#EF4444" strokeWidth="2"/>
    <rect x="117" y="87" width="6" height="6" fill="#EF4444" opacity="0.6"/>
    
    {/* Upload arrow */}
    <path d="M100 40L100 55M100 40L90 50M100 40L110 50" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const RecentRunsSVG = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#F3F4F6" stroke="#6B7280" strokeWidth="2"/>
    
    {/* Clock icon */}
    <circle cx="100" cy="100" r="30" fill="#6B7280" opacity="0.8"/>
    <circle cx="100" cy="100" r="25" fill="white"/>
    
    {/* Clock hands */}
    <line x1="100" y1="100" x2="100" y2="80" stroke="#6B7280" strokeWidth="3" strokeLinecap="round"/>
    <line x1="100" y1="100" x2="110" y2="100" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"/>
    
    {/* Status indicators around clock */}
    <circle cx="50" cy="50" r="6" fill="#10B981"/>
    <circle cx="150" cy="50" r="6" fill="#F59E0B"/>
    <circle cx="50" cy="150" r="6" fill="#EF4444"/>
    <circle cx="150" cy="150" r="6" fill="#6B7280"/>
    
    {/* Connection lines */}
    <path d="M56 56L75 75" stroke="#6B7280" strokeWidth="1" strokeDasharray="2 2"/>
    <path d="M144 56L125 75" stroke="#6B7280" strokeWidth="1" strokeDasharray="2 2"/>
    <path d="M56 144L75 125" stroke="#6B7280" strokeWidth="1" strokeDasharray="2 2"/>
    <path d="M144 144L125 125" stroke="#6B7280" strokeWidth="1" strokeDasharray="2 2"/>
  </svg>
)

export const WelcomeSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background */}
    <rect x="20" y="20" width="160" height="160" rx="20" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2"/>
    
    {/* Welcome elements */}
    <circle cx="100" cy="80" r="25" fill="#3B82F6" opacity="0.8"/>
    <path d="M90 75L95 80L110 65" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    
    {/* Dashboard elements */}
    <rect x="60" y="120" width="80" height="40" rx="4" fill="white" stroke="#3B82F6" strokeWidth="1"/>
    <rect x="70" y="130" width="15" height="20" rx="2" fill="#3B82F6" opacity="0.6"/>
    <rect x="90" y="130" width="15" height="20" rx="2" fill="#3B82F6" opacity="0.6"/>
    <rect x="110" y="130" width="15" height="20" rx="2" fill="#3B82F6" opacity="0.6"/>
    
    {/* Floating elements */}
    <circle cx="50" cy="50" r="4" fill="#3B82F6" opacity="0.6"/>
    <circle cx="150" cy="50" r="4" fill="#3B82F6" opacity="0.6"/>
    <circle cx="50" cy="150" r="4" fill="#3B82F6" opacity="0.6"/>
    <circle cx="150" cy="150" r="4" fill="#3B82F6" opacity="0.6"/>
  </svg>
)
