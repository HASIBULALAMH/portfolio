<?php

namespace App\Services;

use App\Mail\MeetingRequestReplyMail;
use App\Models\MeetingRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class MeetingRequestService
{
    /**
     * Record the admin's reply and email it to the requester.
     *
     * The reply text is committed before the send is attempted, so a transport
     * failure never loses what the admin typed. Everything that claims the client
     * was actually reached — `status` and `replied_at` — is written only after a
     * successful send. Writing them up front was the original defect: a refused
     * delivery and a delivered one both read as "replied" in the inbox.
     *
     * `delivery_failed_at` is stamped on failure and cleared on a later success,
     * so retrying until it lands makes the indicator go away on its own.
     *
     * @return array{request: MeetingRequest, emailed: bool}
     */
    public function reply(MeetingRequest $meetingRequest, string $reply): array
    {
        $meetingRequest->update(['admin_reply' => $reply]);

        $emailed = true;

        // Logged before the attempt so a hard failure (timeout, killed process)
        // still leaves a record of who the mail was addressed to.
        Log::info('Sending meeting request reply.', [
            'meeting_request_id' => $meetingRequest->id,
            'recipient' => $meetingRequest->email,
            'subject' => 'Re: your meeting request',
        ]);

        try {
            Mail::to($meetingRequest->email)->send(
                MeetingRequestReplyMail::forRequest($meetingRequest, $reply),
            );
        } catch (\Throwable $e) {
            $emailed = false;

            // Resend refuses any recipient other than the account owner until a
            // domain is verified at resend.com/domains; that rejection lands
            // here, with the reason in the exception message.
            Log::error('Failed to email meeting request reply.', [
                'meeting_request_id' => $meetingRequest->id,
                'recipient' => $meetingRequest->email,
                'exception' => $e->getMessage(),
            ]);
        }

        // On failure `status` is deliberately left alone rather than forced back
        // to pending: a request that was successfully replied to earlier and then
        // fails a retry is still replied, and only the new failure is news.
        $meetingRequest->update($emailed
            ? [
                'status' => MeetingRequest::STATUS_REPLIED,
                'replied_at' => now(),
                'delivery_failed_at' => null,
            ]
            : [
                'delivery_failed_at' => now(),
            ]);

        return [
            'request' => $meetingRequest->refresh(),
            'emailed' => $emailed,
        ];
    }

    /** Save the internal note. Never emailed, and clearing it is allowed. */
    public function saveNote(MeetingRequest $meetingRequest, ?string $note): MeetingRequest
    {
        $meetingRequest->update(['admin_note' => $note]);

        return $meetingRequest->refresh();
    }
}
