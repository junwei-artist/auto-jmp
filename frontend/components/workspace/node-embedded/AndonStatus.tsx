'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type AndonStatus = 'ready' | 'processing' | 'complete' | 'error' | 'idle'

interface AndonStatusProps {
  inputStatus: AndonStatus
  processStatus: AndonStatus
  outputStatus: AndonStatus
  size?: 'sm' | 'md' | 'lg'
  onInputClick?: () => void
  onProcessClick?: () => void
  onOutputClick?: () => void
}

const statusColors = {
  ready: 'bg-green-500',
  processing: 'bg-yellow-500 animate-pulse',
  complete: 'bg-green-500',
  error: 'bg-red-500',
  idle: 'bg-gray-300'
}

const statusLabels = {
  ready: 'Ready',
  processing: 'Processing',
  complete: 'Complete',
  error: 'Error',
  idle: 'Idle'
}

export default function AndonStatus({ 
  inputStatus, 
  processStatus, 
  outputStatus,
  size = 'sm',
  onInputClick,
  onProcessClick,
  onOutputClick
}: AndonStatusProps) {
  const dotSizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3'
  }

  const containerSize = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2'
  }

  const textSizeClasses = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm'
  }

  return (
    <div className={cn('flex items-center', containerSize[size])}>
      {/* Input Status Button */}
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'h-6 w-6 p-0 rounded flex items-center justify-center text-white font-semibold',
          statusColors[inputStatus],
          'hover:opacity-80 transition-opacity'
        )}
        title={`Input: ${statusLabels[inputStatus]}`}
        onClick={onInputClick}
      >
        <span className={textSizeClasses[size]}>I</span>
      </Button>

      {/* Process Status Button */}
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'h-6 w-6 p-0 rounded flex items-center justify-center text-white font-semibold',
          statusColors[processStatus],
          'hover:opacity-80 transition-opacity'
        )}
        title={`Process: ${statusLabels[processStatus]}`}
        onClick={onProcessClick}
      >
        <span className={textSizeClasses[size]}>P</span>
      </Button>

      {/* Output Status Button */}
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'h-6 w-6 p-0 rounded flex items-center justify-center text-white font-semibold',
          statusColors[outputStatus],
          'hover:opacity-80 transition-opacity'
        )}
        title={`Output: ${statusLabels[outputStatus]}`}
        onClick={onOutputClick}
      >
        <span className={textSizeClasses[size]}>O</span>
      </Button>
    </div>
  )
}

