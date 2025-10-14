'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Excel2BoxplotV2Page() {
  const router = useRouter()

  useEffect(() => {
    router.push('/plugins/create-project?plugin=excel2boxplotv2')
  }, [router])

  return (
    <div className="container mx-auto py-8 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="text-gray-600 mt-2">Redirecting to plugin selection...</p>
    </div>
  )
}


