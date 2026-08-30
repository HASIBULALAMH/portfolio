<?php

namespace Tests\Unit;

use App\Mail\ContactMessageReplyMail;
use App\Mail\MeetingRequestReplyMail;
use App\Models\ContactMessage;
use App\Models\MeetingRequest;
use App\Services\ContactMessageService;
use App\Services\MeetingRequestService;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The delivery-status decision inside the two reply services, isolated from the
 * database.
 *
 * Why isolate it: the interesting property is an *ordering* one — the reply text
 * is written before the send is attempted, and the fields that claim the client
 * was reached (`status`, `replied_at`) are written only after it succeeds. A
 * database-backed test can assert the final row, but it cannot easily assert that
 * the first write happened before the send, which is the exact defect this logic
 * was built to fix: a single up-front update() made a refused delivery and a
 * delivered one read identically.
 *
 * The models below override update()/refresh() to record calls in memory instead
 * of hitting MySQL, so each write and its order is observable. The persisted
 * result of the same code path is asserted against a real database in
 * tests/Feature/ReplyDeliveryIntegrationTest.php, and end to end in
 * tests/Regression.
 */
class ReplyDeliveryStatusTest extends TestCase
{
    public function test_the_reply_text_is_committed_before_the_send_is_attempted(): void
    {
        $request = $this->recordingMeetingRequest();

        Mail::shouldReceive('to->send')->andReturnUsing(function () use ($request) {
            // Asserted from inside the send: by the time the transport is called,
            // the admin's text must already be persisted, or a timeout or killed
            // process loses what they typed.
            $this->assertSame(
                [['admin_reply' => 'Committed first.']],
                $request->updateCalls,
                'admin_reply must be written before Mail::send is reached',
            );

            return null;
        });

        app(MeetingRequestService::class)->reply($request, 'Committed first.');
    }

    public function test_a_delivered_meeting_reply_writes_the_delivery_claims_after_the_send(): void
    {
        Mail::shouldReceive('to->send')->once()->andReturnNull();

        $request = $this->recordingMeetingRequest();

        $result = app(MeetingRequestService::class)->reply($request, 'Tuesday works.');

        $this->assertTrue($result['emailed']);
        $this->assertCount(2, $request->updateCalls, 'the write is split in two around the send');

        [$first, $second] = $request->updateCalls;

        $this->assertSame(['admin_reply' => 'Tuesday works.'], $first);
        $this->assertSame(MeetingRequest::STATUS_REPLIED, $second['status']);
        $this->assertNotNull($second['replied_at']);
        $this->assertNull($second['delivery_failed_at'], 'a delivered reply clears any earlier failure');
    }

    public function test_a_refused_meeting_reply_never_writes_status_or_replied_at(): void
    {
        // The original defect, asserted at the level where it lived: status and
        // replied_at must not appear in ANY write on the failure path. Asserting
        // only the final row would pass even if they were written and then reverted.
        Mail::shouldReceive('to->send')->once()->andThrow(new \RuntimeException('refused'));

        $request = $this->recordingMeetingRequest();

        $result = app(MeetingRequestService::class)->reply($request, 'Never delivered.');

        $this->assertFalse($result['emailed']);

        foreach ($request->updateCalls as $call) {
            $this->assertArrayNotHasKey('status', $call);
            $this->assertArrayNotHasKey('replied_at', $call);
        }

        $this->assertSame(['delivery_failed_at'], array_keys($request->updateCalls[1]));
        $this->assertNotNull($request->updateCalls[1]['delivery_failed_at']);
    }

    public function test_a_refused_meeting_reply_leaves_an_existing_replied_status_alone(): void
    {
        // A request that was answered successfully earlier and then fails a retry
        // is still replied; only the new failure is news. Forcing status back to
        // pending would erase a true fact.
        Mail::shouldReceive('to->send')->once()->andThrow(new \RuntimeException('refused'));

        $request = $this->recordingMeetingRequest(['status' => MeetingRequest::STATUS_REPLIED]);

        app(MeetingRequestService::class)->reply($request, 'Retry that fails.');

        $this->assertSame(MeetingRequest::STATUS_REPLIED, $request->status);
    }

    public function test_a_delivered_contact_reply_stamps_replied_at_and_clears_the_failure(): void
    {
        Mail::shouldReceive('to->send')->once()->andReturnNull();

        $message = $this->recordingContactMessage();

        $result = app(ContactMessageService::class)->reply($message, 'Answering.');

        $this->assertTrue($result['emailed']);
        $this->assertCount(2, $message->updateCalls);
        $this->assertSame(['admin_reply' => 'Answering.'], $message->updateCalls[0]);
        $this->assertNotNull($message->updateCalls[1]['replied_at']);
        $this->assertNull($message->updateCalls[1]['delivery_failed_at']);
    }

    public function test_a_refused_contact_reply_never_writes_replied_at(): void
    {
        // contact_messages has no status column — replied_at alone carries the
        // "was this answered" meaning, so it is the field that must not lie.
        Mail::shouldReceive('to->send')->once()->andThrow(new \RuntimeException('refused'));

        $message = $this->recordingContactMessage();

        $result = app(ContactMessageService::class)->reply($message, 'Never delivered.');

        $this->assertFalse($result['emailed']);

        foreach ($message->updateCalls as $call) {
            $this->assertArrayNotHasKey('replied_at', $call);
        }

        $this->assertSame(['delivery_failed_at'], array_keys($message->updateCalls[1]));
    }

    public function test_both_services_address_the_reply_to_the_person_who_wrote_in(): void
    {
        Mail::fake();

        app(MeetingRequestService::class)->reply($this->recordingMeetingRequest(), 'To Jane.');
        app(ContactMessageService::class)->reply($this->recordingContactMessage(), 'To Dana.');

        Mail::assertSent(MeetingRequestReplyMail::class, fn ($mail) => $mail->hasTo('jane@example.com'));
        Mail::assertSent(ContactMessageReplyMail::class, fn ($mail) => $mail->hasTo('dana@example.com'));
    }

    public function test_saving_a_note_never_sends_anything(): void
    {
        // The note is internal. A send here would mail the admin's private
        // assessment to the client.
        Mail::fake();

        $request = $this->recordingMeetingRequest();

        app(MeetingRequestService::class)->saveNote($request, 'Lowball budget.');

        Mail::assertNothingSent();
        $this->assertSame([['admin_note' => 'Lowball budget.']], $request->updateCalls);
    }

    public function test_a_note_may_be_cleared(): void
    {
        Mail::fake();

        $request = $this->recordingMeetingRequest(['admin_note' => 'Old note.']);

        app(MeetingRequestService::class)->saveNote($request, null);

        $this->assertSame([['admin_note' => null]], $request->updateCalls);
        $this->assertNull($request->admin_note);
    }

    /**
     * A MeetingRequest that records update() payloads instead of writing them.
     */
    private function recordingMeetingRequest(array $attributes = []): MeetingRequest
    {
        $model = new class extends MeetingRequest
        {
            /** @var array<int, array<string, mixed>> */
            public array $updateCalls = [];

            public function update(array $attributes = [], array $options = []): bool
            {
                $this->updateCalls[] = $attributes;
                $this->forceFill($attributes);

                return true;
            }

            public function refresh(): static
            {
                return $this;
            }
        };

        $model->forceFill(array_merge([
            'id' => 202,
            'name' => 'Jane Client',
            'email' => 'jane@example.com',
            'message' => 'Can we talk next week?',
            'status' => MeetingRequest::STATUS_PENDING,
        ], $attributes));

        return $model;
    }

    /**
     * A ContactMessage that records update() payloads instead of writing them.
     */
    private function recordingContactMessage(array $attributes = []): ContactMessage
    {
        $model = new class extends ContactMessage
        {
            /** @var array<int, array<string, mixed>> */
            public array $updateCalls = [];

            public function update(array $attributes = [], array $options = []): bool
            {
                $this->updateCalls[] = $attributes;
                $this->forceFill($attributes);

                return true;
            }

            public function refresh(): static
            {
                return $this;
            }
        };

        $model->forceFill(array_merge([
            'id' => 101,
            'name' => 'Dana Sender',
            'email' => 'dana@example.com',
            'subject' => 'Project inquiry',
            'message' => 'Are you available?',
        ], $attributes));

        return $model;
    }
}
