<?php

namespace App\Mail;

use App\Models\ContactMessage;
use App\Models\MeetingRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to the admin when a visitor submits the contact or meeting-request form.
 *
 * One Mailable covers both types: the two notifications differ only in their
 * subject line and which detail rows they show, which is not enough to justify
 * two near-identical classes and views.
 *
 * Sent synchronously — see the note in NotifiesAdminOfSubmissions.
 */
class NewSubmissionMail extends Mailable
{
    use Queueable, SerializesModels;

    public const TYPE_CONTACT = 'contact';
    public const TYPE_MEETING = 'meeting';

    /**
     * @param  array<string, string>  $details  Ordered label => value rows.
     */
    private function __construct(
        public readonly string $type,
        public readonly string $senderName,
        public readonly string $senderEmail,
        public readonly array $details,
        public readonly string $body,
    ) {}

    public static function forContactMessage(ContactMessage $message): self
    {
        return new self(
            type: self::TYPE_CONTACT,
            senderName: (string) ($message->name ?? ''),
            senderEmail: (string) ($message->email ?? ''),
            details: array_filter([
                'Subject' => $message->subject,
            ]),
            body: (string) $message->message,
        );
    }

    public static function forMeetingRequest(MeetingRequest $request): self
    {
        return new self(
            type: self::TYPE_MEETING,
            senderName: (string) ($request->name ?? ''),
            senderEmail: (string) ($request->email ?? ''),
            details: array_filter([
                // preferred_date is cast to a Carbon date; preferred_time is a
                // plain string column. Both are optional on the form.
                'Preferred date' => $request->preferred_date?->toFormattedDateString(),
                'Preferred time' => $request->preferred_time,
            ]),
            body: (string) $request->message,
        );
    }

    public function envelope(): Envelope
    {
        $subject = $this->type === self::TYPE_MEETING
            ? "New meeting request from {$this->senderName}"
            : "New contact message from {$this->senderName}";

        return new Envelope(
            subject: $subject,
            // Hitting reply in the admin's mail client should reach the
            // visitor, not the no-reply sending identity.
            replyTo: [new Address($this->senderEmail, $this->senderName)],
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.new-submission',
            with: [
                'isMeeting' => $this->type === self::TYPE_MEETING,
                'senderName' => $this->senderName,
                'senderEmail' => $this->senderEmail,
                'details' => $this->details,
                'body' => $this->body,
            ],
        );
    }
}
