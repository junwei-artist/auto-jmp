'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, disabled = false, id, ...props }, ref) => {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        data-state={checked ? 'checked' : 'unchecked'}
        disabled={disabled}
        className={cn(
          'peer inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border-2 border-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-blue-600 border-blue-600' : 'bg-white',
          className
        )}
        onClick={() => onCheckedChange?.(!checked)}
        ref={ref}
        {...props}
      >
        {checked && (
          <svg
            className="h-3 w-3 text-white"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }

