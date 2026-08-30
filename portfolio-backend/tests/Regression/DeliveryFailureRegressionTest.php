<?php

namespace Tests\Regression;

use App\Mail\MeetingRequestReplyMail;
use App\Models\MeetingRequest;
use App\Services\MeetingRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use App\Models\User;
use Tests\TestCase;

/**
 * Regression guard for the 2026-08-26 delivery-status bug: a refused reply
 * used to be marked replied before the mail transport was attempted.
 */
class DeliveryFailureRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_refused_reply_keeps_pending_status_and_preserves_text(): void
    {
        Mail::shouldReceive('to->send')->once()->andThrow(new \RuntimeException('refused'));

        $request = MeetingRequest::query()->create([
            'name' => 'Regression Client',
            'email' => 'regression@example.com',
            'status' => MeetingRequest::STATUS_PENDING,
        ]);

        $result = app(MeetingRequestService::class)->reply($request, 'Saved but not delivered.');

        $this->assertFalse($result['emailed']);
        $this->assertDatabaseHas('meeting_requests', [
            'id' => $request->id,
            'admin_reply' => 'Saved but not delivered.',
            'status' => MeetingRequest::STATUS_PENDING,
            'replied_at' => null,
        ]);
        $this->assertNotNull($request->refresh()->delivery_failed_at);
    }

    /**
     * Regression guard for the 2026-08-25 false-success toast: the API must
     * expose delivery failure as a non-2xx response for the admin client.
     */
    public function test_refused_admin_reply_is_not_reported_as_success(): void
    {
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('refused'));
        Sanctum::actingAs(User::factory()->create());

        $request = MeetingRequest::query()->create([
            'name' => 'Toast Client',
            'email' => 'toast@example.com',
            'status' => MeetingRequest::STATUS_PENDING,
        ]);

        $response = $this->putJson("/api/admin/meeting-requests/{$request->id}/reply", [
            'admin_reply' => 'This must show an error.',
        ]);

        $response->assertStatus(502);
        $this->assertStringContainsString('could not be delivered', $response->json('message'));
    }
}
