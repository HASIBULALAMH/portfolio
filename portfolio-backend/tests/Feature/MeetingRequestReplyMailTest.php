<?php

namespace Tests\Feature;

use App\Mail\MeetingRequestReplyMail;
use App\Models\MeetingRequest;
use App\Services\MeetingRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The reply Mailable is transport-agnostic: swapping MAIL_MAILER from log to
 * resend must not change what is sent. These tests assert the Mailable's
 * contract (recipient, subject, rendered body, and the admin_note exclusion)
 * independently of which mailer is configured.
 */
class MeetingRequestReplyMailTest extends TestCase
{
    use RefreshDatabase;

    private function makeRequest(array $attributes = []): MeetingRequest
    {
        return MeetingRequest::query()->create(array_merge([
            'name' => 'Jane Client',
            'email' => 'jane@example.com',
            'message' => 'Can we talk next week?',
            'status' => MeetingRequest::STATUS_PENDING,
        ], $attributes));
    }

    public function test_reply_sends_the_mailable_to_the_requester(): void
    {
        Mail::fake();

        $request = $this->makeRequest();

        app(MeetingRequestService::class)->reply($request, 'Sure — Tuesday at 10:00 works.');

        Mail::assertSent(MeetingRequestReplyMail::class, function ($mail) {
            return $mail->hasTo('jane@example.com')
                && $mail->reply === 'Sure — Tuesday at 10:00 works.'
                && $mail->recipientName === 'Jane Client';
        });
    }

    public function test_reply_is_persisted_and_status_updated(): void
    {
        Mail::fake();

        $request = $this->makeRequest();

        $result = app(MeetingRequestService::class)->reply($request, 'Replying now.');

        $this->assertTrue($result['emailed']);
        $this->assertSame(MeetingRequest::STATUS_REPLIED, $result['request']->status);
        $this->assertSame('Replying now.', $result['request']->admin_reply);
        $this->assertNotNull($result['request']->replied_at);
    }

    public function test_envelope_and_rendered_body_are_mailer_independent(): void
    {
        $request = $this->makeRequest(['name' => 'Sam Buyer']);
        $mailable = MeetingRequestReplyMail::forRequest($request, 'Here is my answer.');

        $this->assertSame('Re: your meeting request', $mailable->envelope()->subject);

        // Rendering exercises the Blade view, which is where a broken template
        // would surface regardless of transport.
        $rendered = $mailable->render();
        $this->assertStringContainsString('Sam Buyer', $rendered);
        $this->assertStringContainsString('Here is my answer.', $rendered);
    }

    public function test_internal_admin_note_never_reaches_the_email(): void
    {
        $request = $this->makeRequest([
            'admin_note' => 'INTERNAL: lowball budget, deprioritise.',
        ]);

        $rendered = MeetingRequestReplyMail::forRequest($request, 'Thanks for reaching out.')
            ->render();

        $this->assertStringNotContainsString('INTERNAL', $rendered);
        $this->assertStringNotContainsString('lowball', $rendered);
    }

    public function test_a_failing_transport_still_saves_the_reply(): void
    {
        // Mirrors a Resend outage or a rejected send: the admin's reply must not
        // be lost just because delivery failed.
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport down'));

        $request = $this->makeRequest();

        $result = app(MeetingRequestService::class)->reply($request, 'Saved despite failure.');

        $this->assertFalse($result['emailed']);
        $this->assertSame('Saved despite failure.', $result['request']->admin_reply);
    }
}
