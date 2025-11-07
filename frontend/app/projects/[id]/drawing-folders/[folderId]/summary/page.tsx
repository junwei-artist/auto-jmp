'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, CheckCircle2, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectApi } from '@/lib/api'

interface Annotation {
  image: string
  label: string
  class_id: number
  bbox: [number, number, number, number]
  yolo: [number, number, number, number, number]
  region?: [number, number, number, number]
}

export default function DrawingSummaryPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string
  const folderId = params?.folderId as string

  const [isLoading, setIsLoading] = useState(true)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [metadata, setMetadata] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true)
        const data = await projectApi.getDrawingAnnotations(projectId, folderId)
        setAnnotations(data.annotations || [])
        setMetadata(data.metadata || {})
      } catch (e: any) {
        console.error(e)
        toast.error(e.message || 'Failed to load summary')
      } finally {
        setIsLoading(false)
      }
    }
    if (projectId && folderId) {
      load()
    }
  }, [projectId, folderId])

  const grouped = useMemo(() => {
    const byPage: Record<string, Annotation[]> = {}
    for (const ann of annotations) {
      if (!byPage[ann.image]) byPage[ann.image] = []
      byPage[ann.image].push(ann)
    }
    const items = Object.entries(byPage)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([image, anns]) => {
        const pageNum = image.replace(/.*_page_(\d+)\.png/, '$1')
        return { image, pageNum, count: anns.length }
      })
    return items
  }, [annotations])

  const totalPages = metadata?.total_pages || grouped.length
  const perPageCounts = metadata?.per_page_counts as Record<string, number> | undefined

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button onClick={() => router.push(`/projects/${projectId}/drawing-folders/${folderId}/annotate`)}>
            <FileText className="mr-2 h-4 w-4" />
            Continue to Annotation Editor
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>PDF Processing Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Loading summary...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-gray-50">
                  <div className="text-sm text-gray-600">Total Pages Detected</div>
                  <div className="text-2xl font-semibold">{totalPages}</div>
                </div>
                <div className="p-4 rounded-lg border bg-gray-50">
                  <div className="text-sm text-gray-600">Pages with FAI Annotations</div>
                  <div className="text-2xl font-semibold">{grouped.length}</div>
                </div>
                <div className="p-4 rounded-lg border bg-gray-50">
                  <div className="text-sm text-gray-600">Total FAI Annotations</div>
                  <div className="text-2xl font-semibold">{annotations.length}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Per-page annotation counts</div>
                <div className="rounded-lg border divide-y">
                  {Array.from({ length: totalPages || grouped.length }).map((_, idx) => {
                    const pageIndex = idx + 1
                    const item = grouped.find(g => g.pageNum === String(pageIndex))
                    const count = item?.count || perPageCounts?.[pageIndex] || 0
                    return (
                      <div key={pageIndex} className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Page {pageIndex}</span>
                          {count > 0 && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        </div>
                        <div className="text-sm text-gray-700">{count} annotation{count !== 1 ? 's' : ''}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="pt-4">
                <Button className="w-full" onClick={() => router.push(`/projects/${projectId}/drawing-folders/${folderId}/annotate`)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Continue to Annotation Editor
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


