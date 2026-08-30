<?php

namespace Tests\Unit;

use App\Mail\NewSubmissionMail;
use App\Mail\SubmissionReceivedMail;
use App\Models\ContactMessage;
use App\Models\MeetingRequest;
use App\Services\SubmissionNotifier;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * SubmissionNotifier's per-recipient outcome map and its recipient resolution.
 *
 * Unit, not integration: the models here are constructed in memory and never
 * saved, and no test touches the database. `RefreshDatabase` is deliberately
 * absent — including it would hide the fact that this logic needs no persistence
 * at all, and would make the suite 20x slower for no added coverage.
 *
 * The behaviour under test is the part a visitor's experience depends on: every
 * send swallows its own failure and reports it as a boolean, so a submission that
 * is already committed can never turn into a 500 because mail is misconfigured.
 * `tests/Feature/PublicSubmissionIntegrationTest.php` covers the same contract
 * with a real row behind it.
 */
class SubmissionNotifierTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Pinned so adminRecipient() never falls through to ContactInfo::singleton(),
        // which would be a database read. The fallback path itself is covered in
        // the integration suite, where a real row exists.
        config(['mail.admin_notify_address' => 'admin@example.test']);
    }

    private function contactMessage(array $attributes = []): ContactMessage
    {
        $message = new ContactMessage(array_merge([
            'name' => 'Dana Sender',
            'email' => 'dana@example.com',
            'subject' => 'Project inquiry',
            'message' => 'Are you available?',
        ], $attributes));

        // Set without saving: the notifier only reads the id for its log context.
        $message->id = 101;

        return $message;
    }

    private function meetingRequest(array $attributes = []): MeetingRequest
    {
        $request = new MeetingRequest(array_merge([
            'name' => 'Jane Client',
            'email' => 'jane@example.com',
            'message' => 'Can we talk next week?',
            'status' => MeetingRequest::STATUS_PENDING,
        ], $attributes));

        $request->id = 202;

        return $request;
    }

    public function test_a_contact_submission_sends_both_emails_and_reports_both_delivered(): void
    {
        Mail::fake();

        $result = app(SubmissionNotifier::class)->notifyOfContactMessage($this->contactMessage());

        $this->assertSame(['admin' => true, 'client' => true], $result);

        // Two distinct Mailables, two distinct recipients. A swap here would send
        // the visitor the admin's notification, exposing the inbox's own framing.
        Mail::assertSent(NewSubmissionMail::class, fn ($mail) => $mail->hasTo('admin@example.test'));
        Mail::assertSent(SubmissionReceivedMail::class, fn ($mail) => $mail->hasTo('dana@example.com'));
    }

    public function test_a_meeting_submission_sends_both_emails_and_reports_both_delivered(): void
    {
        Mail::fake();

        $result = app(SubmissionNotifier::class)->notifyOfMeetingRequest($this->meetingRequest());

        $this->assertSame(['admin' => true, 'client' => true], $result);
        Mail::assertSent(NewSubmissionMail::class, fn ($mail) => $mail->hasTo('admin@example.test'));
        Mail::assertSent(SubmissionReceivedMail::class, fn ($mail) => $mail->hasTo('jane@example.com'));
    }

    public function test_a_refused_transport_reports_false_instead_of_throwing(): void
    {
        // This is the whole reason the notifier returns booleans rather than void:
        // the record is already committed when it is called, so an exception
        // escaping here would 500 a submission that was successfully saved.
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport refused recipient'));

        $result = app(SubmissionNotifier::class)->notifyOfContactMessage($this->contactMessage());

        $this->assertSame(['admin' => false, 'client' => false], $result);
    }

    public function test_a_failure_on_one_email_does_not_suppress_the_other(): void
    {
        // Resend refuses arbitrary visitor addresses while accepting the account
        // owner's, so exactly this split is the sandbox's normal behaviour: the
        // admin notification lands, the client acknowledgment does not.
        Mail::shouldReceive('to')->with('admin@example.test')->once()->andReturnSelf();
        Mail::shouldReceive('to')->with('dana@example.com')->once()->andReturnSelf();
        Mail::shouldReceive('send')->once()->andReturnNull();
        Mail::shouldReceive('send')->once()->andThrow(new \RuntimeException('refused'));

        $result = app(SubmissionNotifier::class)->notifyOfContactMessage($this->contactMessage());

        $this->assertTrue($result['admin'], 'the admin notification was accepted and must report true');
        $this->assertFalse($result['client'], 'the client acknowledgment was refused and must report false');
    }

    public function test_a_missing_client_address_is_reported_rather_than_attempted(): void
    {
        // email is required on both public forms, so this only happens for a row
        // written another way — but "no recipient" must not become a send to ''.
        Mail::fake();

        $result = app(SubmissionNotifier::class)->notifyOfContactMessage(
            $this->contactMessage(['email' => null]),
        );

        $this->assertTrue($result['admin']);
        $this->assertFalse($result['client']);
        Mail::assertNotSent(SubmissionReceivedMail::class);
    }

    public function test_the_configured_admin_address_wins_over_the_cms_value(): void
    {
        // ADMIN_NOTIFY_EMAIL exists so a local environment can redirect
        // notifications without editing CMS data; if the CMS won instead, a
        // developer's test submissions would email the real admin.
        config(['mail.admin_notify_address' => 'override@example.test']);

        $this->assertSame('override@example.test', app(SubmissionNotifier::class)->adminRecipient());
    }

    public function test_a_blank_configured_address_is_treated_as_unset(): void
    {
        // An empty ADMIN_NOTIFY_EMAIL= line in .env yields '' rather than null, and
        // `filled()` is what stops that from being used as a recipient. The
        // fallback to ContactInfo is asserted in the integration suite, where the
        // row exists; here it is enough that '' does not win.
        config(['mail.admin_notify_address' => '']);

        Log::spy();

        $notifier = new SubmissionNotifier;

        $this->assertNotSame('', $notifier->adminRecipient());
    }

    public function test_a_failed_send_is_logged_at_error_level(): void
    {
        // The dispatch log pair is the only observability the public forms have —
        // the visitor is deliberately told nothing about delivery — so a silent
        // swallow would make a misconfigured mailer undiagnosable.
        Log::spy();
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport refused recipient'));

        app(SubmissionNotifier::class)->notifyOfContactMessage($this->contactMessage());

        Log::shouldHaveReceived('error')
            ->withArgs(fn (string $message, array $context = []) => str_contains($message, 'Failed to send')
                && ($context['exception'] ?? '') === 'transport refused recipient')
            ->atLeast()->once();
    }
}
