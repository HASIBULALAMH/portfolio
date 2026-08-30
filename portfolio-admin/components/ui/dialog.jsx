'use client'

import * as React from 'react'
import { X } from 'lucide-react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Tracks nesting order so that when a confirmation dialog opens on top of
// another dialog, only the topmost one reacts to Escape and traps Tab.
const dialogStack = []

const Dialog = ({ open, onOpenChange, children, label = 'Dialog' }) => {
  const panelRef = React.useRef(null)
  const previouslyFocused = React.useRef(null)
  const idRef = React.useRef({})

  React.useEffect(() => {
    if (!open) return
    const token = idRef.current
    dialogStack.push(token)
    return () => {
      const idx = dialogStack.indexOf(token)
      if (idx !== -1) dialogStack.splice(idx, 1)
    }
  }, [open])

  const isTopmost = () => dialogStack[dialogStack.length - 1] === idRef.current

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else if (dialogStack.length === 0) {
      document.body.style.overflow = 'unset'
    }
    return () => {
      if (dialogStack.length <= 1) {
        document.body.style.overflow = 'unset'
      }
    }
  }, [open])

  // Move focus into the dialog on open and restore it to the trigger on close.
  React.useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement
    const panel = panelRef.current
    const first = panel?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus()

    return () => {
      const toRestore = previouslyFocused.current
      if (toRestore && typeof toRestore.focus === 'function' && document.contains(toRestore)) {
        toRestore.focus()
      }
    }
  }, [open])

  // Escape closes; Tab/Shift+Tab cycle within the dialog instead of escaping to
  // the page behind it.
  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (e) => {
      if (!isTopmost()) return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
        return
      }

      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (focusable.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      // Focus sitting outside the panel (e.g. still on the trigger) is pulled
      // back in rather than tabbing away into the page behind.
      if (!panel.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
        return
      }

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg p-4 outline-none"
      >
        {children}
      </div>
    </>
  )
}

const DialogContent = ({ children, className = '' }) => (
  <div className={`relative bg-card border border-border rounded-lg shadow-lg p-6 ${className}`}>
    {children}
  </div>
)

const DialogHeader = ({ children, className = '' }) => (
  <div className={`mb-4 ${className}`}>{children}</div>
)

const DialogTitle = ({ children, className = '' }) => (
  <h2 className={`text-lg font-semibold ${className}`}>{children}</h2>
)

const DialogClose = ({ onClose, className = '' }) => (
  <button
    type="button"
    onClick={onClose}
    aria-label="Close dialog"
    className={`absolute top-2 right-2 p-2 hover:bg-muted rounded ${className}`}
  >
    <X className="w-4 h-4" />
  </button>
)

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
}
