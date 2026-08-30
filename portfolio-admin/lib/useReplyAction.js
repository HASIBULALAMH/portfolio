import { useState } from 'react'
import { apiCall } from '@/lib/api'
import { useToast } from '@/components/ui/toast'

/**
 * The send-a-reply action, shared by the meeting-request and contact-message
 * inboxes.
 *
 * Only the semantics are shared, not the dialog: the two detail modals differ in
 * their non-reply content (meeting requests carry a preferred slot and an internal
 * note with its own endpoint; contact messages carry a read toggle), so folding
 * them into one component would take more parameterisation than it saves. What is
 * genuinely identical is the part that is easy to get wrong:
 *
 *   200 -> success toast, close the dialog, refresh the list
 *   502 -> the reply was saved but never delivered. Show the backend's own message
 *          as an ERROR, adopt the returned record so the row stops lying about its
 *          state, refresh, and keep the dialog open so the admin still has the text
 *          that did not go out in front of them.
 *
 * The toast text always comes from the backend. A hardcoded success string here is
 * what previously reported "Reply sent successfully" over a refused delivery, and
 * duplicating that logic per page would mean fixing it twice.
 *
 * @param {object}   options
 * @param {string}   options.endpoint      API path for the reply.
 * @param {'POST'|'PUT'} [options.method]  Verb the endpoint expects. Defaults to PUT.
 * @param {Function} options.onDelivered   Called after a delivered reply.
 * @param {Function} options.onFailed      Called with the saved record when delivery failed.
 */
export function useReplyAction({ endpoint, method = 'PUT', onDelivered, onFailed }) {
  const { showToast } = useToast()
  const [isSending, setIsSending] = useState(false)

  const send = async (reply) => {
    if (!reply.trim()) {
      showToast('Reply cannot be empty', 'error')
      return { sent: false }
    }

    setIsSending(true)
    const result = await apiCall(method, endpoint, { admin_reply: reply })
    setIsSending(false)

    if (result.success) {
      showToast(result.message || 'Reply sent successfully', 'success')
      await onDelivered?.()
      return { sent: true }
    }

    showToast(result.message || 'Failed to send reply', 'error')

    // A record on the error path means the write landed and only the delivery
    // failed. Its absence means nothing happened (network error, auth), and the
    // dialog must not be disturbed.
    if (result.data) {
      await onFailed?.(result.data)
    }

    return { sent: false }
  }

  return { isSending, send }
}
