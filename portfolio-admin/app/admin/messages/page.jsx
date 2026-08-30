'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiCall } from '@/lib/api'
import { useReplyAction } from '@/lib/useReplyAction'
import { useToast } from '@/components/ui/toast'
import { EmptyState } from '@/components/admin/EmptyState'
import { ListSkeleton } from '@/components/admin/Skeleton'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Mail, Trash2, X, Send, Loader2, MailWarning } from 'lucide-react'

export default function MessagesPage() {
  const { showToast } = useToast()
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [replyMessage, setReplyMessage] = useState('')
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null })

  const loadMessages = useCallback(async () => {
    setIsLoading(true)
    const result = await apiCall('GET', '/admin/messages')
    if (result.success) {
      setMessages(Array.isArray(result.data) ? result.data : [])
      setLoadError(false)
    } else {
      setLoadError(true)
      showToast(result.message || 'Failed to load messages', 'error')
    }
    setIsLoading(false)
  }, [showToast])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const openMessage = (message) => {
    setSelectedMessage(message)
    setReplyMessage(message.admin_reply || '')
  }

  const closeMessage = () => {
    setSelectedMessage(null)
    setReplyMessage('')
  }

  const { isSending, send: sendReply } = useReplyAction({
    endpoint: `/admin/contact-messages/${selectedMessage?.id}/reply`,
    method: 'POST',
    onDelivered: async () => {
      closeMessage()
      await loadMessages()
    },
    onFailed: async (saved) => {
      setSelectedMessage(saved)
      await loadMessages()
    },
  })

  const handleDelete = async (id) => {
    const result = await apiCall('DELETE', `/admin/messages/${id}`)
    if (result.success) {
      showToast('Message deleted', 'success')
      closeMessage()
      await loadMessages()
    } else {
      showToast(result.message || 'Failed to delete', 'error')
    }
    setDeleteDialog({ open: false, id: null })
  }

  const handleToggleRead = async (id) => {
    const result = await apiCall('PUT', `/admin/messages/${id}/read`)
    if (result.success) {
      // Keep the detail panel open. It used to be closed on every toggle, which
      // dumped you back to the list mid-read and gave no confirmation that
      // anything had happened. The endpoint returns the updated message, so the
      // panel can just adopt it.
      if (result.data) {
        setSelectedMessage(result.data)
      }
      await loadMessages()
      showToast(result.message || 'Message updated', 'success')
    } else {
      showToast(result.message || 'Failed to update message', 'error')
    }
  }

  const formatDate = (value, withTime = false) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return withTime ? date.toLocaleString() : date.toLocaleDateString()
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Contact Messages</h1>
        <p className="text-muted-foreground mt-2">Messages from your contact form</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : loadError ? (
            <EmptyState
              type="items"
              title="Couldn't load messages"
              description="Something went wrong fetching your messages. Check your connection and try again."
            />
          ) : messages.length === 0 ? (
            <EmptyState
              type="inbox"
              title="No Messages Yet"
              description="Contact messages from your site will appear here"
              icon={Mail}
            />
          ) : (
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMessage(message)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openMessage(message)
                    }
                  }}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                    !message.is_read ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-primary mt-1 flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${!message.is_read ? 'text-primary' : ''}`}>
                        {message.name}
                      </p>
                      <p className="text-sm text-muted-foreground break-all">{message.email}</p>
                      <p className="text-sm mt-2 truncate">{message.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(message.created_at)}
                      </p>
                    </div>
                    {message.delivery_failed_at && (
                      <span
                        title="Delivery failed — retry"
                        className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium shrink-0"
                      >
                        <MailWarning className="w-3.5 h-3.5" aria-hidden="true" />
                        Delivery failed
                      </span>
                    )}
                    {!message.delivery_failed_at && message.replied_at && (
                      <span
                        title="Replied"
                        className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        Replied
                      </span>
                    )}
                    {!message.is_read && (
                      <>
                        <span className="sr-only">Unread</span>
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" aria-hidden="true" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog
        open={Boolean(selectedMessage)}
        onOpenChange={(open) => {
          if (!open) closeMessage()
        }}
        label="Message details"
      >
        {selectedMessage && (
          <Card className="w-full max-h-[85vh] overflow-y-auto">
            <CardHeader className="flex items-center justify-between sticky top-0 bg-card z-10">
              <CardTitle>Message Details</CardTitle>
              <button
                type="button"
                onClick={closeMessage}
                aria-label="Close details"
                className="p-2 hover:bg-muted rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{selectedMessage.name}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium break-all">{selectedMessage.email}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">{formatDate(selectedMessage.created_at, true)}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Message</p>
                <p className="mt-2 p-3 bg-muted rounded text-sm whitespace-pre-wrap">{selectedMessage.message}</p>
              </div>

              <div className="border-t border-border pt-4">
                <label htmlFor="message-reply" className="text-sm text-muted-foreground">
                  Reply to sender
                </label>
                <Textarea
                  id="message-reply"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type your reply here..."
                  rows={4}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This text is sent to {selectedMessage.email}.
                </p>
                {selectedMessage.delivery_failed_at && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1.5">
                    <MailWarning className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    The last attempt was not delivered. Sending again will retry.
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-between pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleToggleRead(selectedMessage.id)}
                >
                  {selectedMessage.is_read ? 'Mark Unread' : 'Mark Read'}
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeMessage}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteDialog({ open: true, id: selectedMessage.id })}
                  >
                    <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                    Delete
                  </Button>
                  <Button
                    type="button"
                    onClick={() => sendReply(replyMessage)}
                    disabled={isSending || !replyMessage.trim()}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" aria-hidden="true" />
                        Send Reply
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </Dialog>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Delete Message"
        description="This action cannot be undone. The message will be permanently deleted."
        confirmText="Delete"
        pendingText="Deleting..."
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => handleDelete(deleteDialog.id)}
      />
    </div>
  )
}
