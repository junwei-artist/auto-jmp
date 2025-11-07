'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, FileText, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { projectApi } from '@/lib/api'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'

export default function CreateFromPdfPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string
  const { t } = useLanguage()
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error(t('drawing.createFromPdf.selectPdfError'))
        return
      }
      setPdfFile(file)
    }
  }

  const handleCreateFromPdf = async () => {
    if (!pdfFile) {
      toast.error(t('drawing.createFromPdf.selectPdfError'))
      return
    }

    try {
      setIsProcessing(true)
      const folder = await projectApi.createDrawingFolderFromPdf(projectId, pdfFile, description.trim() || undefined)
      toast.success(t('drawing.createFromPdf.success'))
      
      // Navigate to summary page first
      router.push(`/projects/${projectId}/drawing-folders/${folder.id}/summary`)
    } catch (error: any) {
      console.error('Failed to create folder from PDF:', error)
      toast.error(error.message || t('drawing.createFromPdf.failed'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          <LanguageSelector />
        </div>
        <h1 className="text-3xl font-bold mb-2">{t('drawing.createFromPdf.title')}</h1>
        <p className="text-gray-600">
          {t('drawing.createFromPdf.description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('drawing.createFromPdf.pdfUpload')}</CardTitle>
          <CardDescription>
            {t('drawing.createFromPdf.pdfUploadDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="pdf-file">{t('drawing.createFromPdf.pdfFile')}</Label>
            <input
              id="pdf-file"
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              disabled={isProcessing}
            />
            {pdfFile && (
              <p className="mt-2 text-sm text-gray-600">{t('drawing.createFromPdf.selected')} {pdfFile.name}</p>
            )}
          </div>
          
          <div>
            <Label htmlFor="description">{t('drawing.createFromPdf.descriptionLabel')}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('drawing.createFromPdf.descriptionPlaceholder')}
              className="mt-1"
              disabled={isProcessing}
            />
          </div>

          <Button 
            onClick={handleCreateFromPdf} 
            disabled={isProcessing || !pdfFile}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('drawing.createFromPdf.processing')}
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                {t('drawing.createFromPdf.processButton')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

