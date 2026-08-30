<?php

namespace App\Mail;

use App\Models\MeetingRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to the requester when the admin replies to their meeting request.
 *
 * Only $reply is passed to the view. admin_note deliberately never reaches
 * this class, so an internal note cannot leak into an outgoing email.
 */
class MeetingRequestReplyMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $recipientName,
        public readonly string $reply,
    ) {}

    public static function forRequest(MeetingRequest $request, string $reply): self
    {
        return new self($request->name, $reply);
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Re: your meeting request',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.meeting-request-reply',
            with: [
                'recipientName' => $this->recipientName,
                'reply' => $this->reply,
            ],
        );
    }
}
