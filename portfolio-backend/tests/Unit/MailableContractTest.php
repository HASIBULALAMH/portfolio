<?php

namespace Tests\Unit;

use App\Mail\ContactMessageReplyMail;
use App\Mail\MeetingRequestReplyMail;
use App\Mail\NewSubmissionMail;
use App\Mail\SubmissionReceivedMail;
use App\Models\ContactMessage;
use App\Models\MeetingRequest;
use Tests\TestCase;

/**
 * Envelope and payload contracts for all four Mailables, built from in-memory
 * models — no database, no transport.
 *
 * Subjects are covered here rather than in a Feature test because they are pure
 * functions of the record: choosing the subject is a decision the class makes,
 * and it is the part a threaded inbox depends on. Rendered bodies are asserted in
 * the integration suite, where the Blade view and its `nl2br(e())` escaping are
 * exercised end to end.
 */
class MailableContractTest extends TestCase
{
    private function contactMessage(array $attributes = []): ContactMessage
    {
        return new ContactMessage(array_merge([
            'name' => 'Dana Sender',
            'email' => 'dana@example.com',
            'subject' => 'Project inquiry',
            'message' => 'Are you available?',
        ], $attributes));
    }

    private function meetingRequest(array $attributes = []): MeetingRequest
    {
        return new MeetingRequest(array_merge([
            'name' => 'Jane Client',
            'email' => 'jane@example.com',
            'message' => 'Can we talk next week?',
            'status' => MeetingRequest::STATUS_PENDING,
        ], $attributes));
    }

    // ------------------------------------------------------------------
    // NewSubmissionMail — the admin's notification
    // ------------------------------------------------------------------

    public function test_the_admin_notification_names_the_submission_type_and_sender(): void
    {
        $this->assertSame(
            'New contact message from Dana Sender',
            NewSubmissionMail::forContactMessage($this->contactMessage())->envelope()->subject,
        );

        $this->assertSame(
            'New meeting request from Jane Client',
            NewSubmissionMail::forMeetingRequest($this->meetingRequest())->envelope()->subject,
        );
    }

    public function test_the_admin_notification_replies_to_the_visitor(): void
    {
        // Without replyTo, hitting reply in the admin's mail client answers the
        // no-reply sending identity instead of the person who wrote in.
        $envelope = NewSubmissionMail::forContactMessage($this->contactMessage())->envelope();

        $this->assertCount(1, $envelope->replyTo);
        $this->assertSame('dana@example.com', $envelope->replyTo[0]->address);
        $this->assertSame('Dana Sender', $envelope->replyTo[0]->name);
    }

    public function test_the_admin_notification_omits_detail_rows_the_visitor_left_blank(): void
    {
        // array_filter is what keeps an empty "Subject:" or "Preferred time:" row
        // out of the email rather than rendering a label with nothing after it.
        $withoutSubject = NewSubmissionMail::forContactMessage($this->contactMessage(['subject' => null]));
        $this->assertSame([], $withoutSubject->details);

        $withSubject = NewSubmissionMail::forContactMessage($this->contactMessage());
        $this->assertSame(['Subject' => 'Project inquiry'], $withSubject->details);
    }

    public function test_the_admin_notification_formats_a_requested_date(): void
    {
        $mail = NewSubmissionMail::forMeetingRequest($this->meetingRequest([
            'preferred_date' => '2026-09-14',
            'preferred_time' => '2:00 PM',
        ]));

        // preferred_date is cast to Carbon and preferred_time is a plain label, so
        // the two arrive here in different shapes and only one is formatted.
        $this->assertSame('Sep 14, 2026', $mail->details['Preferred date']);
        $this->assertSame('2:00 PM', $mail->details['Preferred time']);
    }

    public function test_the_admin_notification_survives_a_null_message_body(): void
    {
        // message is nullable on the meeting form, and the view interpolates the
        // body directly — a null there would be a TypeError on a committed record.
        $mail = NewSubmissionMail::forMeetingRequest($this->meetingRequest(['message' => null]));

        $this->assertSame('', $mail->body);
    }

    // ------------------------------------------------------------------
    // SubmissionReceivedMail — the visitor's acknowledgment
    // ------------------------------------------------------------------

    public function test_the_acknowledgment_subject_matches_the_submission_type(): void
    {
        $this->assertSame(
            'We received your message',
            SubmissionReceivedMail::forContactMessage($this->contactMessage())->envelope()->subject,
        );

        $this->assertSame(
            'We received your meeting request',
            SubmissionReceivedMail::forMeetingRequest($this->meetingRequest())->envelope()->subject,
        );
    }

    public function test_the_acknowledgment_joins_a_partial_requested_slot(): void
    {
        $dateOnly = SubmissionReceivedMail::forMeetingRequest($this->meetingRequest([
            'preferred_date' => '2026-09-14',
        ]));
        $this->assertSame('Sep 14, 2026', $dateOnly->requestedSlot);

        $timeOnly = SubmissionReceivedMail::forMeetingRequest($this->meetingRequest([
            'preferred_time' => '2:00 PM',
        ]));
        $this->assertSame('2:00 PM', $timeOnly->requestedSlot);

        $both = SubmissionReceivedMail::forMeetingRequest($this->meetingRequest([
            'preferred_date' => '2026-09-14',
            'preferred_time' => '2:00 PM',
        ]));
        $this->assertSame('Sep 14, 2026 at 2:00 PM', $both->requestedSlot);
    }

    public function test_an_absent_slot_is_null_rather_than_an_empty_string(): void
    {
        // The view branches on the slot being present; '' is falsy in Blade but
        // would still take the "has a slot" path in a strict comparison, so the
        // service normalises it to null instead.
        $mail = SubmissionReceivedMail::forMeetingRequest($this->meetingRequest());

        $this->assertNull($mail->requestedSlot);
    }

    // ------------------------------------------------------------------
    // The two reply Mailables
    // ------------------------------------------------------------------

    public function test_a_contact_reply_echoes_the_senders_own_subject(): void
    {
        $mail = ContactMessageReplyMail::forMessage($this->contactMessage(['subject' => 'Contract work']), 'Yes.');

        $this->assertSame('Re: Contract work', $mail->envelope()->subject);
    }

    public function test_a_contact_reply_falls_back_when_the_sender_gave_no_subject(): void
    {
        // subject is nullable on the public form, so 'Re: ' with nothing after it
        // is a reachable state rather than a defensive branch.
        $mail = ContactMessageReplyMail::forMessage($this->contactMessage(['subject' => null]), 'Yes.');

        $this->assertSame('Re: your message', $mail->envelope()->subject);
    }

    public function test_a_blank_subject_string_also_takes_the_fallback(): void
    {
        $mail = ContactMessageReplyMail::forMessage($this->contactMessage(['subject' => '   ']), 'Yes.');

        $this->assertSame('Re: your message', $mail->envelope()->subject);
    }

    public function test_a_meeting_reply_has_a_fixed_subject(): void
    {
        // Meeting requests carry no subject field, so there is nothing to echo.
        $mail = MeetingRequestReplyMail::forRequest($this->meetingRequest(), 'Tuesday works.');

        $this->assertSame('Re: your meeting request', $mail->envelope()->subject);
    }

    public function test_neither_reply_mailable_can_see_the_internal_note(): void
    {
        // Structural, not textual: admin_note is never passed to the constructor,
        // so no template change can leak it. A rendered-body assertion only proves
        // the current view does not print it.
        $meeting = MeetingRequestReplyMail::forRequest(
            $this->meetingRequest(['admin_note' => 'INTERNAL: lowball budget.']),
            'Thanks for reaching out.',
        );

        $payload = $meeting->content()->with;

        $this->assertSame(['recipientName', 'reply'], array_keys($payload));
        $this->assertStringNotContainsString('INTERNAL', json_encode($payload));
    }

    public function test_the_reply_text_reaches_the_view_verbatim(): void
    {
        // Escaping happens in the Blade template, so the payload must carry the
        // admin's exact text — pre-escaping here would double-encode it.
        $reply = "Line one\nLine two & <b>three</b>";

        $mail = ContactMessageReplyMail::forMessage($this->contactMessage(), $reply);

        $this->assertSame($reply, $mail->content()->with['reply']);
    }
}
