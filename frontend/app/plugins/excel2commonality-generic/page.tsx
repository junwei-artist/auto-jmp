'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Excel2CommonalityGenericPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to create-project page with plugin pre-selected
    router.push('/plugins/create-project?plugin=excel2commonality-generic')
  }, [router])

  return (
    <div className="container mx-auto py-8 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="text-gray-600 mt-2">Redirecting to Commonality (Generic) plugin selection...</p>
    </div>
  )
}
