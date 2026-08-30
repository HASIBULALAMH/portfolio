<?php

namespace App\Services;

use App\Mail\ContactMessageReplyMail;
use App\Models\ContactMessage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class ContactMessageService
{
    /**
     * Record the admin's reply and email it to the sender.
     *
     * Deliberately the same shape as MeetingRequestService::reply — the reply text
     * is committed before the send is attempted so a transport failure never loses
     * what the admin typed, and only a successful send stamps `replied_at`.
     * `delivery_failed_at` is set on failure and cleared on a later success, so
     * retrying until it lands makes the inbox indicator go away on its own.
     *
     * @return array{message: ContactMessage, emailed: bool}
     */
    public function reply(ContactMessage $message, string $reply): array
    {
        $message->update(['admin_reply' => $reply]);

        $emailed = true;

        // Logged before the attempt so a hard failure (timeout, killed process)
        // still leaves a record of who the mail was addressed to.
        Log::info('Sending contact message reply.', [
            'contact_message_id' => $message->id,
            'recipient' => $message->email,
        ]);

        try {
            Mail::to($message->email)->send(
                ContactMessageReplyMail::forMessage($message, $reply),
            );
        } catch (\Throwable $e) {
            $emailed = false;

            // Resend refuses any recipient other than the account owner until a
            // domain is verified at resend.com/domains; that rejection lands here,
            // with the reason in the exception message.
            Log::error('Failed to email contact message reply.', [
                'contact_message_id' => $message->id,
                'recipient' => $message->email,
                'exception' => $e->getMessage(),
            ]);
        }

        $message->update($emailed
            ? [
                'replied_at' => now(),
                'delivery_failed_at' => null,
            ]
            : [
                'delivery_failed_at' => now(),
            ]);

        return [
            'message' => $message->refresh(),
            'emailed' => $emailed,
        ];
    }
}
