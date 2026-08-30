<?php

namespace Tests\Feature;

use App\Models\MeetingRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * HTTP contract for PUT /api/admin/meeting-requests/{id}/reply.
 *
 * The regression these lock down: the endpoint used to answer 200 whether or not
 * the email actually went out, and the admin panel decides success from the HTTP
 * status. That combination showed a green "Reply sent successfully" toast over a
 * reply that was never delivered.
 *
 * MeetingRequestReplyMailTest covers the service and the Mailable; this covers
 * the status code and body the panel actually reads.
 */
class MeetingRequestReplyEndpointTest extends TestCase
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

    private function actAsAdmin(): void
    {
        Sanctum::actingAs(User::factory()->create());
    }

    public function test_a_delivered_reply_answers_200(): void
    {
        Mail::fake();
        $this->actAsAdmin();

        $request = $this->makeRequest();

        $response = $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'Tuesday at 10:00 works.',
        ]);

        $response->assertOk();
        $response->assertJsonPath('message', 'Reply sent successfully.');
        $response->assertJsonPath('data.admin_reply', 'Tuesday at 10:00 works.');
        $response->assertJsonPath('data.status', MeetingRequest::STATUS_REPLIED);
        $response->assertJsonPath('data.delivery_failed_at', null);
        $this->assertNotNull($response->json('data.replied_at'));
    }

    public function test_a_failed_send_answers_502_not_200(): void
    {
        // Mirrors the sandbox rejection: Resend refuses any recipient outside the
        // verified list, which surfaces as a thrown transport exception.
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport refused recipient'));
        $this->actAsAdmin();

        $request = $this->makeRequest();

        $response = $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'This one never leaves the building.',
        ]);

        // The status is what the admin panel branches on, so it carries the signal.
        $response->assertStatus(502);
        $this->assertStringContainsString(
            'could not be delivered',
            $response->json('message'),
            'the body must say delivery failed, not report a clean success',
        );
    }

    public function test_a_failed_send_still_returns_the_saved_record(): void
    {
        // The reply is persisted before the send is attempted. The panel needs the
        // saved record back to tell "nothing happened" from "saved, not delivered"
        // — without it, it cannot know whether to refresh the list.
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport refused recipient'));
        $this->actAsAdmin();

        $request = $this->makeRequest();

        $response = $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'Saved despite failure.',
        ]);

        $response->assertStatus(502);
        $response->assertJsonPath('data.admin_reply', 'Saved despite failure.');

        $this->assertDatabaseHas('meeting_requests', [
            'id' => $request->id,
            'admin_reply' => 'Saved despite failure.',
        ]);
    }

    public function test_a_failed_send_stamps_delivery_failed_at_and_does_not_claim_replied(): void
    {
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport refused recipient'));
        $this->actAsAdmin();

        $request = $this->makeRequest();

        $response = $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'Undelivered.',
        ]);

        $response->assertStatus(502);

        // The whole point of the column: a reply the client never received must
        // not read as "replied" in the inbox.
        $this->assertNotNull($response->json('data.delivery_failed_at'));
        $response->assertJsonPath('data.status', MeetingRequest::STATUS_PENDING);
        $response->assertJsonPath('data.replied_at', null);

        $request->refresh();
        $this->assertNotNull($request->delivery_failed_at);
        $this->assertSame(MeetingRequest::STATUS_PENDING, $request->status);
        $this->assertNull($request->replied_at);
    }

    public function test_a_successful_retry_clears_delivery_failed_at(): void
    {
        $this->actAsAdmin();

        $request = $this->makeRequest();

        // First attempt is refused.
        Mail::shouldReceive('to->send')->once()->andThrow(new \RuntimeException('transport refused recipient'));

        $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'First try.',
        ])->assertStatus(502);

        $this->assertNotNull($request->refresh()->delivery_failed_at);

        // Second attempt lands. The stale failure marker has to go, or the red
        // indicator would stay on a request that has since been answered.
        Mail::shouldReceive('to->send')->once()->andReturnNull();

        $retry = $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'Second try.',
        ]);

        $retry->assertOk();
        $retry->assertJsonPath('data.delivery_failed_at', null);
        $retry->assertJsonPath('data.status', MeetingRequest::STATUS_REPLIED);

        $request->refresh();
        $this->assertNull($request->delivery_failed_at);
        $this->assertSame(MeetingRequest::STATUS_REPLIED, $request->status);
        $this->assertSame('Second try.', $request->admin_reply);
        $this->assertNotNull($request->replied_at);
    }

    public function test_an_empty_reply_is_rejected_before_any_send(): void
    {
        Mail::fake();
        $this->actAsAdmin();

        $request = $this->makeRequest();

        $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => '',
        ])->assertStatus(422);

        Mail::assertNothingSent();
    }

    public function test_the_endpoint_requires_authentication(): void
    {
        Mail::fake();

        $request = $this->makeRequest();

        $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'Should never land.',
        ])->assertStatus(401);

        Mail::assertNothingSent();
    }
}
