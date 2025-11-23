'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/Navbar'

export function ConditionalNavbar() {
    const pathname = usePathname()

    // Don't render the legacy navbar on the homepage, community page, workflows page, or workflow editor
    if (pathname === '/' || pathname === '/community' || pathname === '/workflows' || pathname.startsWith('/workflow/')) {
        return null
    }

    return <Navbar />
}
