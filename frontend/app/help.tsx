'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { HelpCircle, BookOpen, FileText, BarChart3, Upload, Users, Share2, Settings, ChevronRight, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import { LoginFlowSVG, PluginWorkflowSVG, ResultsViewSVG, PluginComparisonSVG, LoginFlowSVG_CN, PluginWorkflowSVG_CN, ResultsViewSVG_CN, PluginComparisonSVG_CN } from '@/components/svg/HelpIllustrations'

export default function HelpPage() {
  const { t, language } = useLanguage()
  const [activeSection, setActiveSection] = useState('overview')

  const helpContent = {
    en: {
      title: 'Help Center',
      subtitle: 'Learn how to use the Data Analysis Platform effectively',
      sections: {
        overview: {
          title: 'Platform Overview',
          content: `The Data Analysis Platform is a powerful tool for processing Excel data and generating statistical visualizations using JMP. Our platform supports multiple analysis plugins and provides real-time processing capabilities.

## Key Features
- **Easy Upload**: Drag and drop Excel files for instant analysis
- **Real-time Processing**: Watch your analysis progress with live updates
- **Multiple Plugins**: Choose from various analysis tools
- **Public Sharing**: Share results with team members or create public links
- **Multi-language Support**: Available in English and Chinese`
        },
        gettingStarted: {
          title: 'Getting Started',
          content: `## Creating Your First Project

1. **Login or Register**: Create an account or continue as a guest
2. **Choose a Plugin**: Select from available analysis plugins
3. **Create Project**: Set up your project with a name and description
4. **Upload Data**: Upload your Excel file for analysis
5. **Configure Analysis**: Select variables and configure settings
6. **Run Analysis**: Start the analysis and monitor progress

## Supported File Formats
- Excel files (.xlsx, .xls)
- CSV files (.csv)
- JSL scripts (.jsl)`
        },
        plugins: {
          title: 'Available Plugins',
          content: `## Excel to Boxplot V1 📊
Converts Excel files to CSV and JSL scripts with a three-checkpoint validation system for statistical analysis and visualization.

### Excel File Requirements:
Your Excel file must contain **two sheets**:

**1. Meta Sheet** (required columns):
- test_name: Name of the test/measurement (e.g., "FAI1", "FAI2")
- description: Description of the test
- target: Target value for the measurement
- usl: Upper specification limit
- lsl: Lower specification limit  
- main_level: Main level for grouping analysis

**2. Data Sheet** (required structure):
- FAI Columns: Columns containing "FAI" in their name (e.g., FAI1, FAI2, FAI3)
- Categorical Variables: Non-numeric columns for grouping (e.g., Stage, Build, Location)
- Data Format: FAI columns should contain numeric measurement data

### How to Use:
1. Upload your Excel file with meta and data sheets
2. Select a categorical variable for grouping (e.g., "Stage")
3. System validates structure, metadata, and data quality
4. Generates CSV file and JSL script for JMP analysis
5. Creates boxplot visualizations with boundary calculations

### Features:
- Three-checkpoint validation system
- Automatic file fixing for corrupted Excel files
- Boundary calculation (min, max, inc, tick)
- CSV and JSL generation
- Boxplot visualization

---

## Excel to Boxplot V2 📊
Excel to CSV/JSL conversion with V2 column mapping and enhanced categorical variable handling.

### Excel File Requirements:
Your Excel file must contain **two sheets**:

**1. Meta Sheet** (V2 column names):
- Y Variable: Name of the test/measurement (maps to test_name)
- DETAIL: Description of the test (maps to description)
- Target: Target value for the measurement
- USL: Upper specification limit
- LSL: Lower specification limit
- Label: Main level for grouping analysis (maps to main_level)

**2. Data Sheet** (required structure):
- FAI Columns: Columns containing "FAI" in their name (e.g., FAI1, FAI2, FAI3)
- Stage Column: Preferred categorical variable named "Stage"
- Other Categorical Variables: Additional grouping variables
- Data Format: FAI columns should contain numeric measurement data

### How to Use:
1. Upload your Excel file with meta and data sheets
2. System automatically maps V2 column names to internal format
3. Select categorical variable (preferably "Stage")
4. System validates structure and data quality
5. Generates CSV file and JSL script for JMP analysis
6. Creates enhanced boxplot visualizations

### Features:
- V2 meta column mapping (Y Variable/DETAIL/Target/USL/LSL/Label)
- Prefers Stage as categorical variable
- Three-checkpoint validation (informational)
- Boundary calculation (min, max, inc, tick)
- CSV and JSL generation

---

## Excel to Process Capability 📈
Converts Excel data to process capability analysis with statistical process control features.

### Excel File Requirements:
Your Excel file should contain:

**Required Columns:**
- value: Numeric measurement data
- spec_lower: Lower specification limit
- spec_upper: Upper specification limit
- subgroup: Subgroup identifier (for control charts)

**Data Format:**
- All measurement data must be numeric
- Specification limits must be provided
- Lower limit must be less than upper limit
- Sufficient data points for meaningful analysis

### How to Use:
1. Upload your Excel file with measurement data
2. Ensure specification limits are provided
3. Select analysis type (Cp, Cpk, Pp, Ppk)
4. Configure control chart parameters
5. Generate process capability analysis
6. View capability indices and control charts

### Features:
- Process capability analysis
- Statistical process control
- Capability indices calculation (Cp, Cpk, Pp, Ppk)
- Control charts generation
- Six sigma analysis

---

## Excel to CPK V1 📈
Convert Excel files to CSV and JSL scripts for Process Capability (CPK) analysis with comprehensive validation.

### Excel File Requirements:
Your Excel file must contain **two sheets**:

**1. Spec/Meta Sheet** (either format):
- Spec format: test_name, usl, lsl, target
- Meta format: Y Variable, USL, LSL, Target

**2. Data Sheet** (required structure):
- FAI Columns: Columns containing "FAI" in their name (e.g., FAI1, FAI2, FAI3)
- Data Format: FAI columns should contain numeric measurement data
- Test Names: Must match between spec sheet and FAI column names

### How to Use:
1. Upload your Excel file with spec/meta and data sheets
2. System validates Excel structure (Checkpoint 1)
3. System validates spec data consistency (Checkpoint 2)
4. System validates data matching between sheets (Checkpoint 3)
5. Generates CSV file and JSL script for CPK analysis
6. Creates process capability reports and visualizations

### Features:
- Three-checkpoint validation system
- Automatic column mapping (spec ↔ meta formats)
- CPK analysis with capability indices
- JSL script generation for JMP
- Comprehensive error reporting and file fixing`
        },
        troubleshooting: {
          title: 'Troubleshooting',
          content: `## Common Issues

### File Upload Problems
- **Issue**: File upload fails
- **Solution**: Check file format and size. Ensure file is not corrupted.

### Analysis Errors
- **Issue**: Analysis fails to start
- **Solution**: Verify Excel file structure and data quality. Check for missing values.

### Performance Issues
- **Issue**: Slow processing
- **Solution**: Large files may take longer. Check your internet connection.

## Error Messages
- **"Invalid file format"**: Ensure your file is a valid Excel or CSV file
- **"Analysis failed"**: Check your data structure and try again
- **"Authentication failed"**: Refresh the page and login again`
        },
        support: {
          title: 'Support & Contact',
          content: `## Getting Help

If you need additional assistance:

1. **Check Documentation**: Review this help center thoroughly
2. **Try Different Approaches**: Experiment with different file formats or settings
3. **Contact Support**: Reach out to our support team

## Best Practices

### Data Preparation
- Ensure your Excel files have clear headers
- Remove empty rows and columns
- Use consistent data formats
- Include categorical variables for grouping

### Project Management
- Use descriptive project names
- Add detailed descriptions
- Organize projects by analysis type
- Make public projects for sharing

### Performance Tips
- Use smaller files for faster processing
- Close unnecessary browser tabs
- Ensure stable internet connection`
        }
      }
    },
    zh: {
      title: '帮助中心',
      subtitle: '学习如何有效使用数据分析平台',
      sections: {
        overview: {
          title: '平台概述',
          content: `数据分析平台是一个强大的工具，用于处理Excel数据并使用JMP生成统计可视化。我们的平台支持多种分析插件并提供实时处理功能。

## 主要功能
- **轻松上传**：拖放Excel文件进行即时分析
- **实时处理**：通过实时更新观看您的分析进度
- **多种插件**：从各种分析工具中选择
- **公开分享**：与团队成员分享结果或创建公开链接
- **多语言支持**：提供英文和中文版本`
        },
        gettingStarted: {
          title: '入门指南',
          content: `## 创建您的第一个项目

1. **登录或注册**：创建账户或继续作为游客
2. **选择插件**：从可用的分析插件中选择
3. **创建项目**：设置您的项目名称和描述
4. **上传数据**：上传您的Excel文件进行分析
5. **配置分析**：选择变量并配置设置
6. **运行分析**：开始分析并监控进度

## 支持的文件格式
- Excel文件（.xlsx, .xls）
- CSV文件（.csv）
- JSL脚本（.jsl）`
        },
        plugins: {
          title: '可用插件',
          content: `## Excel转箱线图 V1 📊
将Excel文件转换为CSV和JSL脚本，具有三点验证系统，用于统计分析和可视化。

### Excel文件要求：
您的Excel文件必须包含**两个工作表**：

**1. 元数据表**（必需列）：
- test_name：测试/测量名称（例如："FAI1", "FAI2"）
- description：测试描述
- target：测量目标值
- usl：上规格限
- lsl：下规格限
- main_level：分组分析的主要级别

**2. 数据表**（必需结构）：
- FAI列：列名包含"FAI"的列（例如：FAI1, FAI2, FAI3）
- 分类变量：用于分组的非数值列（例如：Stage, Build, Location）
- 数据格式：FAI列应包含数值测量数据

### 使用方法：
1. 上传包含元数据和数据表的Excel文件
2. 选择用于分组的分类变量（例如："Stage"）
3. 系统验证结构、元数据和数据质量
4. 生成用于JMP分析的CSV文件和JSL脚本
5. 创建带有边界计算的箱线图可视化

### 功能特性：
- 三点验证系统
- 自动修复损坏的Excel文件
- 边界计算（最小值、最大值、步长、刻度）
- CSV和JSL生成
- 箱线图可视化

---

## Excel转箱线图 V2 📊
Excel转CSV/JSL，使用V2列映射和增强的分类变量处理。

### Excel文件要求：
您的Excel文件必须包含**两个工作表**：

**1. 元数据表**（V2列名）：
- Y Variable：测试/测量名称（映射到test_name）
- DETAIL：测试描述（映射到description）
- Target：测量目标值
- USL：上规格限
- LSL：下规格限
- Label：分组分析的主要级别（映射到main_level）

**2. 数据表**（必需结构）：
- FAI列：列名包含"FAI"的列（例如：FAI1, FAI2, FAI3）
- Stage列：首选的分类变量，名为"Stage"
- 其他分类变量：额外的分组变量
- 数据格式：FAI列应包含数值测量数据

### 使用方法：
1. 上传包含元数据和数据表的Excel文件
2. 系统自动将V2列名映射到内部格式
3. 选择分类变量（首选"Stage"）
4. 系统验证结构和数据质量
5. 生成用于JMP分析的CSV文件和JSL脚本
6. 创建增强的箱线图可视化

### 功能特性：
- V2元列映射（Y变量/DETAIL/目标/USL/LSL/标签）
- 优先使用Stage作为分类变量
- 三点验证（信息性）
- 边界计算（最小值、最大值、步长、刻度）
- CSV和JSL生成

---

## Excel转过程能力分析 📈
将Excel数据转换为过程能力分析，具有统计过程控制功能。

### Excel文件要求：
您的Excel文件应包含：

**必需列：**
- value：数值测量数据
- spec_lower：下规格限
- spec_upper：上规格限
- subgroup：子组标识符（用于控制图）

**数据格式：**
- 所有测量数据必须是数值型
- 必须提供规格限
- 下限必须小于上限
- 有足够的数据点进行有意义的分析

### 使用方法：
1. 上传包含测量数据的Excel文件
2. 确保提供规格限
3. 选择分析类型（Cp, Cpk, Pp, Ppk）
4. 配置控制图参数
5. 生成过程能力分析
6. 查看能力指数和控制图

### 功能特性：
- 过程能力分析
- 统计过程控制
- 能力指数计算（Cp、Cpk、Pp、Ppk）
- 控制图生成
- 六西格玛分析

---

## Excel转CPK V1 📈
将Excel文件转换为CSV和JSL脚本，用于过程能力（CPK）分析，具有全面验证。

### Excel文件要求：
您的Excel文件必须包含**两个工作表**：

**1. 规格/元数据表**（任一格式）：
- 规格格式：test_name, usl, lsl, target
- 元数据格式：Y Variable, USL, LSL, Target

**2. 数据表**（必需结构）：
- FAI列：列名包含"FAI"的列（例如：FAI1, FAI2, FAI3）
- 数据格式：FAI列应包含数值测量数据
- 测试名称：规格表和数据表中的测试名称必须匹配

### 使用方法：
1. 上传包含规格/元数据表和数据表的Excel文件
2. 系统验证Excel结构（检查点1）
3. 系统验证规格数据一致性（检查点2）
4. 系统验证工作表之间的数据匹配（检查点3）
5. 生成用于CPK分析的CSV文件和JSL脚本
6. 创建过程能力报告和可视化

### 功能特性：
- 三点验证系统
- 自动列映射（规格 ↔ 元数据格式）
- 带能力指数的CPK分析
- 用于JMP的JSL脚本生成
- 全面的错误报告和文件修复`
        },
        troubleshooting: {
          title: '故障排除',
          content: `## 常见问题

### 文件上传问题
- **问题**：文件上传失败
- **解决方案**：检查文件格式和大小。确保文件未损坏。

### 分析错误
- **问题**：分析无法启动
- **解决方案**：验证Excel文件结构和数据质量。检查缺失值。

### 性能问题
- **问题**：处理缓慢
- **解决方案**：大文件可能需要更长时间。检查您的网络连接。

## 错误消息
- **"无效文件格式"**：确保您的文件是有效的Excel或CSV文件
- **"分析失败"**：检查您的数据结构并重试
- **"身份验证失败"**：刷新页面并重新登录`
        },
        support: {
          title: '支持与联系',
          content: `## 获取帮助

如果您需要额外帮助：

1. **查看文档**：仔细阅读此帮助中心
2. **尝试不同方法**：尝试不同的文件格式或设置
3. **联系支持**：联系我们的支持团队

## 最佳实践

### 数据准备
- 确保您的Excel文件有清晰的标题
- 删除空行和空列
- 使用一致的数据格式
- 包含用于分组的分类变量

### 项目管理
- 使用描述性的项目名称
- 添加详细描述
- 按分析类型组织项目
- 创建公开项目以便分享

### 性能提示
- 使用较小的文件以获得更快的处理速度
- 关闭不必要的浏览器标签
- 确保稳定的网络连接`
        }
      }
    }
  }

  const currentContent = helpContent[language]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <HelpCircle className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('help.center')}</h1>
                <p className="text-gray-600">{currentContent.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <LanguageSelector />
              <Button variant="outline" onClick={() => window.history.back()}>
                {t('help.back')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('help.navigation')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(currentContent.sections).map(([key, section]) => (
                  <Button
                    key={key}
                    variant={activeSection === key ? "default" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setActiveSection(key)}
                  >
                    <ChevronRight className="h-4 w-4 mr-2" />
                    {section.title}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">
                  {currentContent.sections[activeSection as keyof typeof currentContent.sections].title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-gray max-w-none">
                  {currentContent.sections[activeSection as keyof typeof currentContent.sections].content.split('\n').map((line, index) => {
                    if (line.startsWith('## ')) {
                      return <h2 key={index} className="text-xl font-semibold mt-6 mb-3 text-gray-900">{line.substring(3)}</h2>
                    } else if (line.startsWith('### ')) {
                      return <h3 key={index} className="text-lg font-medium mt-4 mb-2 text-gray-800">{line.substring(4)}</h3>
                    } else if (line.startsWith('- **')) {
                      const parts = line.match(/- \*\*(.*?)\*\*: (.*)/)
                      if (parts) {
                        return (
                          <div key={index} className="mb-2">
                            <strong className="text-gray-900">{parts[1]}</strong>: {parts[2]}
                          </div>
                        )
                      }
                    } else if (line.startsWith('- ')) {
                      return <li key={index} className="mb-1">{line.substring(2)}</li>
                    } else if (line.trim() === '') {
                      return <br key={index} />
                    } else {
                      return <p key={index} className="mb-3 text-gray-700">{line}</p>
                    }
                  })}
                  
                  {/* Add SVG illustrations based on active section */}
                  {activeSection === 'gettingStarted' && (
                    <div className="mt-8 space-y-8">
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {language === 'zh' ? '应用流程' : 'Application Flow'}
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          {language === 'zh' ? (
                            <LoginFlowSVG_CN className="w-full h-64" />
                          ) : (
                            <LoginFlowSVG className="w-full h-64" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {language === 'zh' 
                            ? '此图表显示了从登录到插件选择的完整用户旅程。'
                            : 'This diagram shows the complete user journey from login to plugin selection.'
                          }
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {activeSection === 'plugins' && (
                    <div className="mt-8 space-y-8">
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {language === 'zh' ? '插件对比图表' : 'Plugin Comparison Chart'}
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <img 
                            src={language === 'zh' ? "/svg/PluginComparisonChart_CN.svg" : "/svg/PluginComparisonChart.svg"} 
                            alt={language === 'zh' ? '插件对比图表' : 'Plugin Comparison Chart'} 
                            className="w-full h-auto" 
                          />
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {language === 'zh' 
                            ? '比较每个可用插件的功能、Excel要求和最佳使用场景。'
                            : 'Compare features, Excel requirements, and best use cases for each available plugin.'
                          }
                        </p>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {language === 'zh' ? 'Excel转箱线图 V1 工作流程' : 'Excel to Boxplot V1 Workflow'}
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <img 
                            src={language === 'zh' ? "/svg/Excel2BoxplotV1Workflow_CN.svg" : "/svg/Excel2BoxplotV1Workflow.svg"} 
                            alt={language === 'zh' ? 'Excel转箱线图 V1 工作流程' : 'Excel to Boxplot V1 Workflow'} 
                            className="w-full h-auto" 
                          />
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {language === 'zh' 
                            ? '显示Excel转箱线图V1插件的完整工作流程和Excel文件结构要求。'
                            : 'Shows the complete workflow and Excel file structure requirements for Excel to Boxplot V1 plugin.'
                          }
                        </p>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {language === 'zh' ? 'Excel转箱线图 V2 工作流程' : 'Excel to Boxplot V2 Workflow'}
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <img 
                            src={language === 'zh' ? "/svg/Excel2BoxplotV2Workflow_CN.svg" : "/svg/Excel2BoxplotV2Workflow.svg"} 
                            alt={language === 'zh' ? 'Excel转箱线图 V2 工作流程' : 'Excel to Boxplot V2 Workflow'} 
                            className="w-full h-auto" 
                          />
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {language === 'zh' 
                            ? '显示Excel转箱线图V2插件的增强工作流程和V2列映射功能。'
                            : 'Shows the enhanced workflow and V2 column mapping features for Excel to Boxplot V2 plugin.'
                          }
                        </p>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {language === 'zh' ? 'Excel转过程能力分析工作流程' : 'Excel to Process Capability Workflow'}
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <img 
                            src={language === 'zh' ? "/svg/Excel2ProcessCapabilityWorkflow_CN.svg" : "/svg/Excel2ProcessCapabilityWorkflow.svg"} 
                            alt={language === 'zh' ? 'Excel转过程能力分析工作流程' : 'Excel to Process Capability Workflow'} 
                            className="w-full h-auto" 
                          />
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {language === 'zh' 
                            ? '显示过程能力分析插件的统计过程控制工作流程。'
                            : 'Shows the statistical process control workflow for the Process Capability plugin.'
                          }
                        </p>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {language === 'zh' ? 'Excel转CPK V1 工作流程' : 'Excel to CPK V1 Workflow'}
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <img 
                            src={language === 'zh' ? "/svg/Excel2CPKV1Workflow_CN.svg" : "/svg/Excel2CPKV1Workflow.svg"} 
                            alt={language === 'zh' ? 'Excel转CPK V1 工作流程' : 'Excel to CPK V1 Workflow'} 
                            className="w-full h-auto" 
                          />
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {language === 'zh' 
                            ? '显示CPK V1插件的三点验证系统和双格式支持工作流程。'
                            : 'Shows the three-checkpoint validation system and dual format support workflow for CPK V1 plugin.'
                          }
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {activeSection === 'troubleshooting' && (
                    <div className="mt-8 space-y-8">
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {language === 'zh' ? '结果视图' : 'Results View'}
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          {language === 'zh' ? (
                            <ResultsViewSVG_CN className="w-full h-64" />
                          ) : (
                            <ResultsViewSVG className="w-full h-64" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {language === 'zh' 
                            ? '了解结果仪表板和可用操作。'
                            : 'Understanding the results dashboard and available actions.'
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
