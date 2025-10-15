import React from 'react'

export const DataUploadSVG = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2"/>
    
    {/* Upload arrow */}
    <path d="M100 40L100 120M100 40L80 60M100 40L120 60" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    
    {/* Document */}
    <rect x="70" y="130" width="60" height="40" rx="4" fill="#3B82F6" opacity="0.8"/>
    <rect x="75" y="135" width="50" height="3" fill="white"/>
    <rect x="75" y="142" width="40" height="2" fill="white" opacity="0.8"/>
    <rect x="75" y="148" width="35" height="2" fill="white" opacity="0.6"/>
    
    {/* Data points */}
    <circle cx="60" cy="80" r="3" fill="#10B981"/>
    <circle cx="80" cy="70" r="3" fill="#10B981"/>
    <circle cx="120" cy="75" r="3" fill="#10B981"/>
    <circle cx="140" cy="85" r="3" fill="#10B981"/>
    
    {/* Connection lines */}
    <path d="M60 80L80 70L120 75L140 85" stroke="#10B981" strokeWidth="2" strokeDasharray="4 4"/>
  </svg>
)

export const RealTimeProcessingSVG = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#F0FDF4" stroke="#10B981" strokeWidth="2"/>
    
    {/* Central processing unit */}
    <rect x="80" y="80" width="40" height="40" rx="4" fill="#10B981" opacity="0.8"/>
    
    {/* Processing indicators */}
    <circle cx="90" cy="90" r="2" fill="white" opacity="0.8"/>
    <circle cx="100" cy="90" r="2" fill="white" opacity="0.8"/>
    <circle cx="110" cy="90" r="2" fill="white" opacity="0.8"/>
    
    {/* Data flow arrows */}
    <path d="M40 100L75 100" stroke="#10B981" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M125 100L160 100" stroke="#10B981" strokeWidth="2" strokeDasharray="4 4"/>
    
    {/* Progress bars */}
    <rect x="60" y="130" width="80" height="6" rx="3" fill="#E5E7EB"/>
    <rect x="60" y="130" width="60" height="6" rx="3" fill="#10B981"/>
  </svg>
)

export const ShareCollaborateSVG = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="2"/>
    
    {/* Central sharing hub */}
    <circle cx="100" cy="100" r="25" fill="#8B5CF6" opacity="0.8"/>
    <path d="M100 85L100 115M100 85L85 100M100 85L115 100" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    
    {/* Connected users */}
    <circle cx="50" cy="60" r="15" fill="#8B5CF6" opacity="0.6"/>
    <circle cx="50" cy="60" r="8" fill="white"/>
    
    <circle cx="150" cy="60" r="15" fill="#8B5CF6" opacity="0.6"/>
    <circle cx="150" cy="60" r="8" fill="white"/>
    
    <circle cx="50" cy="140" r="15" fill="#8B5CF6" opacity="0.6"/>
    <circle cx="50" cy="140" r="8" fill="white"/>
    
    <circle cx="150" cy="140" r="15" fill="#8B5CF6" opacity="0.6"/>
    <circle cx="150" cy="140" r="8" fill="white"/>
    
    {/* Connection lines */}
    <path d="M65 70L85 90" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M135 70L115 90" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M65 130L85 110" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M135 130L115 110" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4 4"/>
    
    {/* Share icons */}
    <circle cx="40" cy="40" r="3" fill="#8B5CF6"/>
    <circle cx="160" cy="40" r="3" fill="#8B5CF6"/>
    <circle cx="40" cy="160" r="3" fill="#8B5CF6"/>
    <circle cx="160" cy="160" r="3" fill="#8B5CF6"/>
  </svg>
)

export const AnalyticsDashboardSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background */}
    <rect x="20" y="20" width="160" height="160" rx="12" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
    
    {/* Chart area */}
    <rect x="40" y="60" width="120" height="80" rx="4" fill="white" stroke="#E2E8F0"/>
    
    {/* Bar chart */}
    <rect x="50" y="120" width="12" height="15" fill="#3B82F6"/>
    <rect x="70" y="110" width="12" height="25" fill="#10B981"/>
    <rect x="90" y="100" width="12" height="35" fill="#F59E0B"/>
    <rect x="110" y="90" width="12" height="45" fill="#EF4444"/>
    <rect x="130" y="105" width="12" height="30" fill="#8B5CF6"/>
    
    {/* Chart title */}
    <text x="100" y="50" textAnchor="middle" className="text-sm font-semibold fill-gray-700">Data Analysis</text>
    
    {/* Sidebar */}
    <rect x="20" y="20" width="15" height="160" fill="#3B82F6" opacity="0.1"/>
    
    {/* Menu items */}
    <rect x="25" y="30" width="5" height="5" rx="1" fill="#3B82F6"/>
    <rect x="25" y="45" width="5" height="5" rx="1" fill="#3B82F6"/>
    <rect x="25" y="60" width="5" height="5" rx="1" fill="#3B82F6"/>
    <rect x="25" y="75" width="5" height="5" rx="1" fill="#3B82F6"/>
    
    {/* Status indicators */}
    <circle cx="170" cy="40" r="4" fill="#10B981"/>
    <circle cx="170" cy="60" r="4" fill="#F59E0B"/>
    <circle cx="170" cy="80" r="4" fill="#EF4444"/>
  </svg>
)

export const PluginEcosystemSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Central hub */}
    <circle cx="100" cy="100" r="30" fill="#3B82F6" opacity="0.8"/>
    <text x="100" y="105" textAnchor="middle" className="text-xs font-bold fill-white">JMP</text>
    
    {/* Plugin modules */}
    <rect x="40" y="40" width="25" height="25" rx="4" fill="#10B981" opacity="0.8"/>
    <text x="52.5" y="55" textAnchor="middle" className="text-xs font-semibold fill-white">V1</text>
    
    <rect x="135" y="40" width="25" height="25" rx="4" fill="#F59E0B" opacity="0.8"/>
    <text x="147.5" y="55" textAnchor="middle" className="text-xs font-semibold fill-white">V2</text>
    
    <rect x="40" y="135" width="25" height="25" rx="4" fill="#8B5CF6" opacity="0.8"/>
    <text x="52.5" y="150" textAnchor="middle" className="text-xs font-semibold fill-white">PC</text>
    
    <rect x="135" y="135" width="25" height="25" rx="4" fill="#EF4444" opacity="0.8"/>
    <text x="147.5" y="150" textAnchor="middle" className="text-xs font-semibold fill-white">+</text>
    
    {/* Connection lines */}
    <path d="M65 52.5L70 70" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M135 52.5L130 70" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M65 147.5L70 130" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 4"/>
    <path d="M135 147.5L130 130" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 4"/>
    
    {/* Data flow indicators */}
    <circle cx="80" cy="80" r="2" fill="#3B82F6" opacity="0.6"/>
    <circle cx="120" cy="80" r="2" fill="#3B82F6" opacity="0.6"/>
    <circle cx="80" cy="120" r="2" fill="#3B82F6" opacity="0.6"/>
    <circle cx="120" cy="120" r="2" fill="#3B82F6" opacity="0.6"/>
  </svg>
)
