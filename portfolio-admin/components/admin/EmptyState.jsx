'use client'

import { AlertCircle, Inbox, PlusCircle } from 'lucide-react'

const emptyStateIcons = {
  inbox: Inbox,
  items: AlertCircle,
  add: PlusCircle,
}

export function EmptyState({ 
  type = 'items', 
  title = 'No items yet',
  description = 'Get started by creating your first item',
  icon = emptyStateIcons[type]
}) {
  const Icon = icon || AlertCircle

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4 p-4 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-full">
        <Icon className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm">{description}</p>
    </div>
  )
}
