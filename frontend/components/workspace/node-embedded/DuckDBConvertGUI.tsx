'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Database, Upload, Play, Loader2, FileText, Search, FileSpreadsheet, ArrowLeft } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface DuckDBConvertGUIProps {
  node: {
    id: string
    module_type: string
    config: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
  isStandalone?: boolean
}

interface TableInfo {
  name: string
  row_count: number
  columns: Array<{ name: string; type: string }>
  error?: string
}

interface TableData {
  workflow_id: string
  node_id: string
  table_name: string
  columns: string[]
  data: Array<Record<string, any>>
  total_rows: number
  displayed_rows: number
  limit: number
  offset: number
}

export default function DuckDBConvertGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false
}: DuckDBConvertGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)

  // Fetch DuckDB tables
  const { data: tablesData, refetch: refetchTables, isLoading: loadingTables } = useQuery({
    queryKey: ['duckdb-tables', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        db_path: string
        tables: TableInfo[]
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-tables`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch table data
  const { data: tableData, isLoading: loadingTableData } = useQuery<TableData | null>({
    queryKey: ['duckdb-table-data', workflowId, node.id, selectedTable],
    queryFn: async (): Promise<TableData | null> => {
      if (!selectedTable) return null
      const params = new URLSearchParams({
        table_name: selectedTable,
        limit: '1000',
        offset: '0'
      })
      const result = await apiClient.get<TableData>(
        `/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-table-data?${params.toString()}`
      )
      return result || null
    },
    enabled: !!selectedTable && !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch input files
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

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post<{
        storage_key: string
        filename: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/upload`, formData)
    },
    onSuccess: () => {
      refetchInputFiles()
      toast.success('File uploaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload file')
    }
  })

  // Execute DuckDB conversion mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post<{
        workflow_id: string
        node_id: string
        converted_tables: Array<{
          table_name: string
          source_file: string
          sheet: string
          rows: number
          columns: string[]
        }>
        db_path: string
        summary: {
          files_collected: number
          tables_created: number
          errors: number
        }
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/execute-duckdb`)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['duckdb-tables', workflowId, node.id] })
      toast.success(`Conversion complete! Created ${data.summary.tables_created} tables.`)
      // Auto-select first table if available
      if (data.converted_tables && data.converted_tables.length > 0) {
        setSelectedTable(data.converted_tables[0].table_name)
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to execute conversion')
    }
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        toast.error('Please select a valid Excel file (.xlsx or .xls)')
        return
      }
      uploadMutation.mutate(file)
      e.target.value = ''
    }
  }

  const handleSwitchInputFile = () => {
    setShowInputFileDialog(true)
    refetchInputFiles()
  }

  const handleSelectInputFile = (file: { path: string; metadata?: any }) => {
    setShowInputFileDialog(false)
    // File is selected, user can now execute conversion
  }

  const handleExecute = () => {
    executeMutation.mutate()
  }

  // Auto-select first table when tables load
  useEffect(() => {
    if (tablesData?.tables && tablesData.tables.length > 0 && !selectedTable) {
      setSelectedTable(tablesData.tables[0].name)
    }
  }, [tablesData, selectedTable])

  const filteredTableData = tableData?.data ? (() => {
    if (!searchQuery.trim()) return tableData.data
    
    const query = searchQuery.toLowerCase()
    return tableData.data.filter((row: Record<string, any>) => {
      return tableData.columns.some((col: string) => {
        const value = row[col]
        if (value === null || value === undefined) return false
        return String(value).toLowerCase().includes(query)
      })
    })
  })() : []

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Menu Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isStandalone && (
            <Link href="/modules">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Modules
              </Button>
            </Link>
          )}
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExecute}
            disabled={executeMutation.isPending}
            className="flex items-center space-x-2"
          >
            {executeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Converting...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>Execute Conversion</span>
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          {tablesData?.db_path && (
            <span className="text-sm text-gray-600 flex items-center space-x-2">
              <Database className="h-4 w-4" />
              <span>{tablesData.db_path.split('/').pop()}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Tables List */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {loadingTables ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading tables...</p>
              </div>
            </div>
          ) : !tablesData || tablesData.tables.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <Database className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600 mb-2">No tables found</p>
                <p className="text-sm text-gray-400">Execute conversion to create tables</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="border-b border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-2">Tables</h3>
                <p className="text-xs text-gray-500">
                  {tablesData.tables.length} table{tablesData.tables.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-2">
                  {tablesData.tables.map((table) => (
                    <button
                      key={table.name}
                      onClick={() => setSelectedTable(table.name)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                        selectedTable === table.name
                          ? 'bg-indigo-50 border-indigo-200'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-900">{table.name}</div>
                      {table.error ? (
                        <div className="text-xs text-red-500 mt-1">Error: {table.error}</div>
                      ) : (
                        <div className="text-xs text-gray-500 mt-1">
                          {table.row_count.toLocaleString()} row{table.row_count !== 1 ? 's' : ''} • {table.columns.length} column{table.columns.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Table Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {!selectedTable ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Database className="h-24 w-24 mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">No table selected</p>
                <p className="text-sm text-gray-400">Select a table from the left panel to view data</p>
              </div>
            </div>
          ) : loadingTableData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading table data...</p>
              </div>
            </div>
          ) : !tableData || !tableData.data || tableData.data.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-600">No data available in table "{selectedTable}"</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Table Header and Search Bar */}
              <div className="border-b border-gray-200 px-4 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{selectedTable}</h3>
                  <span className="text-xs text-gray-500">
                    {tableData.total_rows.toLocaleString()} total row{tableData.total_rows !== 1 ? 's' : ''}
                  </span>
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
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {tableData.columns.map((col: string, colIdx: number) => (
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
                      {filteredTableData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableData.columns.length}
                            className="border border-gray-200 px-3 py-8 text-center text-gray-400"
                          >
                            {searchQuery.trim() 
                              ? `No results found for "${searchQuery}"` 
                              : 'No data to display'}
                          </td>
                        </tr>
                      ) : (
                        filteredTableData.map((row: Record<string, any>, rowIdx: number) => (
                          <tr key={rowIdx} className="hover:bg-gray-50">
                            {tableData.columns.map((col: string, colIdx: number) => {
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
                      )}
                    </tbody>
                  </table>
                  <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
                    {searchQuery.trim() ? (
                      <>Showing {filteredTableData.length} matching row{filteredTableData.length !== 1 ? 's' : ''} (of {tableData.displayed_rows} displayed, {tableData.total_rows} total)</>
                    ) : (
                      <>Showing {tableData.displayed_rows} of {tableData.total_rows} rows</>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input File Selection Dialog */}
      <Dialog open={showInputFileDialog} onOpenChange={setShowInputFileDialog}>
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
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New File
            </Button>
            {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Existing Input Files:</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {inputFilesData.folders.input.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => handleSelectInputFile(file)}
                      className={`w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition-all ${
                        'border-gray-200'
                      }`}
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
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No input files found. Upload a file to get started.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

