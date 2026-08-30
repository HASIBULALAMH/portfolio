<?php

namespace App\Services;

use App\Mail\NewSubmissionMail;
use App\Mail\SubmissionReceivedMail;
use App\Models\ContactInfo;
use App\Models\ContactMessage;
use App\Models\MeetingRequest;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Best-effort emails triggered by a visitor submitting a public form.
 *
 * Two go out per submission, and one entry point sends both so neither can be
 * forgotten on a future endpoint:
 *   1. a notification to the admin  (NewSubmissionMail)
 *   2. an acknowledgment to the visitor (SubmissionReceivedMail)
 *
 * Neither is the admin's eventual reply — that is MeetingRequestReplyMail, sent
 * by hand from the admin panel much later.
 *
 * Sent synchronously. Volume on a portfolio contact form is a handful of
 * submissions a day, so the added latency is not worth a queue worker that has
 * to be kept running. If that changes, make both Mailables implement
 * ShouldQueue and run `php artisan queue:work` — QUEUE_CONNECTION is already
 * `database`, so nothing else needs to change here.
 *
 * Every send swallows its own failures: a submission that is already saved must
 * never turn into a 500 for the visitor just because mail is misconfigured.
 */
class SubmissionNotifier
{
    /**
     * @return array{admin: bool, client: bool}
     */
    public function notifyOfContactMessage(ContactMessage $message): array
    {
        return [
            'admin' => $this->send(
                NewSubmissionMail::forContactMessage($message),
                $this->adminRecipient(),
                'admin notification of a new contact message',
                $message->id,
            ),
            'client' => $this->send(
                SubmissionReceivedMail::forContactMessage($message),
                $message->email,
                'client acknowledgment of a contact message',
                $message->id,
            ),
        ];
    }

    /**
     * @return array{admin: bool, client: bool}
     */
    public function notifyOfMeetingRequest(MeetingRequest $request): array
    {
        return [
            'admin' => $this->send(
                NewSubmissionMail::forMeetingRequest($request),
                $this->adminRecipient(),
                'admin notification of a new meeting request',
                $request->id,
            ),
            'client' => $this->send(
                SubmissionReceivedMail::forMeetingRequest($request),
                $request->email,
                'client acknowledgment of a meeting request',
                $request->id,
            ),
        ];
    }

    /**
     * Resolve the admin's address.
     *
     * ADMIN_NOTIFY_EMAIL wins when set, so a local environment can redirect
     * notifications without editing CMS data. Otherwise this is the address the
     * admin maintains under Contact Info in the admin panel.
     */
    public function adminRecipient(): ?string
    {
        $configured = config('mail.admin_notify_address');

        if (filled($configured)) {
            return $configured;
        }

        $email = ContactInfo::singleton()->email;

        return filled($email) ? $email : null;
    }

    private function send(
        Mailable $mailable,
        ?string $recipient,
        string $kind,
        int|string|null $id,
    ): bool {
        if (! $recipient) {
            Log::warning("No address available to send {$kind}.", [
                'hint' => 'Set ADMIN_NOTIFY_EMAIL or fill contact_info.email.',
                'record_id' => $id,
            ]);

            return false;
        }

        Log::info("Sending {$kind}.", [
            'recipient' => $recipient,
            'record_id' => $id,
        ]);

        try {
            Mail::to($recipient)->send($mailable);
        } catch (\Throwable $e) {
            // Resend rejects every recipient except the account owner until a
            // domain is verified, which surfaces here rather than at config
            // time. That makes this the expected failure for real visitor
            // addresses on a sandbox account.
            Log::error("Failed to send {$kind}.", [
                'recipient' => $recipient,
                'record_id' => $id,
                'exception' => $e->getMessage(),
            ]);

            return false;
        }

        return true;
    }
}
