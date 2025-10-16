import React from 'react'

export const LoginFlowSVG = ({ className = "w-full h-64" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 800 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Step 1: Login Page */}
    <g>
      <rect x="20" y="20" width="180" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="160" height="20" rx="4" fill="#3B82F6" opacity="0.8"/>
      <text x="110" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Login Page</text>
      
      {/* Menu Bar */}
      <rect x="30" y="60" width="160" height="8" rx="2" fill="#E2E8F0"/>
      <circle cx="40" cy="64" r="2" fill="#3B82F6"/>
      <text x="50" y="68" className="text-xs fill-gray-600">Help</text>
      <circle cx="180" cy="64" r="2" fill="#6B7280"/>
      
      {/* Auth Forms */}
      <rect x="30" y="80" width="160" height="12" rx="2" fill="#E2E8F0"/>
      <text x="40" y="88" className="text-xs fill-gray-600">Login | Register | Guest</text>
      
      <rect x="30" y="100" width="160" height="8" rx="2" fill="#E2E8F0"/>
      <text x="40" y="106" className="text-xs fill-gray-600">Email: your@email.com</text>
      
      <rect x="30" y="115" width="160" height="8" rx="2" fill="#E2E8F0"/>
      <text x="40" y="121" className="text-xs fill-gray-600">Password: ••••••••</text>
      
      <rect x="30" y="130" width="160" height="12" rx="2" fill="#3B82F6"/>
      <text x="110" y="138" textAnchor="middle" className="text-xs font-semibold fill-white">Login</text>
    </g>
    
    {/* Arrow */}
    <path d="M220 128L240 128" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 2: Dashboard */}
    <g>
      <rect x="260" y="20" width="180" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="270" y="30" width="160" height="20" rx="4" fill="#10B981" opacity="0.8"/>
      <text x="350" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Dashboard</text>
      
      {/* Stats Cards */}
      <rect x="270" y="60" width="50" height="30" rx="4" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="295" y="75" textAnchor="middle" className="text-xs font-bold fill-blue-600">3</text>
      <text x="295" y="85" textAnchor="middle" className="text-xs fill-gray-600">Projects</text>
      
      <rect x="330" y="60" width="50" height="30" rx="4" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="355" y="75" textAnchor="middle" className="text-xs font-bold fill-green-600">12</text>
      <text x="355" y="85" textAnchor="middle" className="text-xs fill-gray-600">Runs</text>
      
      <rect x="390" y="60" width="50" height="30" rx="4" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="415" y="75" textAnchor="middle" className="text-xs font-bold fill-amber-600">2</text>
      <text x="415" y="85" textAnchor="middle" className="text-xs fill-gray-600">Active</text>
      
      {/* Project Cards */}
      <rect x="270" y="100" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="280" y="115" className="text-xs font-semibold fill-gray-900">My Analysis Project</text>
      <text x="280" y="125" className="text-xs fill-gray-600">Excel data analysis</text>
      <text x="280" y="135" className="text-xs fill-gray-500">Created: 2024-01-15</text>
      
      <rect x="270" y="150" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="280" y="165" className="text-xs font-semibold fill-gray-900">Boxplot Study</text>
      <text x="280" y="175" className="text-xs fill-gray-600">Statistical visualization</text>
      <text x="280" y="185" className="text-xs fill-gray-500">Created: 2024-01-10</text>
      
      {/* Plugin Cards */}
      <rect x="270" y="200" width="75" height="30" rx="4" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="307" y="215" textAnchor="middle" className="text-xs font-semibold fill-purple-600">Plugins</text>
      
      <rect x="355" y="200" width="75" height="30" rx="4" fill="#FEF2F2" stroke="#EF4444" strokeWidth="1"/>
      <text x="392" y="215" textAnchor="middle" className="text-xs font-semibold fill-red-600">Quick Start</text>
    </g>
    
    {/* Arrow */}
    <path d="M460 128L480 128" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 3: Plugin Selection */}
    <g>
      <rect x="500" y="20" width="180" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="510" y="30" width="160" height="20" rx="4" fill="#8B5CF6" opacity="0.8"/>
      <text x="590" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Plugin Selection</text>
      
      {/* Plugin Options */}
      <rect x="510" y="60" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="75" className="text-xs font-semibold fill-gray-900">Excel2Boxplot V1</text>
      <text x="520" y="85" className="text-xs fill-gray-600">Three-checkpoint validation</text>
      <text x="520" y="95" className="text-xs fill-gray-500">CSV and JSL generation</text>
      
      <rect x="510" y="110" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="125" className="text-xs font-semibold fill-gray-900">Excel2Boxplot V2</text>
      <text x="520" y="135" className="text-xs fill-gray-600">V2 column mapping</text>
      <text x="520" y="145" className="text-xs fill-gray-500">Stage as categorical variable</text>
      
      <rect x="510" y="160" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="175" className="text-xs font-semibold fill-gray-900">Process Capability</text>
      <text x="520" y="185" className="text-xs fill-gray-600">Cp, Cpk, Pp, Ppk analysis</text>
      <text x="520" y="195" className="text-xs fill-gray-500">Control charts generation</text>
      
      <rect x="510" y="210" width="160" height="12" rx="2" fill="#8B5CF6"/>
      <text x="590" y="218" textAnchor="middle" className="text-xs font-semibold fill-white">Select Plugin</text>
    </g>
    
    {/* Arrow marker definition */}
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280"/>
      </marker>
    </defs>
  </svg>
)

export const LoginFlowSVG_CN = ({ className = "w-full h-64" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 800 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Step 1: Login Page */}
    <g>
      <rect x="20" y="20" width="180" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="160" height="20" rx="4" fill="#3B82F6" opacity="0.8"/>
      <text x="110" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">登录页面</text>
      
      {/* Menu Bar */}
      <rect x="30" y="60" width="160" height="8" rx="2" fill="#E2E8F0"/>
      <circle cx="40" cy="64" r="2" fill="#3B82F6"/>
      <text x="50" y="68" className="text-xs fill-gray-600">帮助</text>
      <circle cx="180" cy="64" r="2" fill="#6B7280"/>
      
      {/* Auth Forms */}
      <rect x="30" y="80" width="160" height="12" rx="2" fill="#E2E8F0"/>
      <text x="40" y="88" className="text-xs fill-gray-600">登录 | 注册 | 游客</text>
      
      <rect x="30" y="100" width="160" height="8" rx="2" fill="#E2E8F0"/>
      <text x="40" y="106" className="text-xs fill-gray-600">邮箱: your@email.com</text>
      
      <rect x="30" y="115" width="160" height="8" rx="2" fill="#E2E8F0"/>
      <text x="40" y="121" className="text-xs fill-gray-600">密码: ••••••••</text>
      
      <rect x="30" y="130" width="160" height="12" rx="2" fill="#3B82F6"/>
      <text x="110" y="138" textAnchor="middle" className="text-xs font-semibold fill-white">登录</text>
    </g>
    
    {/* Arrow */}
    <path d="M220 128L240 128" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 2: Dashboard */}
    <g>
      <rect x="260" y="20" width="180" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="270" y="30" width="160" height="20" rx="4" fill="#10B981" opacity="0.8"/>
      <text x="350" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">仪表板</text>
      
      {/* Stats Cards */}
      <rect x="270" y="60" width="50" height="30" rx="4" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="295" y="75" textAnchor="middle" className="text-xs font-bold fill-blue-600">3</text>
      <text x="295" y="85" textAnchor="middle" className="text-xs fill-gray-600">项目</text>
      
      <rect x="330" y="60" width="50" height="30" rx="4" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="355" y="75" textAnchor="middle" className="text-xs font-bold fill-green-600">12</text>
      <text x="355" y="85" textAnchor="middle" className="text-xs fill-gray-600">运行</text>
      
      <rect x="390" y="60" width="50" height="30" rx="4" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="415" y="75" textAnchor="middle" className="text-xs font-bold fill-amber-600">2</text>
      <text x="415" y="85" textAnchor="middle" className="text-xs fill-gray-600">活跃</text>
      
      {/* Project Cards */}
      <rect x="270" y="100" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="280" y="115" className="text-xs font-semibold fill-gray-900">我的分析项目</text>
      <text x="280" y="125" className="text-xs fill-gray-600">Excel数据分析</text>
      <text x="280" y="135" className="text-xs fill-gray-500">创建: 2024-01-15</text>
      
      <rect x="270" y="150" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="280" y="165" className="text-xs font-semibold fill-gray-900">箱线图研究</text>
      <text x="280" y="175" className="text-xs fill-gray-600">统计可视化</text>
      <text x="280" y="185" className="text-xs fill-gray-500">创建: 2024-01-10</text>
      
      {/* Plugin Cards */}
      <rect x="270" y="200" width="75" height="30" rx="4" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="307" y="215" textAnchor="middle" className="text-xs font-semibold fill-purple-600">插件</text>
      
      <rect x="355" y="200" width="75" height="30" rx="4" fill="#FEF2F2" stroke="#EF4444" strokeWidth="1"/>
      <text x="392" y="215" textAnchor="middle" className="text-xs font-semibold fill-red-600">快速开始</text>
    </g>
    
    {/* Arrow */}
    <path d="M460 128L480 128" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 3: Plugin Selection */}
    <g>
      <rect x="500" y="20" width="180" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="510" y="30" width="160" height="20" rx="4" fill="#8B5CF6" opacity="0.8"/>
      <text x="590" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">插件选择</text>
      
      {/* Plugin Options */}
      <rect x="510" y="60" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="75" className="text-xs font-semibold fill-gray-900">Excel转箱线图 V1</text>
      <text x="520" y="85" className="text-xs fill-gray-600">三点验证系统</text>
      <text x="520" y="95" className="text-xs fill-gray-500">CSV和JSL生成</text>
      
      <rect x="510" y="110" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="125" className="text-xs font-semibold fill-gray-900">Excel转箱线图 V2</text>
      <text x="520" y="135" className="text-xs fill-gray-600">V2列映射</text>
      <text x="520" y="145" className="text-xs fill-gray-500">Stage作为分类变量</text>
      
      <rect x="510" y="160" width="160" height="40" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="175" className="text-xs font-semibold fill-gray-900">过程能力分析</text>
      <text x="520" y="185" className="text-xs fill-gray-600">Cp, Cpk, Pp, Ppk分析</text>
      <text x="520" y="195" className="text-xs fill-gray-500">控制图生成</text>
      
      <rect x="510" y="210" width="160" height="12" rx="2" fill="#8B5CF6"/>
      <text x="590" y="218" textAnchor="middle" className="text-xs font-semibold fill-white">选择插件</text>
    </g>
    
    {/* Arrow marker definition */}
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280"/>
      </marker>
    </defs>
  </svg>
)

export const PluginWorkflowSVG = ({ className = "w-full h-80" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 1000 320" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Step 1: Upload */}
    <g>
      <rect x="20" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="140" height="20" rx="4" fill="#3B82F6" opacity="0.8"/>
      <text x="100" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">1. Upload Excel</text>
      
      {/* Upload Area */}
      <rect x="30" y="60" width="140" height="80" rx="4" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 4"/>
      <path d="M100 80L100 120M100 80L80 100M100 80L120 100" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="100" y="140" textAnchor="middle" className="text-xs fill-gray-600">Drag & Drop Excel File</text>
      
      {/* File Info */}
      <rect x="30" y="150" width="140" height="30" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="40" y="165" className="text-xs fill-gray-900">data.xlsx</text>
      <text x="40" y="175" className="text-xs fill-gray-500">2.5 MB • Excel Format</text>
      
      <rect x="30" y="190" width="140" height="12" rx="2" fill="#3B82F6"/>
      <text x="100" y="198" textAnchor="middle" className="text-xs font-semibold fill-white">Analyze File</text>
    </g>
    
    {/* Arrow */}
    <path d="M200 120L220 120" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 2: Variable Selection */}
    <g>
      <rect x="240" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="250" y="30" width="140" height="20" rx="4" fill="#10B981" opacity="0.8"/>
      <text x="320" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">2. Select Variables</text>
      
      {/* Variable List */}
      <rect x="250" y="60" width="140" height="100" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="260" y="75" className="text-xs font-semibold fill-gray-900">Categorical Variables:</text>
      
      <rect x="260" y="80" width="120" height="15" rx="2" fill="#10B981" opacity="0.1"/>
      <text x="270" y="90" className="text-xs fill-gray-900">✓ Stage</text>
      
      <rect x="260" y="100" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="270" y="110" className="text-xs fill-gray-600">Group</text>
      
      <rect x="260" y="120" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="270" y="130" className="text-xs fill-gray-600">Category</text>
      
      <rect x="260" y="140" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="270" y="150" className="text-xs fill-gray-600">Type</text>
      
      <rect x="250" y="170" width="140" height="12" rx="2" fill="#10B981"/>
      <text x="320" y="178" textAnchor="middle" className="text-xs font-semibold fill-white">Continue</text>
    </g>
    
    {/* Arrow */}
    <path d="M420 120L440 120" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 3: Validation */}
    <g>
      <rect x="460" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="470" y="30" width="140" height="20" rx="4" fill="#F59E0B" opacity="0.8"/>
      <text x="540" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">3. Data Validation</text>
      
      {/* Validation Results */}
      <rect x="470" y="60" width="140" height="100" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      
      <rect x="480" y="70" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="490" y="80" className="text-xs fill-gray-900">✓ Structure Check</text>
      
      <rect x="480" y="90" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="490" y="100" className="text-xs fill-gray-900">✓ Metadata Check</text>
      
      <rect x="480" y="110" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="490" y="120" className="text-xs fill-gray-900">✓ Data Quality Check</text>
      
      <rect x="480" y="130" width="120" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="490" y="140" className="text-xs fill-gray-900">⚠ Minor Issues Found</text>
      
      <rect x="470" y="170" width="140" height="12" rx="2" fill="#F59E0B"/>
      <text x="540" y="178" textAnchor="middle" className="text-xs font-semibold fill-white">Fix & Continue</text>
    </g>
    
    {/* Arrow */}
    <path d="M640 120L660 120" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 4: Processing */}
    <g>
      <rect x="680" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="690" y="30" width="140" height="20" rx="4" fill="#8B5CF6" opacity="0.8"/>
      <text x="760" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">4. Generate Files</text>
      
      {/* Processing Status */}
      <rect x="690" y="60" width="140" height="100" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      
      <rect x="700" y="70" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="710" y="80" className="text-xs fill-gray-900">✓ CSV Generated</text>
      
      <rect x="700" y="90" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="710" y="100" className="text-xs fill-gray-900">✓ JSL Script Created</text>
      
      <rect x="700" y="110" width="120" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="710" y="120" className="text-xs fill-gray-900">⚡ Running Analysis...</text>
      
      <rect x="700" y="130" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="710" y="140" className="text-xs fill-gray-600">⏳ Generating Charts</text>
      
      <rect x="690" y="170" width="140" height="12" rx="2" fill="#8B5CF6"/>
      <text x="760" y="178" textAnchor="middle" className="text-xs font-semibold fill-white">View Results</text>
    </g>
    
    {/* Arrow marker definition */}
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280"/>
      </marker>
    </defs>
  </svg>
)

export const ResultsViewSVG = ({ className = "w-full h-64" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 800 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Results Dashboard */}
    <g>
      <rect x="20" y="20" width="760" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="740" height="20" rx="4" fill="#10B981" opacity="0.8"/>
      <text x="400" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Analysis Results</text>
      
      {/* Chart Gallery */}
      <rect x="30" y="60" width="180" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="120" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">Boxplot Charts</text>
      
      {/* Sample Chart */}
      <rect x="40" y="85" width="160" height="80" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <line x1="60" y1="100" x2="60" y2="140" stroke="#10B981" strokeWidth="2"/>
      <line x1="55" y1="100" x2="65" y2="100" stroke="#10B981" strokeWidth="2"/>
      <line x1="55" y1="140" x2="65" y2="140" stroke="#10B981" strokeWidth="2"/>
      <rect x="57" y="110" width="6" height="20" fill="#10B981" opacity="0.6"/>
      
      <line x1="100" y1="95" x2="100" y2="145" stroke="#10B981" strokeWidth="2"/>
      <line x1="95" y1="95" x2="105" y2="95" stroke="#10B981" strokeWidth="2"/>
      <line x1="95" y1="145" x2="105" y2="145" stroke="#10B981" strokeWidth="2"/>
      <rect x="97" y="105" width="6" height="30" fill="#10B981" opacity="0.6"/>
      
      <line x1="140" y1="105" x2="140" y2="135" stroke="#10B981" strokeWidth="2"/>
      <line x1="135" y1="105" x2="145" y2="105" stroke="#10B981" strokeWidth="2"/>
      <line x1="135" y1="135" x2="145" y2="135" stroke="#10B981" strokeWidth="2"/>
      <rect x="137" y="115" width="6" height="10" fill="#10B981" opacity="0.6"/>
      
      {/* File Downloads */}
      <rect x="230" y="60" width="180" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="320" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">Generated Files</text>
      
      <rect x="240" y="85" width="160" height="20" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="250" y="97" className="text-xs fill-gray-900">📄 data_processed.csv</text>
      
      <rect x="240" y="110" width="160" height="20" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="250" y="122" className="text-xs fill-gray-900">📜 analysis_script.jsl</text>
      
      <rect x="240" y="135" width="160" height="20" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="250" y="147" className="text-xs fill-gray-900">📊 statistical_report.pdf</text>
      
      <rect x="240" y="160" width="160" height="12" rx="2" fill="#3B82F6"/>
      <text x="320" y="168" textAnchor="middle" className="text-xs font-semibold fill-white">Download All</text>
      
      {/* Statistics */}
      <rect x="430" y="60" width="180" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">Statistics Summary</text>
      
      <rect x="440" y="85" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="95" className="text-xs fill-gray-900">Mean: 45.2</text>
      
      <rect x="440" y="105" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="115" className="text-xs fill-gray-900">Median: 43.8</text>
      
      <rect x="440" y="125" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="135" className="text-xs fill-gray-900">Std Dev: 8.7</text>
      
      <rect x="440" y="145" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="155" className="text-xs fill-gray-900">Sample Size: 150</text>
      
      {/* Actions */}
      <rect x="630" y="60" width="140" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="700" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">Actions</text>
      
      <rect x="640" y="85" width="120" height="20" rx="2" fill="#8B5CF6"/>
      <text x="700" y="97" textAnchor="middle" className="text-xs font-semibold fill-white">Share Results</text>
      
      <rect x="640" y="110" width="120" height="20" rx="2" fill="#10B981"/>
      <text x="700" y="122" textAnchor="middle" className="text-xs font-semibold fill-white">New Analysis</text>
      
      <rect x="640" y="135" width="120" height="20" rx="2" fill="#F59E0B"/>
      <text x="700" y="147" textAnchor="middle" className="text-xs font-semibold fill-white">Export Report</text>
      
      <rect x="640" y="160" width="120" height="12" rx="2" fill="#EF4444"/>
      <text x="700" y="168" textAnchor="middle" className="text-xs font-semibold fill-white">Delete Run</text>
    </g>
  </svg>
)

export const PluginWorkflowSVG_CN = ({ className = "w-full h-80" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 1000 320" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Step 1: Upload */}
    <g>
      <rect x="20" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="140" height="20" rx="4" fill="#3B82F6" opacity="0.8"/>
      <text x="100" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">1. 上传Excel</text>
      
      {/* Upload Area */}
      <rect x="30" y="60" width="140" height="80" rx="4" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 4"/>
      <path d="M100 80L100 120M100 80L80 100M100 80L120 100" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="100" y="140" textAnchor="middle" className="text-xs fill-gray-600">拖放Excel文件</text>
      
      {/* File Info */}
      <rect x="30" y="150" width="140" height="30" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="40" y="165" className="text-xs fill-gray-900">data.xlsx</text>
      <text x="40" y="175" className="text-xs fill-gray-500">2.5 MB • Excel格式</text>
      
      <rect x="30" y="190" width="140" height="12" rx="2" fill="#3B82F6"/>
      <text x="100" y="198" textAnchor="middle" className="text-xs font-semibold fill-white">分析文件</text>
    </g>
    
    {/* Arrow */}
    <path d="M200 120L220 120" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 2: Variable Selection */}
    <g>
      <rect x="240" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="250" y="30" width="140" height="20" rx="4" fill="#10B981" opacity="0.8"/>
      <text x="320" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">2. 选择变量</text>
      
      {/* Variable List */}
      <rect x="250" y="60" width="140" height="100" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="260" y="75" className="text-xs font-semibold fill-gray-900">分类变量:</text>
      
      <rect x="260" y="80" width="120" height="15" rx="2" fill="#10B981" opacity="0.1"/>
      <text x="270" y="90" className="text-xs fill-gray-900">✓ Stage</text>
      
      <rect x="260" y="100" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="270" y="110" className="text-xs fill-gray-600">Group</text>
      
      <rect x="260" y="120" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="270" y="130" className="text-xs fill-gray-600">Category</text>
      
      <rect x="260" y="140" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="270" y="150" className="text-xs fill-gray-600">Type</text>
      
      <rect x="250" y="170" width="140" height="12" rx="2" fill="#10B981"/>
      <text x="320" y="178" textAnchor="middle" className="text-xs font-semibold fill-white">继续</text>
    </g>
    
    {/* Arrow */}
    <path d="M420 120L440 120" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 3: Validation */}
    <g>
      <rect x="460" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="470" y="30" width="140" height="20" rx="4" fill="#F59E0B" opacity="0.8"/>
      <text x="540" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">3. 数据验证</text>
      
      {/* Validation Results */}
      <rect x="470" y="60" width="140" height="100" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      
      <rect x="480" y="70" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="490" y="80" className="text-xs fill-gray-900">✓ 结构检查</text>
      
      <rect x="480" y="90" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="490" y="100" className="text-xs fill-gray-900">✓ 元数据检查</text>
      
      <rect x="480" y="110" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="490" y="120" className="text-xs fill-gray-900">✓ 数据质量检查</text>
      
      <rect x="480" y="130" width="120" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="490" y="140" className="text-xs fill-gray-900">⚠ 发现小问题</text>
      
      <rect x="470" y="170" width="140" height="12" rx="2" fill="#F59E0B"/>
      <text x="540" y="178" textAnchor="middle" className="text-xs font-semibold fill-white">修复并继续</text>
    </g>
    
    {/* Arrow */}
    <path d="M640 120L660 120" stroke="#6B7280" strokeWidth="2" markerEnd="url(#arrowhead)"/>
    
    {/* Step 4: Processing */}
    <g>
      <rect x="680" y="20" width="160" height="200" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="690" y="30" width="140" height="20" rx="4" fill="#8B5CF6" opacity="0.8"/>
      <text x="760" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">4. 生成文件</text>
      
      {/* Processing Status */}
      <rect x="690" y="60" width="140" height="100" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      
      <rect x="700" y="70" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="710" y="80" className="text-xs fill-gray-900">✓ CSV已生成</text>
      
      <rect x="700" y="90" width="120" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="710" y="100" className="text-xs fill-gray-900">✓ JSL脚本已创建</text>
      
      <rect x="700" y="110" width="120" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="710" y="120" className="text-xs fill-gray-900">⚡ 运行分析中...</text>
      
      <rect x="700" y="130" width="120" height="15" rx="2" fill="#E2E8F0"/>
      <text x="710" y="140" className="text-xs fill-gray-600">⏳ 生成图表</text>
      
      <rect x="690" y="170" width="140" height="12" rx="2" fill="#8B5CF6"/>
      <text x="760" y="178" textAnchor="middle" className="text-xs font-semibold fill-white">查看结果</text>
    </g>
    
    {/* Arrow marker definition */}
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280"/>
      </marker>
    </defs>
  </svg>
)

export const ResultsViewSVG_CN = ({ className = "w-full h-64" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 800 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Results Dashboard */}
    <g>
      <rect x="20" y="20" width="760" height="216" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="740" height="20" rx="4" fill="#10B981" opacity="0.8"/>
      <text x="400" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">分析结果</text>
      
      {/* Chart Gallery */}
      <rect x="30" y="60" width="180" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="120" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">箱线图</text>
      
      {/* Sample Chart */}
      <rect x="40" y="85" width="160" height="80" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <line x1="60" y1="100" x2="60" y2="140" stroke="#10B981" strokeWidth="2"/>
      <line x1="55" y1="100" x2="65" y2="100" stroke="#10B981" strokeWidth="2"/>
      <line x1="55" y1="140" x2="65" y2="140" stroke="#10B981" strokeWidth="2"/>
      <rect x="57" y="110" width="6" height="20" fill="#10B981" opacity="0.6"/>
      
      <line x1="100" y1="95" x2="100" y2="145" stroke="#10B981" strokeWidth="2"/>
      <line x1="95" y1="95" x2="105" y2="95" stroke="#10B981" strokeWidth="2"/>
      <line x1="95" y1="145" x2="105" y2="145" stroke="#10B981" strokeWidth="2"/>
      <rect x="97" y="105" width="6" height="30" fill="#10B981" opacity="0.6"/>
      
      <line x1="140" y1="105" x2="140" y2="135" stroke="#10B981" strokeWidth="2"/>
      <line x1="135" y1="105" x2="145" y2="105" stroke="#10B981" strokeWidth="2"/>
      <line x1="135" y1="135" x2="145" y2="135" stroke="#10B981" strokeWidth="2"/>
      <rect x="137" y="115" width="6" height="10" fill="#10B981" opacity="0.6"/>
      
      {/* File Downloads */}
      <rect x="230" y="60" width="180" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="320" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">生成的文件</text>
      
      <rect x="240" y="85" width="160" height="20" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="250" y="97" className="text-xs fill-gray-900">📄 data_processed.csv</text>
      
      <rect x="240" y="110" width="160" height="20" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="250" y="122" className="text-xs fill-gray-900">📜 analysis_script.jsl</text>
      
      <rect x="240" y="135" width="160" height="20" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="250" y="147" className="text-xs fill-gray-900">📊 statistical_report.pdf</text>
      
      <rect x="240" y="160" width="160" height="12" rx="2" fill="#3B82F6"/>
      <text x="320" y="168" textAnchor="middle" className="text-xs font-semibold fill-white">下载全部</text>
      
      {/* Statistics */}
      <rect x="430" y="60" width="180" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="520" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">统计摘要</text>
      
      <rect x="440" y="85" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="95" className="text-xs fill-gray-900">均值: 45.2</text>
      
      <rect x="440" y="105" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="115" className="text-xs fill-gray-900">中位数: 43.8</text>
      
      <rect x="440" y="125" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="135" className="text-xs fill-gray-900">标准差: 8.7</text>
      
      <rect x="440" y="145" width="160" height="15" rx="2" fill="#F0FDF4"/>
      <text x="450" y="155" className="text-xs fill-gray-900">样本量: 150</text>
      
      {/* Actions */}
      <rect x="630" y="60" width="140" height="120" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="700" y="75" textAnchor="middle" className="text-xs font-semibold fill-gray-900">操作</text>
      
      <rect x="640" y="85" width="120" height="20" rx="2" fill="#8B5CF6"/>
      <text x="700" y="97" textAnchor="middle" className="text-xs font-semibold fill-white">分享结果</text>
      
      <rect x="640" y="110" width="120" height="20" rx="2" fill="#10B981"/>
      <text x="700" y="122" textAnchor="middle" className="text-xs font-semibold fill-white">新分析</text>
      
      <rect x="640" y="135" width="120" height="20" rx="2" fill="#F59E0B"/>
      <text x="700" y="147" textAnchor="middle" className="text-xs font-semibold fill-white">导出报告</text>
      
      <rect x="640" y="160" width="120" height="12" rx="2" fill="#EF4444"/>
      <text x="700" y="168" textAnchor="middle" className="text-xs font-semibold fill-white">删除运行</text>
    </g>
  </svg>
)

export const PluginComparisonSVG = ({ className = "w-full h-96" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 1000 384" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Excel2Boxplot V1 */}
    <g>
      <rect x="20" y="20" width="300" height="344" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="280" height="20" rx="4" fill="#3B82F6" opacity="0.8"/>
      <text x="170" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Excel2Boxplot V1</text>
      
      {/* Features */}
      <rect x="30" y="60" width="280" height="200" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="40" y="75" className="text-xs font-semibold fill-gray-900">Key Features:</text>
      
      <rect x="40" y="85" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="95" className="text-xs fill-gray-900">✓ Three-checkpoint validation system</text>
      
      <rect x="40" y="105" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="115" className="text-xs fill-gray-900">✓ Automatic file fixing for corrupted Excel</text>
      
      <rect x="40" y="125" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="135" className="text-xs fill-gray-900">✓ Boundary calculation (min, max, inc, tick)</text>
      
      <rect x="40" y="145" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="155" className="text-xs fill-gray-900">✓ CSV and JSL generation</text>
      
      <rect x="40" y="165" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="175" className="text-xs fill-gray-900">✓ Boxplot visualization</text>
      
      <rect x="40" y="185" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="195" className="text-xs fill-gray-900">✓ Real-time processing</text>
      
      <rect x="40" y="205" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="215" className="text-xs fill-gray-900">✓ Error handling and recovery</text>
      
      <rect x="40" y="225" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="235" className="text-xs fill-gray-900">✓ Multi-language support</text>
      
      {/* Use Case */}
      <rect x="30" y="270" width="280" height="60" rx="4" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="40" y="285" className="text-xs font-semibold fill-gray-900">Best For:</text>
      <text x="40" y="300" className="text-xs fill-gray-600">• Standard Excel data analysis</text>
      <text x="40" y="315" className="text-xs fill-gray-600">• Quality control and monitoring</text>
      <text x="40" y="330" className="text-xs fill-gray-600">• Statistical process control</text>
      
      <rect x="30" y="340" width="280" height="12" rx="2" fill="#3B82F6"/>
      <text x="170" y="348" textAnchor="middle" className="text-xs font-semibold fill-white">Use V1 Plugin</text>
    </g>
    
    {/* Excel2Boxplot V2 */}
    <g>
      <rect x="340" y="20" width="300" height="344" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="350" y="30" width="280" height="20" rx="4" fill="#F59E0B" opacity="0.8"/>
      <text x="490" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Excel2Boxplot V2</text>
      
      {/* Features */}
      <rect x="350" y="60" width="280" height="200" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="360" y="75" className="text-xs font-semibold fill-gray-900">Key Features:</text>
      
      <rect x="360" y="85" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="95" className="text-xs fill-gray-900">✓ V2 meta column mapping</text>
      
      <rect x="360" y="105" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="115" className="text-xs fill-gray-900">✓ Y Variable/DETAIL/Target/USL/LSL/Label</text>
      
      <rect x="360" y="125" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="135" className="text-xs fill-gray-900">✓ Prefers Stage as categorical variable</text>
      
      <rect x="360" y="145" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="155" className="text-xs fill-gray-900">✓ Three-checkpoint validation (informational)</text>
      
      <rect x="360" y="165" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="175" className="text-xs fill-gray-900">✓ Boundary calculation (min, max, inc, tick)</text>
      
      <rect x="360" y="185" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="195" className="text-xs fill-gray-900">✓ CSV and JSL generation</text>
      
      <rect x="360" y="205" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="215" className="text-xs fill-gray-900">✓ Enhanced column detection</text>
      
      <rect x="360" y="225" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="235" className="text-xs fill-gray-900">✓ Improved data validation</text>
      
      {/* Use Case */}
      <rect x="350" y="270" width="280" height="60" rx="4" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="360" y="285" className="text-xs font-semibold fill-gray-900">Best For:</text>
      <text x="360" y="300" className="text-xs fill-gray-600">• Advanced Excel data with metadata</text>
      <text x="360" y="315" className="text-xs fill-gray-600">• Manufacturing and quality control</text>
      <text x="360" y="330" className="text-xs fill-gray-600">• Process capability analysis</text>
      
      <rect x="350" y="340" width="280" height="12" rx="2" fill="#F59E0B"/>
      <text x="490" y="348" textAnchor="middle" className="text-xs font-semibold fill-white">Use V2 Plugin</text>
    </g>
    
    {/* Process Capability */}
    <g>
      <rect x="660" y="20" width="300" height="344" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="670" y="30" width="280" height="20" rx="4" fill="#8B5CF6" opacity="0.8"/>
      <text x="810" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Process Capability</text>
      
      {/* Features */}
      <rect x="670" y="60" width="280" height="200" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="680" y="75" className="text-xs font-semibold fill-gray-900">Key Features:</text>
      
      <rect x="680" y="85" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="95" className="text-xs fill-gray-900">✓ Process capability analysis</text>
      
      <rect x="680" y="105" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="115" className="text-xs fill-gray-900">✓ Statistical process control</text>
      
      <rect x="680" y="125" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="135" className="text-xs fill-gray-900">✓ Capability indices calculation</text>
      
      <rect x="680" y="145" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="155" className="text-xs fill-gray-900">✓ Cp, Cpk, Pp, Ppk analysis</text>
      
      <rect x="680" y="165" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="175" className="text-xs fill-gray-900">✓ Control charts generation</text>
      
      <rect x="680" y="185" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="195" className="text-xs fill-gray-900">✓ Specification limit analysis</text>
      
      <rect x="680" y="205" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="215" className="text-xs fill-gray-900">✓ Process performance metrics</text>
      
      <rect x="680" y="225" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="235" className="text-xs fill-gray-900">✓ Quality improvement insights</text>
      
      {/* Use Case */}
      <rect x="670" y="270" width="280" height="60" rx="4" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="680" y="285" className="text-xs font-semibold fill-gray-900">Best For:</text>
      <text x="680" y="300" className="text-xs fill-gray-600">• Manufacturing quality control</text>
      <text x="680" y="315" className="text-xs fill-gray-600">• Process improvement projects</text>
      <text x="680" y="330" className="text-xs fill-gray-600">• Six Sigma methodologies</text>
      
      <rect x="670" y="340" width="280" height="12" rx="2" fill="#8B5CF6"/>
      <text x="810" y="348" textAnchor="middle" className="text-xs font-semibold fill-white">Use Process Capability</text>
    </g>
  </svg>
)

export const PluginComparisonSVG_CN = ({ className = "w-full h-96" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 1000 384" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Excel2Boxplot V1 */}
    <g>
      <rect x="20" y="20" width="300" height="344" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="30" y="30" width="280" height="20" rx="4" fill="#3B82F6" opacity="0.8"/>
      <text x="170" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Excel转箱线图 V1</text>
      
      {/* Features */}
      <rect x="30" y="60" width="280" height="200" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="40" y="75" className="text-xs font-semibold fill-gray-900">主要功能:</text>
      
      <rect x="40" y="85" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="95" className="text-xs fill-gray-900">✓ 三点验证系统</text>
      
      <rect x="40" y="105" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="115" className="text-xs fill-gray-900">✓ 自动修复损坏的Excel文件</text>
      
      <rect x="40" y="125" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="135" className="text-xs fill-gray-900">✓ 边界计算（最小值、最大值、步长、刻度）</text>
      
      <rect x="40" y="145" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="155" className="text-xs fill-gray-900">✓ CSV和JSL生成</text>
      
      <rect x="40" y="165" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="175" className="text-xs fill-gray-900">✓ 箱线图可视化</text>
      
      <rect x="40" y="185" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="195" className="text-xs fill-gray-900">✓ 实时处理</text>
      
      <rect x="40" y="205" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="215" className="text-xs fill-gray-900">✓ 错误处理和恢复</text>
      
      <rect x="40" y="225" width="260" height="15" rx="2" fill="#F0FDF4" stroke="#10B981" strokeWidth="1"/>
      <text x="50" y="235" className="text-xs fill-gray-900">✓ 多语言支持</text>
      
      {/* Use Case */}
      <rect x="30" y="270" width="280" height="60" rx="4" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1"/>
      <text x="40" y="285" className="text-xs font-semibold fill-gray-900">最适合:</text>
      <text x="40" y="300" className="text-xs fill-gray-600">• 标准Excel数据分析</text>
      <text x="40" y="315" className="text-xs fill-gray-600">• 质量控制和监控</text>
      <text x="40" y="330" className="text-xs fill-gray-600">• 统计过程控制</text>
      
      <rect x="30" y="340" width="280" height="12" rx="2" fill="#3B82F6"/>
      <text x="170" y="348" textAnchor="middle" className="text-xs font-semibold fill-white">使用V1插件</text>
    </g>
    
    {/* Excel2Boxplot V2 */}
    <g>
      <rect x="340" y="20" width="300" height="344" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="350" y="30" width="280" height="20" rx="4" fill="#F59E0B" opacity="0.8"/>
      <text x="490" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">Excel转箱线图 V2</text>
      
      {/* Features */}
      <rect x="350" y="60" width="280" height="200" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="360" y="75" className="text-xs font-semibold fill-gray-900">主要功能:</text>
      
      <rect x="360" y="85" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="95" className="text-xs fill-gray-900">✓ V2元列映射</text>
      
      <rect x="360" y="105" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="115" className="text-xs fill-gray-900">✓ Y变量/DETAIL/目标/USL/LSL/标签</text>
      
      <rect x="360" y="125" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="135" className="text-xs fill-gray-900">✓ 优先使用Stage作为分类变量</text>
      
      <rect x="360" y="145" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="155" className="text-xs fill-gray-900">✓ 三点验证（信息性）</text>
      
      <rect x="360" y="165" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="175" className="text-xs fill-gray-900">✓ 边界计算（最小值、最大值、步长、刻度）</text>
      
      <rect x="360" y="185" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="195" className="text-xs fill-gray-900">✓ CSV和JSL生成</text>
      
      <rect x="360" y="205" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="215" className="text-xs fill-gray-900">✓ 增强的列检测</text>
      
      <rect x="360" y="225" width="260" height="15" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="370" y="235" className="text-xs fill-gray-900">✓ 改进的数据验证</text>
      
      {/* Use Case */}
      <rect x="350" y="270" width="280" height="60" rx="4" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="360" y="285" className="text-xs font-semibold fill-gray-900">最适合:</text>
      <text x="360" y="300" className="text-xs fill-gray-600">• 带元数据的高级Excel数据</text>
      <text x="360" y="315" className="text-xs fill-gray-600">• 制造和质量控制</text>
      <text x="360" y="330" className="text-xs fill-gray-600">• 过程能力分析</text>
      
      <rect x="350" y="340" width="280" height="12" rx="2" fill="#F59E0B"/>
      <text x="490" y="348" textAnchor="middle" className="text-xs font-semibold fill-white">使用V2插件</text>
    </g>
    
    {/* Process Capability */}
    <g>
      <rect x="660" y="20" width="300" height="344" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="670" y="30" width="280" height="20" rx="4" fill="#8B5CF6" opacity="0.8"/>
      <text x="810" y="43" textAnchor="middle" className="text-sm font-semibold fill-white">过程能力分析</text>
      
      {/* Features */}
      <rect x="670" y="60" width="280" height="200" rx="4" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
      <text x="680" y="75" className="text-xs font-semibold fill-gray-900">主要功能:</text>
      
      <rect x="680" y="85" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="95" className="text-xs fill-gray-900">✓ 过程能力分析</text>
      
      <rect x="680" y="105" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="115" className="text-xs fill-gray-900">✓ 统计过程控制</text>
      
      <rect x="680" y="125" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="135" className="text-xs fill-gray-900">✓ 能力指数计算</text>
      
      <rect x="680" y="145" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="155" className="text-xs fill-gray-900">✓ Cp、Cpk、Pp、Ppk分析</text>
      
      <rect x="680" y="165" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="175" className="text-xs fill-gray-900">✓ 控制图生成</text>
      
      <rect x="680" y="185" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="195" className="text-xs fill-gray-900">✓ 规格限分析</text>
      
      <rect x="680" y="205" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="215" className="text-xs fill-gray-900">✓ 过程性能指标</text>
      
      <rect x="680" y="225" width="260" height="15" rx="2" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="690" y="235" className="text-xs fill-gray-900">✓ 质量改进洞察</text>
      
      {/* Use Case */}
      <rect x="670" y="270" width="280" height="60" rx="4" fill="#FDF4FF" stroke="#8B5CF6" strokeWidth="1"/>
      <text x="680" y="285" className="text-xs font-semibold fill-gray-900">最适合:</text>
      <text x="680" y="300" className="text-xs fill-gray-600">• 制造质量控制</text>
      <text x="680" y="315" className="text-xs fill-gray-600">• 过程改进项目</text>
      <text x="680" y="330" className="text-xs fill-gray-600">• 六西格玛方法</text>
      
      <rect x="670" y="340" width="280" height="12" rx="2" fill="#8B5CF6"/>
      <text x="810" y="348" textAnchor="middle" className="text-xs font-semibold fill-white">使用过程能力分析</text>
    </g>
  </svg>
)
