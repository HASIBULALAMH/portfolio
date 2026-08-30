'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiCall } from '@/lib/api'
import { useReplyAction } from '@/lib/useReplyAction'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/admin/EmptyState'
import { ListSkeleton } from '@/components/admin/Skeleton'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Calendar, Trash2, Loader2, X, Send, Lock, StickyNote, MailWarning } from 'lucide-react'

export default function MeetingRequestsPage() {
  const { showToast } = useToast()
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [replyMessage, setReplyMessage] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null })

  const loadRequests = useCallback(async () => {
    setIsLoading(true)
    const result = await apiCall('GET', '/admin/meeting-requests')
    if (result.success) {
      setRequests(Array.isArray(result.data) ? result.data : [])
      setLoadError(false)
    } else {
      setLoadError(true)
      showToast(result.message || 'Failed to load meeting requests', 'error')
    }
    setIsLoading(false)
  }, [showToast])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const openRequest = (request) => {
    setSelectedRequest(request)
    setReplyMessage(request.admin_reply || '')
    setAdminNote(request.admin_note || '')
  }

  const closeRequest = () => {
    setSelectedRequest(null)
    setReplyMessage('')
    setAdminNote('')
  }

  const { isSending, send: sendReply } = useReplyAction({
    endpoint: `/admin/meeting-requests/${selectedRequest?.id}/reply`,
    method: 'PUT',
    onDelivered: async () => {
      closeRequest()
      await loadRequests()
    },
    onFailed: async (saved) => {
      setSelectedRequest(saved)
      await loadRequests()
    },
  })

  const handleDelete = async (id) => {
    const result = await apiCall('DELETE', `/admin/meeting-requests/${id}`)
    if (result.success) {
      showToast('Request deleted', 'success')
      closeRequest()
      await loadRequests()
    } else {
      showToast(result.message || 'Failed to delete', 'error')
    }
    setDeleteDialog({ open: false, id: null })
  }

  const handleSendReply = async () => {
    await sendReply(replyMessage)
  }

  // The internal note is saved on its own endpoint so it can never be bundled
  // into the email that goes out to the requester.
  const handleSaveNote = async () => {
    setIsSavingNote(true)
    const result = await apiCall(
      'PUT',
      `/admin/meeting-requests/${selectedRequest.id}/note`,
      { admin_note: adminNote }
    )
    setIsSavingNote(false)

    if (result.success) {
      showToast('Internal note saved', 'success')
      setSelectedRequest((current) =>
        current ? { ...current, admin_note: adminNote } : current
      )
      setRequests((current) =>
        current.map((r) =>
          r.id === selectedRequest.id ? { ...r, admin_note: adminNote } : r
        )
      )
    } else {
      showToast(result.message || 'Failed to save note', 'error')
    }
  }

  const noteChanged = selectedRequest
    ? adminNote !== (selectedRequest.admin_note || '')
    : false

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Meeting Requests</h1>
        <p className="text-muted-foreground mt-2">Manage meeting request inquiries</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : loadError ? (
            <EmptyState
              type="items"
              title="Couldn't load meeting requests"
              description="Something went wrong fetching your requests. Check your connection and try again."
            />
          ) : requests.length === 0 ? (
            <EmptyState
              type="inbox"
              icon={Calendar}
              title="No Meeting Requests Yet"
              description="Meeting requests submitted from your site will appear here"
            />
          ) : (
            <div className="space-y-2">
              {requests.map((request) => (
                <div
                  key={request.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRequest(request)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openRequest(request)
                    }
                  }}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                    request.status === 'replied' ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-primary mt-1 flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{request.name}</p>
                      <p className="text-sm text-muted-foreground break-all">{request.email}</p>
                      <p className="text-sm mt-1">Requested: {request.preferred_time || '—'}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Status: <span className={request.status === 'replied' ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                          {request.status || 'pending'}
                        </span>
                      </p>
                    </div>
                    {request.delivery_failed_at && (
                      <span
                        title="Delivery failed — retry"
                        className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium shrink-0"
                      >
                        <MailWarning className="w-3.5 h-3.5" aria-hidden="true" />
                        Delivery failed
                      </span>
                    )}
                    {request.admin_note && (
                      <span
                        title="Has an internal note"
                        className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
                      >
                        <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
                        Note
                      </span>
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
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) closeRequest()
        }}
        label="Meeting request details"
      >
        {selectedRequest && (
          <Card className="w-full max-h-[85vh] overflow-y-auto">
            <CardHeader className="flex items-center justify-between sticky top-0 bg-card z-10">
              <CardTitle>Meeting Request Details</CardTitle>
              <button
                type="button"
                onClick={closeRequest}
                aria-label="Close details"
                className="p-2 hover:bg-muted rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{selectedRequest.name}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium break-all">{selectedRequest.email}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Preferred Time</p>
                <p className="font-medium">{selectedRequest.preferred_time || '—'}</p>
              </div>

              {selectedRequest.message && (
                <div>
                  <p className="text-sm text-muted-foreground">Message</p>
                  <p className="mt-2 p-3 bg-muted rounded text-sm whitespace-pre-wrap">{selectedRequest.message}</p>
                </div>
              )}

              <div className="border-t border-border pt-4">
                <label htmlFor="meeting-reply" className="text-sm text-muted-foreground">
                  Reply to requester
                </label>
                <Textarea
                  id="meeting-reply"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type your reply here..."
                  rows={4}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This text is sent to {selectedRequest.email}.
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <label
                  htmlFor="meeting-admin-note"
                  className="text-sm text-muted-foreground flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  Internal note (admin only)
                </label>
                <Textarea
                  id="meeting-admin-note"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Private notes — e.g. availability, context, follow-up plans"
                  rows={3}
                  className="mt-2"
                />
                <div className="flex items-center justify-between mt-2 gap-2">
                  <p className="text-xs text-muted-foreground">
                    Never shown to the requester.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSaveNote}
                    disabled={isSavingNote || !noteChanged}
                  >
                    {isSavingNote ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" aria-hidden="true" />
                        Saving...
                      </>
                    ) : (
                      'Save note'
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 justify-between pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteDialog({ open: true, id: selectedRequest.id })}
                >
                  <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={closeRequest}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSendReply}
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
        title="Delete Meeting Request"
        description="This action cannot be undone. Are you sure?"
        confirmText="Delete"
        pendingText="Deleting..."
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => handleDelete(deleteDialog.id)}
      />
    </div>
  )
}
