<?php

namespace App\Mail;

use App\Models\ContactMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to the sender when the admin replies to their contact message.
 *
 * The contact-message counterpart to MeetingRequestReplyMail, deliberately built
 * to the same shape: only the reply text reaches the view, the subject echoes
 * what the sender wrote about, and the from identity is the global one from
 * config/mail.php rather than anything per-message.
 */
class ContactMessageReplyMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $recipientName,
        public readonly string $reply,
        /** What they wrote about, echoed into the subject. Optional on the form. */
        public readonly ?string $subjectLine = null,
    ) {}

    public static function forMessage(ContactMessage $message, string $reply): self
    {
        return new self($message->name, $reply, $message->subject);
    }

    public function envelope(): Envelope
    {
        // Echoing their own subject makes the reply recognisable in a threaded
        // inbox. Without one there is nothing useful to echo, so fall back.
        return new Envelope(
            subject: filled($this->subjectLine)
                ? "Re: {$this->subjectLine}"
                : 'Re: your message',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.contact-message-reply',
            with: [
                'recipientName' => $this->recipientName,
                'reply' => $this->reply,
                'subjectLine' => $this->subjectLine,
            ],
        );
    }
}
