'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isDestructive = false,
  pendingText,
}) {
  const [isLoading, setIsLoading] = useState(false)

  // Reset between openings so a previous run's spinner doesn't persist.
  useEffect(() => {
    if (open) setIsLoading(false)
  }, [open])

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      // Escape / backdrop click must not fire while the action is in flight.
      onOpenChange={(next) => {
        if (isLoading) return
        onOpenChange(next)
      }}
      label={title}
    >
      <div
        role="alertdialog"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        className="bg-card border border-border rounded-lg shadow-lg max-w-sm w-full p-6 mx-auto"
      >
        <h2 id="alert-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p id="alert-dialog-description" className="text-sm text-muted-foreground mt-2">
          {description}
        </p>
        <div className="flex gap-3 mt-6 justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm rounded-lg text-white transition-colors disabled:opacity-50 ${
              isDestructive
                ? 'bg-destructive hover:bg-red-600'
                : 'bg-primary hover:bg-indigo-700'
            }`}
          >
            {isLoading ? pendingText || `${confirmText}...` : confirmText}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
