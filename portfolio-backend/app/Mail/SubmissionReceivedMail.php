<?php

namespace App\Mail;

use App\Models\ContactMessage;
use App\Models\MeetingRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Instant "we got it" acknowledgment sent to the visitor who submitted the
 * contact or meeting-request form.
 *
 * Distinct from MeetingRequestReplyMail: that one carries the admin's actual
 * response and is sent later, by hand. This one is automatic and says nothing
 * more than "your submission arrived".
 *
 * Sent synchronously — see the note in SubmissionNotifier.
 */
class SubmissionReceivedMail extends Mailable
{
    use Queueable, SerializesModels;

    public const TYPE_CONTACT = 'contact';
    public const TYPE_MEETING = 'meeting';

    private function __construct(
        public readonly string $type,
        public readonly string $recipientName,
        /** What they wrote about — contact submissions only. */
        public readonly ?string $subjectLine = null,
        /** The slot they asked for — meeting requests only. */
        public readonly ?string $requestedSlot = null,
    ) {}

    public static function forContactMessage(ContactMessage $message): self
    {
        return new self(
            type: self::TYPE_CONTACT,
            recipientName: $message->name,
            subjectLine: $message->subject,
        );
    }

    public static function forMeetingRequest(MeetingRequest $request): self
    {
        // preferred_date is cast to a Carbon date and preferred_time is a plain
        // string column; both are optional on the form, so the slot may be
        // partial or absent entirely.
        $slot = collect([
            $request->preferred_date?->toFormattedDateString(),
            $request->preferred_time,
        ])->filter()->implode(' at ');

        return new self(
            type: self::TYPE_MEETING,
            recipientName: $request->name,
            requestedSlot: $slot !== '' ? $slot : null,
        );
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->type === self::TYPE_MEETING
                ? 'We received your meeting request'
                : 'We received your message',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.submission-received',
            with: [
                'isMeeting' => $this->type === self::TYPE_MEETING,
                'recipientName' => $this->recipientName,
                'subjectLine' => $this->subjectLine,
                'requestedSlot' => $this->requestedSlot,
            ],
        );
    }
}
