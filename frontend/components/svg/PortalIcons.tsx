import React from 'react'

// Dashboard Icon - JMP Visualization
export const DashboardIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2"/>
    
    {/* Dashboard frame */}
    <rect x="50" y="50" width="100" height="100" rx="8" fill="white" stroke="#3B82F6" strokeWidth="2"/>
    
    {/* Chart bars */}
    <rect x="65" y="120" width="12" height="20" fill="#3B82F6" rx="2"/>
    <rect x="85" y="110" width="12" height="30" fill="#10B981" rx="2"/>
    <rect x="105" y="100" width="12" height="40" fill="#8B5CF6" rx="2"/>
    <rect x="125" y="115" width="12" height="25" fill="#F59E0B" rx="2"/>
    
    {/* Grid lines */}
    <line x1="50" y1="90" x2="150" y2="90" stroke="#E2E8F0" strokeWidth="1"/>
    <line x1="50" y1="110" x2="150" y2="110" stroke="#E2E8F0" strokeWidth="1"/>
    <line x1="50" y1="130" x2="150" y2="130" stroke="#E2E8F0" strokeWidth="1"/>
    
    {/* Data points */}
    <circle cx="70" cy="80" r="3" fill="#3B82F6"/>
    <circle cx="90" cy="75" r="3" fill="#10B981"/>
    <circle cx="110" cy="70" r="3" fill="#8B5CF6"/>
    <circle cx="130" cy="85" r="3" fill="#F59E0B"/>
    
    {/* Connection line */}
    <path d="M70 80L90 75L110 70L130 85" stroke="#3B82F6" strokeWidth="2" strokeDasharray="3 3" fill="none"/>
  </svg>
)

// Workspaces Icon - Task Organization
export const WorkspacesIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#F0FDF4" stroke="#10B981" strokeWidth="2"/>
    
    {/* Folder structure */}
    <rect x="60" y="70" width="50" height="40" rx="4" fill="#10B981" opacity="0.8"/>
    <rect x="60" y="70" width="50" height="12" rx="4" fill="#059669"/>
    <rect x="65" y="78" width="20" height="2" fill="white" opacity="0.8"/>
    <rect x="65" y="82" width="15" height="2" fill="white" opacity="0.6"/>
    
    {/* Second folder */}
    <rect x="90" y="85" width="50" height="40" rx="4" fill="#3B82F6" opacity="0.8"/>
    <rect x="90" y="85" width="50" height="12" rx="4" fill="#2563EB"/>
    <rect x="95" y="93" width="20" height="2" fill="white" opacity="0.8"/>
    <rect x="95" y="97" width="15" height="2" fill="white" opacity="0.6"/>
    
    {/* Third folder */}
    <rect x="50" y="100" width="50" height="40" rx="4" fill="#8B5CF6" opacity="0.8"/>
    <rect x="50" y="100" width="50" height="12" rx="4" fill="#7C3AED"/>
    <rect x="55" y="108" width="20" height="2" fill="white" opacity="0.8"/>
    <rect x="55" y="112" width="15" height="2" fill="white" opacity="0.6"/>
    
    {/* Tags/Labels */}
    <circle cx="75" cy="60" r="4" fill="#10B981"/>
    <circle cx="105" cy="75" r="4" fill="#3B82F6"/>
    <circle cx="65" cy="90" r="4" fill="#8B5CF6"/>
  </svg>
)

// Workflows Icon - Node Automation
export const WorkflowsIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="2"/>
    
    {/* Central node */}
    <circle cx="100" cy="100" r="20" fill="#8B5CF6" opacity="0.8"/>
    <circle cx="100" cy="100" r="12" fill="white"/>
    
    {/* Connected nodes */}
    <circle cx="50" cy="70" r="15" fill="#3B82F6" opacity="0.8"/>
    <circle cx="50" cy="70" r="8" fill="white"/>
    
    <circle cx="150" cy="70" r="15" fill="#10B981" opacity="0.8"/>
    <circle cx="150" cy="70" r="8" fill="white"/>
    
    <circle cx="50" cy="130" r="15" fill="#F59E0B" opacity="0.8"/>
    <circle cx="50" cy="130" r="8" fill="white"/>
    
    <circle cx="150" cy="130" r="15" fill="#EF4444" opacity="0.8"/>
    <circle cx="150" cy="130" r="8" fill="white"/>
    
    {/* Connection lines with arrows */}
    <path d="M65 77L85 90" stroke="#8B5CF6" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>
    <path d="M135 77L115 90" stroke="#8B5CF6" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>
    <path d="M65 123L85 110" stroke="#8B5CF6" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>
    <path d="M135 123L115 110" stroke="#8B5CF6" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>
    
    {/* Arrow marker definition */}
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#8B5CF6"/>
      </marker>
    </defs>
    
    {/* Data flow indicators */}
    <circle cx="70" cy="85" r="2" fill="#8B5CF6" opacity="0.6"/>
    <circle cx="130" cy="85" r="2" fill="#8B5CF6" opacity="0.6"/>
    <circle cx="70" cy="115" r="2" fill="#8B5CF6" opacity="0.6"/>
    <circle cx="130" cy="115" r="2" fill="#8B5CF6" opacity="0.6"/>
  </svg>
)

// Modules Icon - Data Analysis Functions
export const ModulesIconSVG = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background circle */}
    <circle cx="100" cy="100" r="90" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2"/>
    
    {/* Module boxes */}
    <rect x="50" y="60" width="35" height="35" rx="4" fill="#3B82F6" opacity="0.8"/>
    <rect x="50" y="60" width="35" height="8" rx="4" fill="#2563EB"/>
    <circle cx="67.5" cy="77.5" r="4" fill="white"/>
    
    <rect x="115" y="60" width="35" height="35" rx="4" fill="#10B981" opacity="0.8"/>
    <rect x="115" y="60" width="35" height="8" rx="4" fill="#059669"/>
    <rect x="120" y="75" width="8" height="8" rx="1" fill="white"/>
    <rect x="132" y="75" width="8" height="8" rx="1" fill="white"/>
    <rect x="120" y="82" width="20" height="4" rx="1" fill="white" opacity="0.8"/>
    
    <rect x="50" y="105" width="35" height="35" rx="4" fill="#8B5CF6" opacity="0.8"/>
    <rect x="50" y="105" width="35" height="8" rx="4" fill="#7C3AED"/>
    <path d="M60 120L67.5 127.5L75 120" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    
    <rect x="115" y="105" width="35" height="35" rx="4" fill="#EF4444" opacity="0.8"/>
    <rect x="115" y="105" width="35" height="8" rx="4" fill="#DC2626"/>
    <circle cx="132.5" cy="122.5" r="6" fill="white" opacity="0.3"/>
    <circle cx="132.5" cy="122.5" r="3" fill="white"/>
    
    {/* Connection lines */}
    <path d="M85 77.5L110 77.5" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3 3" fill="none"/>
    <path d="M85 122.5L110 122.5" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3 3" fill="none"/>
    <path d="M67.5 95L67.5 100" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3 3" fill="none"/>
    <path d="M132.5 95L132.5 100" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3 3" fill="none"/>
  </svg>
)

