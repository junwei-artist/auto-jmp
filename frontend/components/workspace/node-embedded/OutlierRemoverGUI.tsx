'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FileSpreadsheet, Upload, Play, Plus, X, Download, FolderOpen, Save, Search, FileText, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import { Progress } from '@/components/ui/progress'

interface OutlierRemoverGUIProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
  isStandalone?: boolean  // Whether this is in standalone mode (modules page) vs editor mode
  onCreateNewWorkflow?: (file?: File) => void
}

export default function OutlierRemoverGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false,
  onCreateNewWorkflow
}: OutlierRemoverGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastValidatedFileRef = useRef<string | null>(null) // Track last validated file to avoid duplicate validations
  const justUpdatedRulesRef = useRef<boolean>(false) // Track if we just updated rules to prevent config from overwriting
  
  // Load config from file on mount
  const { data: loadedConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['node-config', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{ config: any }>(`/v1/workflows/${workflowId}/nodes/${node.id}/config`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 0 // Always refetch to get latest config
  })

  // Use loaded config or fallback to node.config
  const effectiveConfig = loadedConfig?.config || node.config || {}
  
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(effectiveConfig.file_key || null)
  const [filename, setFilename] = useState<string>(effectiveConfig.filename || '')
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>(effectiveConfig.selected_columns || {})
  const [outlierRules, setOutlierRules] = useState<Array<{
    sheet?: string
    column?: string
    condition: string
    value: string
    action?: 'clear_cell' | 'remove_row'  // Action to take: clear cell or remove entire row
  }>>(effectiveConfig.outlier_rules || [])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [selectedColumn, setSelectedColumn] = useState<string>('')
  const [viewVersion, setViewVersion] = useState<'original' | 'processed'>('original')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)
  const [loadAllRows, setLoadAllRows] = useState<Record<string, boolean>>({}) // Track which sheets have all rows loaded
  
  // Progress tracking
  const [uploadProgress, setUploadProgress] = useState<{ progress: number; message: string; status: string } | null>(null)
  const [validationAlert, setValidationAlert] = useState<{
    open: boolean
    invalidRules: Array<{
      ruleIndex: number
      rule: typeof outlierRules[0]
      missingSheet?: string
      missingColumn?: string
    }>
    onUpdate: (selectedIndices: number[]) => void
    onKeep: () => void
  }>({
    open: false,
    invalidRules: [],
    onUpdate: () => {},
    onKeep: () => {}
  })
  const [selectedRulesToUpdate, setSelectedRulesToUpdate] = useState<Set<number>>(new Set())
  const [ruleUpdates, setRuleUpdates] = useState<Map<number, { sheet?: string; column?: string; remove?: boolean }>>(new Map())

  // Fetch input files with metadata
  const { data: inputFilesData, refetch: refetchInputFiles } = useQuery({
    queryKey: ['node-files', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        folders: {
          input: Array<{
            name: string
            size: number
            modified: string
            path: string
            metadata?: {
              original_filename: string
              file_type: string
              uploaded_time: string
              workflow_id: string
              node_id: string
              uuid_filename: string
              file_size: number
            }
          }>
        }
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch Excel data
  const { data: excelData, isLoading: loadingData, refetch: refetchData } = useQuery({
    queryKey: ['excel-data', workflowId, node.id, viewVersion, loadAllRows, uploadedFileKey],
    queryFn: async () => {
      // Determine if we should load all rows for any sheet
      const shouldLoadAll = Object.values(loadAllRows).some(v => v === true)
      // Build query parameters
      const params = new URLSearchParams({
        version: viewVersion,
        load_all: shouldLoadAll.toString()
      })
      // Always pass the input file path so backend can match processed files to input files
      // Path format: workflows/{workflow_id}/nodes/{node_id}/input/{filename}
      // Backend expects just the filename relative to input folder
      if (uploadedFileKey) {
        // Extract filename from path (last part after /)
        const filename = uploadedFileKey.split('/').pop() || uploadedFileKey
        params.append('file_path', filename)
      }
      const response = await apiClient.get<{
        workflow_id: string
        node_id: string
        file_path: string
        filename: string
        version: string
        sheets: Array<{
          name: string
          rows: number
          columns: string[]
          data: any[]
          total_rows: number
          displayed_rows: number
        }>
        message?: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/excel-data?${params.toString()}`)
      console.log('Excel data response:', { version: viewVersion, sheetsCount: response.sheets?.length, message: response.message })
      return response
    },
    enabled: !!uploadedFileKey,
    staleTime: 0 // Set to 0 to always refetch when switching versions
  })

  // File upload mutation with progress tracking
  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<{ storage_key: string; filename: string }> => {
      const formData = new FormData()
      formData.append('file', file)
      
      setUploadProgress({ progress: 0, message: 'Uploading...', status: 'uploading' })
      
      const xhr = new XMLHttpRequest()
      return new Promise<{ storage_key: string; filename: string }>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            setUploadProgress({ progress, message: `Uploading... ${progress}%`, status: 'uploading' })
          }
        })
        
        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 201) {
            setUploadProgress({ progress: 100, message: 'Upload complete', status: 'completed' })
            setTimeout(() => setUploadProgress(null), 2000)
            try {
              const response = JSON.parse(xhr.responseText)
              resolve(response)
            } catch (e) {
              // If response is not JSON, create a response object
              resolve({ storage_key: xhr.responseText, filename: file.name })
            }
          } else {
            setUploadProgress(null)
            let errorMessage = 'Upload failed'
            try {
              const errorData = JSON.parse(xhr.responseText)
              errorMessage = errorData.detail || errorData.message || errorMessage
            } catch (e) {
              errorMessage = xhr.statusText || errorMessage
            }
            reject(new Error(errorMessage))
          }
        })
        
        xhr.addEventListener('error', () => {
          setUploadProgress(null)
          reject(new Error('Network error during upload'))
        })
        
        xhr.addEventListener('abort', () => {
          setUploadProgress(null)
          reject(new Error('Upload cancelled'))
        })
        
        const token = localStorage.getItem('access_token')
        // Use the same URL format as apiClient (without /api prefix since it's added by the proxy)
        xhr.open('POST', `/api/v1/workflows/${workflowId}/nodes/${node.id}/upload`)
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        }
        // Don't set Content-Type - browser will set it automatically with boundary for FormData
        xhr.send(formData)
      })
    },
    onSuccess: (data: { storage_key: string; filename: string }) => {
      setUploadedFileKey(data.storage_key)
      setFilename(data.filename)
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          file_key: data.storage_key,
          filename: data.filename
        })
      }
      // Save config to file
      const configToSave = {
        file_key: data.storage_key,
        filename: data.filename,
        selected_columns: selectedColumns,
        outlier_rules: outlierRules
      }
      saveConfigToFile(configToSave)
      
      // Also save to database
      apiClient.put(`/v1/nodes/${node.id}`, {
        config: {
          ...node.config,
          ...configToSave
        }
      }).catch(err => {
        console.error('Failed to save config to database:', err)
      })
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, node.id] })
      toast.success('File opened successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to open file')
    }
  })

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async (data: { rules: any[], columns: Record<string, string[]> }) => {
      // Extract filename from uploadedFileKey if it's a full path
      let fileKeyToSend = uploadedFileKey
      if (uploadedFileKey && uploadedFileKey.includes('/')) {
        // Extract just the filename from the path
        fileKeyToSend = uploadedFileKey.split('/').pop() || uploadedFileKey
      }
      console.log('Processing with file_key:', fileKeyToSend, 'from uploadedFileKey:', uploadedFileKey)
      return apiClient.post<{
        workflow_id: string
        node_id: string
        original_file: string
        processed_file: string
        filename: string
        sheets_processed: string[]
        summary_sheet: string
        total_removals: number
        removal_summary: any[]
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/process-outlier-remover`, {
        outlier_rules: data.rules,
        selected_columns: data.columns,
        file_key: fileKeyToSend // Pass the current file_key explicitly (just filename)
      })
    },
    onSuccess: (data) => {
      console.log('Processing result:', data)
      toast.success(`Processing completed successfully. ${data.total_removals || 0} removals applied.`)
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      setViewVersion('processed')
      // Refetch data after a short delay to ensure file is written
      setTimeout(() => {
        refetchData()
      }, 500)
      // Save config to file after processing
      saveConfigToFile({
        file_key: uploadedFileKey,
        filename: filename,
        selected_columns: selectedColumns,
        outlier_rules: outlierRules
      })
      
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          outlier_rules: outlierRules,
          selected_columns: selectedColumns
        })
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to process file')
    }
  })

  // Download mutation
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/workflows/${workflowId}/nodes/${node.id}/download-processed`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to download file' }))
        throw new Error(errorData.detail || 'Failed to download file')
      }
      
      return await response.blob()
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'processed_excel.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('File downloaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to download file')
    }
  })

  const handleSwitchInputFile = () => {
    setShowInputFileDialog(true)
    refetchInputFiles()
  }

  const handleSelectInputFile = async (file: { name: string; path: string; metadata?: any }) => {
    try {
      // Step 1: Update file key and filename FIRST
      const fileKey = file.path
      const originalFilename = file.metadata?.original_filename || file.name
      
      // Update state immediately
      setUploadedFileKey(fileKey)
      setFilename(originalFilename)
      
      // Step 2: Save file_key and filename to config FIRST (before other operations)
      const currentRules = outlierRules.map(rule => {
        const ruleObj: any = {
          condition: rule.condition,
          value: rule.value,
          action: rule.action || 'clear_cell'
        }
        // Always include sheet and column fields
        ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
        ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
        return ruleObj
      })
      
      const configToSave = {
        file_key: fileKey,
        filename: originalFilename,
        outlier_rules: currentRules
      }
      
      await saveConfigToFile(configToSave)
      
      // Also update parent component's config
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          ...configToSave
        })
      }
      
      // Step 3: Reset state for new file - column selections reset, but keep rules
      setLoadAllRows({})
      setSelectedSheet('')
      setSearchQuery('')
      setViewVersion('original') // Reset to original view when switching files
      setSelectedColumns({}) // Reset column selections for new file (will auto-select all)
      
      // Reset validation tracking for new file
      lastValidatedFileRef.current = null
      
      // Step 4: Invalidate queries to reload data - the query will automatically refetch because uploadedFileKey changed
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-config', workflowId, node.id] })
      
      // Wait for excel data to load before validating
      // We'll validate in a useEffect that watches excelData
      
      setShowInputFileDialog(false)
      toast.success(`Switched to file: ${originalFilename}`)
    } catch (error: any) {
      toast.error(`Failed to switch file: ${error.message || 'Unknown error'}`)
    }
  }

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      await apiClient.delete(`/v1/workflows/${workflowId}/nodes/${node.id}/files/${filePath}`)
    },
    onSuccess: () => {
      toast.success('File deleted successfully')
      // Refresh file list
      refetchInputFiles()
      // If the deleted file was the current one, clear it
      if (uploadedFileKey && inputFilesData?.folders?.input) {
        const deletedFile = inputFilesData.folders.input.find(f => f.path === uploadedFileKey)
        if (deletedFile) {
          setUploadedFileKey(null)
          setSelectedSheet('')
          setSearchQuery('')
          setViewVersion('original')
          setSelectedColumns({})
        }
      }
    },
    onError: (error: any) => {
      toast.error(`Failed to delete file: ${error.message || 'Unknown error'}`)
    }
  })

  const handleDeleteFile = (e: React.MouseEvent, file: { path: string; name: string }) => {
    e.stopPropagation() // Prevent triggering file selection
    if (confirm(`Are you sure you want to delete "${file.name}"? This action cannot be undone.`)) {
      deleteFileMutation.mutate(file.path)
    }
  }

  // Function to save config to file
  const saveConfigToFile = async (config: any) => {
    try {
      await apiClient.post(`/v1/workflows/${workflowId}/nodes/${node.id}/config`, config)
    } catch (error: any) {
      console.error('Failed to save config to file:', error)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        toast.error('Please select a valid Excel file (.xlsx or .xls)')
        return
      }
      uploadMutation.mutate(file)
      // Reset input so same file can be selected again
      e.target.value = ''
    }
  }


  const handleSelectAllColumns = (sheetName: string) => {
    if (!excelData) return
    const sheet = excelData.sheets.find(s => s.name === sheetName)
    if (sheet) {
      const updated = {
        ...selectedColumns,
        [sheetName]: [...sheet.columns]
      }
      setSelectedColumns(updated)
      // Don't save column selections to config - they default to all
    }
  }

  const handleDeselectAllColumns = (sheetName: string) => {
    const updated = {
      ...selectedColumns,
      [sheetName]: []
    }
    setSelectedColumns(updated)
    // Don't save column selections to config - they default to all
  }

  const handleToggleColumn = (sheetName: string, columnName: string) => {
    const current = selectedColumns[sheetName] || []
    const isSelected = current.includes(columnName)
    const updated = {
      ...selectedColumns,
      [sheetName]: isSelected
        ? current.filter(c => c !== columnName)
        : [...current, columnName]
    }
    setSelectedColumns(updated)
    // Don't save column selections to config - they default to all
  }

  const handleAddRule = () => {
    const newRules: Array<{
      sheet?: string
      column?: string
      condition: string
      value: string
      action?: 'clear_cell' | 'remove_row'
    }> = [...outlierRules, { 
      // Don't set sheet/column - defaults to all sheets and all selected columns
      condition: 'greater_than', 
      value: '',
      action: 'clear_cell' as const  // Default action: clear cell
    }]
    setOutlierRules(newRules)
    setSelectedColumn('')
    // Save only conditions (condition, value, action) to config
    saveRulesToConfig(newRules)
  }

  const handleRemoveRule = (index: number) => {
    const newRules = outlierRules.filter((_, i) => i !== index)
    setOutlierRules(newRules)
    // Save only conditions to config
    saveRulesToConfig(newRules)
  }

  const handleUpdateRule = (index: number, field: string, value: string | undefined) => {
    const updated = [...outlierRules]
    updated[index] = { ...updated[index], [field]: value }
    setOutlierRules(updated)
    
    // Save all rule fields to config (condition, value, action, sheet, column)
    saveRulesToConfig(updated)
  }

  // Helper function to save rules (including sheet and column) to config
  const saveRulesToConfig = async (rules: typeof outlierRules) => {
    if (!uploadedFileKey) return
    
    // Save condition, value, action, sheet, and column
    // Use null instead of undefined so fields are preserved in JSON
    const rulesToSave = rules.map(rule => {
      const ruleObj: any = {
        condition: rule.condition,
        value: rule.value,
        action: rule.action || 'clear_cell'
      }
      // Always include sheet and column fields
      // Use null for empty/undefined, otherwise use the actual value
      ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
      ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
      return ruleObj
    })
    
    try {
      const configToSave = {
        file_key: uploadedFileKey,
        filename: filename,
        outlier_rules: rulesToSave
        // Don't save selected_columns
      }
      await saveConfigToFile(configToSave)
      
      // Also update parent component's config
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          ...configToSave
        })
      }
    } catch (error: any) {
      console.error('Failed to save rules to config:', error)
    }
  }

  const handleApply = async () => {
    if (outlierRules.length === 0) {
      toast.error('Please add at least one outlier removal rule')
      return
    }
    
    if (!uploadedFileKey) {
      toast.error('Please select an input file first')
      return
    }
    
    // Save rules (including sheet and column) before processing - don't save column selections
    // Use null instead of undefined so fields are preserved in JSON
    const rulesToSave = outlierRules.map(rule => {
      const ruleObj: any = {
        condition: rule.condition,
        value: rule.value,
        action: rule.action || 'clear_cell'
      }
      // Always include sheet and column fields
      // Use null for empty/undefined, otherwise use the actual value
      ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
      ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
      return ruleObj
    })
    
    const configToSave = {
      file_key: uploadedFileKey,
      filename: filename,
      outlier_rules: rulesToSave
      // Don't save selected_columns - they default to all
    }
    
    try {
      // Save to file and database
      await saveConfigToFile(configToSave)
      
      // Also update parent component's config
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          ...configToSave
        })
      }
      
      console.log('Config saved before processing:', configToSave)
    } catch (error: any) {
      console.error('Failed to save config before processing:', error)
      toast.error('Failed to save settings. Please try again.')
      return
    }
    
    // Proceed with processing after config is saved
    processMutation.mutate({ rules: outlierRules, columns: selectedColumns })
  }

  // Load config when component mounts or config is loaded
  // Load rules (including sheet and column) regardless of file - they persist across files
  useEffect(() => {
    if (loadedConfig?.config) {
      const config = loadedConfig.config
      const configFileKey = config.file_key
      
      // Always load rules (including sheet and column) from config - they persist across files
      // Skip loading if we just updated rules to prevent overwriting the update
      if (justUpdatedRulesRef.current) {
        console.log('Skipping config load - rules were just updated')
        return
      }
      
      if (config.outlier_rules && Array.isArray(config.outlier_rules) && config.outlier_rules.length > 0) {
        const loadedRules = config.outlier_rules.map((rule: any) => ({
          sheet: rule.sheet && rule.sheet !== null ? rule.sheet : undefined,
          column: rule.column && rule.column !== null ? rule.column : undefined,
          condition: rule.condition || 'greater_than',
          value: rule.value || '',
          action: rule.action || 'clear_cell'
        }))
        // Only update if rules have changed to avoid unnecessary re-renders
        // Use a more robust comparison that handles object order
        const normalizeRules = (rules: typeof outlierRules) => {
          return JSON.stringify(rules.map(r => ({
            sheet: r.sheet || '',
            column: r.column || '',
            condition: r.condition,
            value: r.value,
            action: r.action || 'clear_cell'
          })).sort((a, b) => {
            // Sort by condition, then value for consistent comparison
            if (a.condition !== b.condition) return a.condition.localeCompare(b.condition)
            return a.value.localeCompare(b.value)
          }))
        }
        
        const currentRulesStr = normalizeRules(outlierRules)
        const loadedRulesStr = normalizeRules(loadedRules)
        
        // Only update if rules are actually different
        // Skip update if we just updated rules (they should match what we saved)
        if (currentRulesStr !== loadedRulesStr) {
          // Check if the difference is significant enough to warrant an update
          // If current rules are empty or count differs, definitely update
          if (outlierRules.length === 0 || outlierRules.length !== loadedRules.length) {
            console.log('Loading rules from config (count differs):', loadedRules)
            setOutlierRules(loadedRules.map((r: typeof outlierRules[0]) => ({ ...r })))
          } else {
            // Rules count matches - check if content is significantly different
            // Only update if there are meaningful differences (not just order)
            const currentRulesMap = new Map(outlierRules.map((r: typeof outlierRules[0], i: number) => [i, normalizeRules([r])]))
            const loadedRulesMap = new Map(loadedRules.map((r: typeof outlierRules[0], i: number) => [i, normalizeRules([r])]))
            
            let hasSignificantDiff = false
            for (let i = 0; i < Math.max(outlierRules.length, loadedRules.length); i++) {
              const currentRule = currentRulesMap.get(i)
              const loadedRule = loadedRulesMap.get(i)
              if (currentRule !== loadedRule) {
                hasSignificantDiff = true
                break
              }
            }
            
            if (hasSignificantDiff) {
              console.log('Loading rules from config (content differs):', loadedRules)
              setOutlierRules(loadedRules.map((r: typeof outlierRules[0]) => ({ ...r })))
            } else {
              console.log('Skipping config load - rules match current state')
            }
          }
        }
      } else if (!config.outlier_rules || config.outlier_rules.length === 0) {
        // If no rules in config, keep current rules (don't clear them)
        // This allows rules to persist even if config doesn't have them yet
      }
      
      // Only load file-specific settings if config matches current file
      if (configFileKey && configFileKey === uploadedFileKey) {
        if (config.filename) setFilename(config.filename)
        // Don't load selected_columns - they default to all
      } else if (configFileKey && !uploadedFileKey) {
        // If no file is currently selected, load the file info
        if (config.file_key) setUploadedFileKey(config.file_key)
        if (config.filename) setFilename(config.filename)
        // Don't load selected_columns - they default to all
      }
    }
  }, [loadedConfig, uploadedFileKey])

  // Auto-select first sheet when data loads
  useEffect(() => {
    if (excelData && excelData.sheets.length > 0 && !selectedSheet) {
      setSelectedSheet(excelData.sheets[0].name)
    }
  }, [excelData, selectedSheet])

  // Auto-select all columns for all sheets when excelData loads (default behavior)
  useEffect(() => {
    if (excelData && excelData.sheets.length > 0) {
      const allColumnsSelected: Record<string, string[]> = {}
      let hasChanges = false
      
      excelData.sheets.forEach(sheet => {
        // Only set if not already set (preserve user's manual selections)
        if (!selectedColumns[sheet.name] || selectedColumns[sheet.name].length === 0) {
          allColumnsSelected[sheet.name] = [...sheet.columns]
          hasChanges = true
        } else {
          allColumnsSelected[sheet.name] = selectedColumns[sheet.name]
        }
      })
      
      // Only update if there are changes
      if (hasChanges) {
        setSelectedColumns(allColumnsSelected)
      }
    }
  }, [excelData, uploadedFileKey]) // Re-run when file changes

  // Validate rules when excelData loads after file switch
  // This validates ALL rules to ensure they can be applied to the current file
  useEffect(() => {
    if (!excelData || !excelData.sheets || excelData.sheets.length === 0) return
    if (outlierRules.length === 0) return
    if (!uploadedFileKey) return
    
    // Skip validation if we've already validated this file (unless validation dialog was just closed)
    // We'll reset this when validation completes
    if (lastValidatedFileRef.current === uploadedFileKey) return
    
    const availableSheetNames = new Set(excelData.sheets.map(s => s.name))
    const sheetColumnsMap = new Map<string, Set<string>>()
    excelData.sheets.forEach(sheet => {
      sheetColumnsMap.set(sheet.name, new Set(sheet.columns))
    })
    
    const invalidRules: Array<{
      ruleIndex: number
      rule: typeof outlierRules[0]
      missingSheet?: string
      missingColumn?: string
    }> = []
    
    outlierRules.forEach((rule, index) => {
      let missingSheet: string | undefined
      let missingColumn: string | undefined
      
      // Check if sheet exists
      if (rule.sheet && !availableSheetNames.has(rule.sheet)) {
        missingSheet = rule.sheet
      }
      
      // Check if column exists in the specified sheet (or all sheets if no sheet specified)
      if (rule.column) {
        if (rule.sheet) {
          // Column must exist in the specified sheet
          const columns = sheetColumnsMap.get(rule.sheet)
          if (!columns || !columns.has(rule.column)) {
            missingColumn = rule.column
          }
        } else {
          // Column must exist in at least one sheet
          let found = false
          for (const sheetName of Array.from(sheetColumnsMap.keys())) {
            const columns = sheetColumnsMap.get(sheetName)
            if (columns && columns.has(rule.column)) {
              found = true
              break
            }
          }
          if (!found) {
            missingColumn = rule.column
          }
        }
      }
      
      // If this rule has invalid references, add it to the list
      if (missingSheet || missingColumn) {
        invalidRules.push({
          ruleIndex: index,
          rule,
          missingSheet,
          missingColumn
        })
      }
    })
    
    // If there are invalid rules, show alert
    // Don't mark as validated yet - wait until user resolves issues
    if (invalidRules.length > 0) {
      // Select all rules by default
      setSelectedRulesToUpdate(new Set(invalidRules.map(ir => ir.ruleIndex)))
      // Reset rule updates
      setRuleUpdates(new Map())
      
      setValidationAlert({
        open: true,
        invalidRules,
        onUpdate: async (selectedIndices: number[]) => {
          // Apply updates: remove rules marked for removal, update others with new sheet/column
          const rulesToRemove = new Set<number>()
          
          // First, identify all rules to remove
          ruleUpdates.forEach((update, index) => {
            if (update.remove) {
              rulesToRemove.add(index)
            }
          })
          
          // Track which rules have user updates (sheet/column changes)
          const rulesWithUserUpdates = new Set<number>()
          ruleUpdates.forEach((update, index) => {
            if (update && !update.remove && ('sheet' in update || 'column' in update)) {
              rulesWithUserUpdates.add(index)
            }
          })
          
          const updatedRules = outlierRules.map((rule, index) => {
            // Check if this rule should be removed
            if (rulesToRemove.has(index)) {
              return null // Mark for removal
            }
            
            const updatedRule = { ...rule }
            
            // Apply user's updates if any (regardless of selection - user explicitly changed it)
            const userUpdate = ruleUpdates.get(index)
            if (userUpdate && !userUpdate.remove) {
              // Apply sheet update if it exists in the update (even if undefined - user cleared it)
              if ('sheet' in userUpdate) {
                updatedRule.sheet = userUpdate.sheet || undefined
              }
              // Apply column update if it exists in the update (even if undefined - user cleared it)
              if ('column' in userUpdate) {
                updatedRule.column = userUpdate.column || undefined
              }
            }
            
            // For selected rules without user updates, apply fallback: remove invalid references
            if (selectedIndices.includes(index) && !rulesWithUserUpdates.has(index)) {
              // Find the invalid rule info
              const invalidRule = invalidRules.find(ir => ir.ruleIndex === index)
              if (invalidRule) {
                // Fallback: remove invalid sheet/column if no user update
                if (invalidRule.missingSheet) {
                  updatedRule.sheet = undefined
                }
                if (invalidRule.missingColumn) {
                  updatedRule.column = undefined
                }
              }
            }
            
            return updatedRule
          }).filter((rule) => rule !== null) as typeof outlierRules
          
          // Save updated rules to config first
          if (uploadedFileKey) {
            const configToSave = {
              file_key: uploadedFileKey,
              filename: filename,
              outlier_rules: updatedRules.map(rule => {
                const ruleObj: any = {
                  condition: rule.condition,
                  value: rule.value,
                  action: rule.action || 'clear_cell'
                }
                // Always include sheet and column fields
                // Use null for empty/undefined, otherwise use the actual value
                ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
                ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
                return ruleObj
              })
            }
            
            await saveConfigToFile(configToSave)
            
            // Also update parent component's config
            if (onConfigUpdate) {
              onConfigUpdate({
                ...node.config,
                ...configToSave
              })
            }
          }
          
          // Update rules state AFTER saving to config
          // This ensures the state matches what's saved and triggers re-render
          // Create new references for both array and each rule object to ensure React detects the change
          console.log('Updating rules in state:', updatedRules)
          console.log('Rule updates applied:', Array.from(ruleUpdates.entries()))
          const newRules = updatedRules.map(rule => ({ ...rule }))
          
          // Mark that we just updated rules to prevent config loading from overwriting
          justUpdatedRulesRef.current = true
          setOutlierRules(newRules)
          
          // Mark file as validated after successful update
          lastValidatedFileRef.current = uploadedFileKey
          
          // Reset validation state
          setValidationAlert({ ...validationAlert, open: false })
          setSelectedRulesToUpdate(new Set())
          setRuleUpdates(new Map())
          
          // Clear the flag after a short delay to allow state to settle
          setTimeout(() => {
            justUpdatedRulesRef.current = false
          }, 500)
          
          // Invalidate config query in background (don't await) to sync with server
          // But don't refetch immediately to avoid overwriting our just-updated state
          queryClient.invalidateQueries({ queryKey: ['node-config', workflowId, node.id] })
          
          const removedCount = rulesToRemove.size
          // Count rules that are updated but not removed
          const updatedCount = rulesWithUserUpdates.size + selectedIndices.filter(idx => !rulesToRemove.has(idx) && !rulesWithUserUpdates.has(idx)).length
          if (removedCount > 0 && updatedCount > 0) {
            toast.success(`Removed ${removedCount} rule(s) and updated ${updatedCount} rule(s)`)
          } else if (removedCount > 0) {
            toast.success(`Removed ${removedCount} rule(s)`)
          } else {
            toast.success(`Updated ${updatedCount} rule(s)`)
          }
        },
        onKeep: () => {
          // Keep the rules as-is (user chose to keep invalid references)
          // Mark as validated even though there are issues - user chose to keep them
          lastValidatedFileRef.current = uploadedFileKey
          
          setValidationAlert({ ...validationAlert, open: false })
          setSelectedRulesToUpdate(new Set())
          setRuleUpdates(new Map())
          toast('Keeping rules as-is. Please update manually if needed.', { icon: 'ℹ️' })
        }
      })
    } else {
      // No invalid rules - all rules are valid for this file
      // Mark as validated
      lastValidatedFileRef.current = uploadedFileKey
    }
  }, [excelData, outlierRules, uploadedFileKey]) // Validate when excelData or rules change

  // Reset loadAllRows when version changes or file changes
  useEffect(() => {
    setLoadAllRows({})
  }, [viewVersion, uploadedFileKey])

  // Handle loading all rows for a sheet
  const handleLoadAllRows = () => {
    if (selectedSheet) {
      setLoadAllRows(prev => ({
        ...prev,
        [selectedSheet]: true
      }))
      // Refetch data after a short delay to ensure state is updated
      setTimeout(() => {
        refetchData()
      }, 100)
    }
  }

  const currentSheet = excelData?.sheets.find(s => s.name === selectedSheet)

  return (
    <div className={`${isStandalone ? 'h-full' : 'h-screen'} flex flex-col bg-gray-50`}>
      {/* Top Menu Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSwitchInputFile}
            className="flex items-center space-x-2"
          >
            <FileText className="h-4 w-4" />
            <span>Switch Input File</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploadedFileKey && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApply}
                disabled={processMutation.isPending || outlierRules.length === 0}
                className="flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>Apply Rules</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadMutation.mutate()}
                disabled={downloadMutation.isPending || viewVersion !== 'processed'}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {filename && (
            <span className="text-sm text-gray-600 flex items-center space-x-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{filename}</span>
            </span>
          )}
          {uploadedFileKey && (
            <div className="flex items-center space-x-2">
              <Button
                variant={viewVersion === 'original' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewVersion('original')}
              >
                Original
              </Button>
              <Button
                variant={viewVersion === 'processed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewVersion('processed')}
                disabled={viewVersion === 'processed' && !excelData}
              >
                Processed
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Rules and Column Selection */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {!uploadedFileKey ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <FileSpreadsheet className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600 mb-2">No file opened</p>
                <p className="text-sm text-gray-400">Open an Excel file to get started</p>
              </div>
            </div>
          ) : loadingData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading data...</p>
              </div>
            </div>
          ) : !excelData ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <p className="text-gray-600">No data available</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Save Rules Button */}
              <div className="border-b border-gray-200 p-3 bg-gray-50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!uploadedFileKey) {
                      toast.error('Please select an input file first')
                      return
                    }
                    try {
                      // Save all rule fields including sheet and column
                      // Use null instead of undefined so fields are preserved in JSON
                      const rulesToSave = outlierRules.map(rule => {
                        const ruleObj: any = {
                          condition: rule.condition,
                          value: rule.value,
                          action: rule.action || 'clear_cell'
                        }
                        // Always include sheet and column fields
                        // Use null for empty/undefined, otherwise use the actual value
                        ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
                        ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
                        return ruleObj
                      })
                      const configToSave = {
                        file_key: uploadedFileKey,
                        filename: filename,
                        outlier_rules: rulesToSave
                        // Don't save selected_columns - they default to all
                      }
                      await saveConfigToFile(configToSave)
                      if (onConfigUpdate) {
                        onConfigUpdate({
                          ...node.config,
                          ...configToSave
                        })
                      }
                      toast.success('Rules saved successfully')
                    } catch (error: any) {
                      console.error('Failed to save settings:', error)
                      toast.error('Failed to save settings. Please try again.')
                    }
                  }}
                  className="w-full flex items-center justify-center space-x-2"
                  disabled={!uploadedFileKey}
                >
                  <Save className="h-4 w-4" />
                  <span>Save Rules</span>
                </Button>
              </div>
              
              {/* Column Selection */}
              <div className="border-b border-gray-200 p-4 overflow-y-auto flex-shrink-0" style={{ maxHeight: '40%' }}>
                <h3 className="text-sm font-semibold mb-3 sticky top-0 bg-white pb-2">Column Selection</h3>
                {excelData.sheets.map((sheet) => {
                  const sheetColumns = selectedColumns[sheet.name] || []
                  return (
                    <div key={sheet.name} className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-medium">{sheet.name}</Label>
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleSelectAllColumns(sheet.name)}
                          >
                            All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleDeselectAllColumns(sheet.name)}
                          >
                            None
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {sheet.columns.map((col, idx) => {
                          const isSelected = sheetColumns.includes(col)
                          return (
                            <div key={idx} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${sheet.name}-${col}`}
                                checked={isSelected}
                                onCheckedChange={() => handleToggleColumn(sheet.name, col)}
                              />
                              <Label
                                htmlFor={`${sheet.name}-${col}`}
                                className="text-xs cursor-pointer flex-1"
                              >
                                {col}
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Rules Configuration */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Outlier Removal Rules</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddRule}
                    className="h-7 px-2"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {outlierRules.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-400">
                      No rules defined. Add a rule to get started.
                    </div>
                  ) : (
                    outlierRules.map((rule, index) => (
                      <Card key={index} className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500">Rule {index + 1}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRule(index)}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Sheet (optional)</Label>
                            <select
                              value={rule.sheet || ''}
                              onChange={(e) => handleUpdateRule(index, 'sheet', e.target.value || undefined)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">All Sheets</option>
                              {excelData.sheets.map((sheet, idx) => (
                                <option key={idx} value={sheet.name}>{sheet.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Column (optional)</Label>
                            <select
                              value={rule.column || ''}
                              onChange={(e) => handleUpdateRule(index, 'column', e.target.value || undefined)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">All Selected Columns</option>
                              {excelData.sheets.flatMap(sheet => 
                                (selectedColumns[sheet.name] || []).map((col, idx) => (
                                  <option key={`${sheet.name}-${idx}`} value={col}>
                                    {col} ({sheet.name})
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Condition</Label>
                            <select
                              value={rule.condition}
                              onChange={(e) => handleUpdateRule(index, 'condition', e.target.value)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="greater_than">Greater Than</option>
                              <option value="less_than">Less Than</option>
                              <option value="equals">Equals</option>
                              <option value="contains">Contains</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Value</Label>
                            <Input
                              value={rule.value}
                              onChange={(e) => handleUpdateRule(index, 'value', e.target.value)}
                              placeholder="Value to compare"
                              className="mt-1 h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Action</Label>
                            <select
                              value={rule.action || 'clear_cell'}
                              onChange={(e) => handleUpdateRule(index, 'action', e.target.value)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="clear_cell">Clear Cell</option>
                              <option value="remove_row">Remove Row</option>
                            </select>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Table Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {!uploadedFileKey ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileSpreadsheet className="h-24 w-24 mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">No file opened</p>
                <p className="text-sm text-gray-400 mb-4">Click "Switch Input File" to load an Excel file</p>
                <Button onClick={handleSwitchInputFile} variant="default">
                  <FileText className="h-4 w-4 mr-2" />
                  Switch Input File
                </Button>
              </div>
            </div>
          ) : loadingData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading Excel data...</p>
              </div>
            </div>
          ) : !excelData || excelData.sheets.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-600">
                  {excelData?.message || 'No data available'}
                </p>
                {viewVersion === 'processed' && !excelData?.sheets?.length && (
                  <p className="text-sm text-gray-400 mt-2">
                    Please process the file first to view the processed version.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Sheet Selector and Search Bar */}
              <div className="border-b border-gray-200 px-4 py-2 space-y-2">
                <div className="flex items-center space-x-2 overflow-x-auto">
                  {excelData.sheets.map((sheet) => (
                    <Button
                      key={sheet.name}
                      variant={selectedSheet === sheet.name ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedSheet(sheet.name)}
                      className="text-xs"
                    >
                      {sheet.name} ({sheet.rows} rows)
                    </Button>
                  ))}
                </div>
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search values in table..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-8 text-sm"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto p-4">
                {currentSheet ? (
                  <div className="border border-gray-200 rounded-lg overflow-x-auto">
                    {/* Load All Rows Button */}
                    {!loadAllRows[selectedSheet] && currentSheet.total_rows > currentSheet.displayed_rows && (
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          Showing first {currentSheet.displayed_rows} of {currentSheet.total_rows} rows
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleLoadAllRows}
                          disabled={loadingData}
                          className="text-xs"
                        >
                          {loadingData ? 'Loading...' : `Load All ${currentSheet.total_rows} Rows`}
                        </Button>
                      </div>
                    )}
                    <table className="min-w-full text-sm border-collapse">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {currentSheet.columns.map((col, colIdx) => (
                            <th
                              key={colIdx}
                              className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 bg-gray-50"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Filter data based on search query
                          let filteredData = currentSheet.data
                          if (searchQuery.trim()) {
                            const query = searchQuery.toLowerCase()
                            filteredData = currentSheet.data.filter((row) => {
                              return currentSheet.columns.some((col) => {
                                const value = row[col]
                                if (value === null || value === undefined) return false
                                return String(value).toLowerCase().includes(query)
                              })
                            })
                          }
                          
                          if (filteredData.length === 0) {
                            return (
                              <tr>
                                <td
                                  colSpan={currentSheet.columns.length}
                                  className="border border-gray-200 px-3 py-8 text-center text-gray-400"
                                >
                                  {searchQuery.trim() 
                                    ? `No results found for "${searchQuery}"` 
                                    : 'No data to display'}
                                </td>
                              </tr>
                            )
                          }
                          
                          return filteredData.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-gray-50">
                              {currentSheet.columns.map((col, colIdx) => {
                                const cellValue = row[col]
                                const cellStr = cellValue !== null && cellValue !== undefined
                                  ? String(cellValue)
                                  : ''
                                const isMatch = searchQuery.trim() && cellStr.toLowerCase().includes(searchQuery.toLowerCase())
                                
                                return (
                                  <td
                                    key={colIdx}
                                    className={`border border-gray-200 px-3 py-2 text-gray-800 ${
                                      isMatch ? 'bg-yellow-100 font-medium' : ''
                                    }`}
                                  >
                                    {cellStr}
                                  </td>
                                )
                              })}
                            </tr>
                          ))
                        })()}
                      </tbody>
                    </table>
                    {(() => {
                      const filteredCount = searchQuery.trim() 
                        ? currentSheet.data.filter((row) => {
                            const query = searchQuery.toLowerCase()
                            return currentSheet.columns.some((col) => {
                              const value = row[col]
                              if (value === null || value === undefined) return false
                              return String(value).toLowerCase().includes(query)
                            })
                          }).length
                        : currentSheet.displayed_rows
                      
                      const isAllLoaded = loadAllRows[selectedSheet] || currentSheet.displayed_rows >= currentSheet.total_rows
                      
                      return (
                        <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
                          {searchQuery.trim() ? (
                            <>Showing {filteredCount} matching row{filteredCount !== 1 ? 's' : ''} (of {currentSheet.displayed_rows} displayed, {currentSheet.total_rows} total)</>
                          ) : (
                            <>Showing {currentSheet.displayed_rows} of {currentSheet.total_rows} rows{isAllLoaded ? ' (all loaded)' : ''}</>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">Select a sheet to view data</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input File Selection Dialog */}
      <Dialog open={showInputFileDialog} onOpenChange={(open) => {
        // Prevent closing dialog during upload
        if (!open && uploadProgress && uploadProgress.status === 'uploading') {
          return
        }
        setShowInputFileDialog(open)
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Input File</DialogTitle>
            <DialogDescription>
              Choose an input file from the node's input folder. Files are shown with their metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
              disabled={uploadProgress?.status === 'uploading'}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New File
            </Button>
            {uploadProgress && uploadProgress.status === 'uploading' && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">Uploading file...</span>
                  <span className="text-sm text-blue-700">{uploadProgress.progress}%</span>
                </div>
                <Progress value={uploadProgress.progress} className="h-2" />
                <p className="text-xs text-blue-600 mt-2">{uploadProgress.message}</p>
              </div>
            )}
            {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Existing Input Files:</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {inputFilesData.folders.input.map((file) => (
                    <div
                      key={file.name}
                      className={`relative w-full px-4 py-3 rounded-lg border hover:bg-gray-50 transition-all ${
                        file.path === uploadedFileKey ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => handleSelectInputFile(file)}
                        className="w-full text-left pr-8"
                      >
                        <div className="flex items-start space-x-3">
                          <FileSpreadsheet className="h-5 w-5 text-gray-400 mt-0.5" />
                          <div className="flex-1">
                            {file.metadata ? (
                              <>
                                <div className="font-medium text-gray-900">{file.metadata.original_filename}</div>
                                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                  <div>Type: {file.metadata.file_type}</div>
                                  <div>Uploaded: {new Date(file.metadata.uploaded_time).toLocaleString()}</div>
                                  <div>Size: {(file.metadata.file_size / 1024).toFixed(2)} KB</div>
                                  <div>UUID: {file.metadata.uuid_filename}</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-medium text-gray-900">{file.name}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Size: {(file.size / 1024).toFixed(2)} KB
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => handleDeleteFile(e, file)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete file"
                        disabled={deleteFileMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No input files found. Upload a file to get started.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Progress Dialog */}
      <Dialog 
        open={!!uploadProgress && uploadProgress.status === 'uploading'} 
        onOpenChange={() => {
          // Prevent closing during upload
          if (uploadProgress?.status === 'uploading') {
            return
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Uploading File</DialogTitle>
            <DialogDescription>
              Please wait while your file is being uploaded. This may take a while for large files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Progress</span>
                <span className="font-medium text-gray-900">{uploadProgress?.progress || 0}%</span>
              </div>
              <Progress value={uploadProgress?.progress || 0} className="h-3" />
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">{uploadProgress?.message || 'Uploading...'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Validation Alert Dialog */}
      <AlertDialog open={validationAlert.open} onOpenChange={(open) => {
        if (!open) {
          setValidationAlert({ ...validationAlert, open: false })
          setSelectedRulesToUpdate(new Set())
          setRuleUpdates(new Map())
        }
      }}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Invalid Sheet/Column References</AlertDialogTitle>
            <AlertDialogDescription>
              Some rules reference sheets or columns that don't exist in the current file.
              Select which rules you want to update:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto">
            {validationAlert.invalidRules.map((invalidRule) => {
              const rule = invalidRule.rule
              const isSelected = selectedRulesToUpdate.has(invalidRule.ruleIndex)
              const update = ruleUpdates.get(invalidRule.ruleIndex)
              const isMarkedForRemoval = update?.remove === true
              
              // Get current sheet/column (user update or original)
              // Check if property exists in update (even if value is undefined - user cleared it)
              const currentSheet = update && 'sheet' in update ? update.sheet : rule.sheet
              const currentColumn = update && 'column' in update ? update.column : rule.column
              
              // Get available columns for the selected sheet
              const selectedSheetData = excelData?.sheets.find(s => s.name === currentSheet)
              const availableColumns = selectedSheetData?.columns || []
              
              return (
                <div
                  key={invalidRule.ruleIndex}
                  className={`border rounded-lg p-3 ${isMarkedForRemoval ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}
                >
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={isSelected && !isMarkedForRemoval}
                      disabled={isMarkedForRemoval}
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selectedRulesToUpdate)
                        if (checked) {
                          newSelected.add(invalidRule.ruleIndex)
                        } else {
                          newSelected.delete(invalidRule.ruleIndex)
                        }
                        setSelectedRulesToUpdate(newSelected)
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-sm text-gray-900">
                          Rule {invalidRule.ruleIndex + 1}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newUpdates = new Map(ruleUpdates)
                            if (isMarkedForRemoval) {
                              // Unmark for removal
                              const existing = newUpdates.get(invalidRule.ruleIndex)
                              if (existing) {
                                const { remove, ...rest } = existing
                                if (Object.keys(rest).length > 0) {
                                  newUpdates.set(invalidRule.ruleIndex, rest)
                                } else {
                                  newUpdates.delete(invalidRule.ruleIndex)
                                }
                              } else {
                                newUpdates.delete(invalidRule.ruleIndex)
                              }
                            } else {
                              // Mark for removal
                              newUpdates.set(invalidRule.ruleIndex, { ...update, remove: true })
                              // Also deselect from update
                              const newSelected = new Set(selectedRulesToUpdate)
                              newSelected.delete(invalidRule.ruleIndex)
                              setSelectedRulesToUpdate(newSelected)
                            }
                            setRuleUpdates(newUpdates)
                          }}
                          className={`h-6 px-2 text-xs ${isMarkedForRemoval ? 'text-red-600 hover:text-red-700' : 'text-gray-600 hover:text-red-600'}`}
                        >
                          {isMarkedForRemoval ? 'Restore' : 'Remove Rule'}
                        </Button>
                      </div>
                      
                      {!isMarkedForRemoval && (
                        <>
                          <div className="mt-1 text-xs text-gray-600 space-y-1 mb-3">
                            <div>
                              <span className="font-medium">Condition:</span> {rule.condition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </div>
                            <div>
                              <span className="font-medium">Value:</span> {rule.value || '(empty)'}
                            </div>
                            <div>
                              <span className="font-medium">Action:</span> {(rule.action || 'clear_cell').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </div>
                          </div>
                          
                          {/* Sheet Selection */}
                          <div className="mt-2">
                            <Label className="text-xs font-medium">Sheet (optional)</Label>
                            <select
                              value={currentSheet || ''}
                              onChange={(e) => {
                                const newSheet = e.target.value || undefined
                                const newUpdates = new Map(ruleUpdates)
                                const existing = newUpdates.get(invalidRule.ruleIndex) || {}
                                newUpdates.set(invalidRule.ruleIndex, {
                                  ...existing,
                                  sheet: newSheet,
                                  // Clear column if sheet changes and column doesn't exist in new sheet
                                  column: newSheet ? existing.column : undefined
                                })
                                setRuleUpdates(newUpdates)
                              }}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">All Sheets</option>
                              {excelData?.sheets.map((sheet, idx) => (
                                <option key={idx} value={sheet.name}>{sheet.name}</option>
                              ))}
                            </select>
                            {invalidRule.missingSheet && !currentSheet && (
                              <span className="text-xs text-red-600 mt-1 block">
                                Original sheet "{invalidRule.missingSheet}" not found
                              </span>
                            )}
                          </div>
                          
                          {/* Column Selection */}
                          <div className="mt-2">
                            <Label className="text-xs font-medium">Column (optional)</Label>
                            <select
                              value={currentColumn || ''}
                              onChange={(e) => {
                                const newColumn = e.target.value || undefined
                                const newUpdates = new Map(ruleUpdates)
                                const existing = newUpdates.get(invalidRule.ruleIndex) || {}
                                newUpdates.set(invalidRule.ruleIndex, {
                                  ...existing,
                                  column: newColumn
                                })
                                setRuleUpdates(newUpdates)
                              }}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                              disabled={!currentSheet}
                            >
                              <option value="">All Selected Columns</option>
                              {currentSheet && availableColumns.map((col, idx) => (
                                <option key={idx} value={col}>{col}</option>
                              ))}
                              {!currentSheet && excelData?.sheets.flatMap(sheet => 
                                (selectedColumns[sheet.name] || []).map((col, idx) => (
                                  <option key={`${sheet.name}-${idx}`} value={col}>
                                    {col} ({sheet.name})
                                  </option>
                                ))
                              )}
                            </select>
                            {invalidRule.missingColumn && !currentColumn && (
                              <span className="text-xs text-red-600 mt-1 block">
                                Original column "{invalidRule.missingColumn}" not found{currentSheet ? ` in "${currentSheet}"` : ' in any sheet'}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      
                      {isMarkedForRemoval && (
                        <div className="mt-2 text-sm text-red-600 font-medium">
                          This rule will be removed
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {(() => {
                const removedCount = Array.from(ruleUpdates.values()).filter(u => u.remove).length
                const selectedCount = selectedRulesToUpdate.size
                const totalActions = removedCount + selectedCount
                
                if (totalActions === 0) {
                  return <span className="text-orange-600">Please select rules to update or remove</span>
                }
                
                const parts: string[] = []
                if (selectedCount > 0) {
                  parts.push(`${selectedCount} to update`)
                }
                if (removedCount > 0) {
                  parts.push(`${removedCount} to remove`)
                }
                return <span>{parts.join(', ')} of {validationAlert.invalidRules.length} rule(s)</span>
              })()}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Select all
                  setSelectedRulesToUpdate(new Set(validationAlert.invalidRules.map(ir => ir.ruleIndex)))
                }}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Deselect all
                  setSelectedRulesToUpdate(new Set())
                }}
              >
                Deselect All
              </Button>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={validationAlert.onKeep}>
              Keep As-Is
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const selectedIndices = Array.from(selectedRulesToUpdate)
                const removedCount = Array.from(ruleUpdates.values()).filter(u => u.remove).length
                
                if (selectedIndices.length > 0 || removedCount > 0) {
                  validationAlert.onUpdate(selectedIndices)
                } else {
                  toast.error('Please select at least one rule to update or remove')
                }
              }}
              disabled={selectedRulesToUpdate.size === 0 && Array.from(ruleUpdates.values()).filter(u => u.remove).length === 0}
            >
              {(() => {
                const removedCount = Array.from(ruleUpdates.values()).filter(u => u.remove).length
                const selectedCount = selectedRulesToUpdate.size
                if (removedCount > 0 && selectedCount > 0) {
                  return `Apply Changes (${selectedCount} update, ${removedCount} remove)`
                } else if (removedCount > 0) {
                  return `Remove ${removedCount} Rule(s)`
                } else {
                  return `Update ${selectedCount} Rule(s)`
                }
              })()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

