<?php

namespace Tests\Contract;

use App\Models\ContactMessage;
use App\Models\MeetingRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Consumer contract for the public site and admin panel.
 *
 * This intentionally uses Laravel's resources as the provider under test rather
 * than duplicating them in a second schema library: the frontend consumers are
 * JavaScript-only and this project has no existing Pact boundary. The assertions
 * therefore lock the JSON keys the consumers read while remaining fast and local.
 */
class ApiShapeContractTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, array<string>}> */
    public static function publicContracts(): array
    {
        return [
            'settings' => ['/api/settings', ['id', 'site_title', 'brand_name', 'logo_type']],
            'hero' => ['/api/hero', ['id', 'heading', 'roles', 'social_links', 'tech_badges']],
            'projects' => ['/api/projects', []],
            'skills' => ['/api/skills', []],
            'testimonials' => ['/api/testimonials', []],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('publicContracts')]
    public function test_public_endpoint_matches_frontend_envelope_and_shape(string $uri, array $keys): void
    {
        $response = $this->getJson($uri);

        $response->assertOk()->assertJsonStructure(['data', 'message']);
        $data = $response->json('data');
        $this->assertIsArray($data);

        if ($keys !== []) {
            $response->assertJsonStructure(['data' => $keys]);
        }
    }

    public function test_admin_inboxes_match_their_consumer_item_shapes(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $message = ContactMessage::query()->create([
            'name' => 'Contract Visitor',
            'email' => 'visitor@example.com',
            'message' => 'A message.',
        ]);
        $request = MeetingRequest::query()->create([
            'name' => 'Contract Client',
            'email' => 'client@example.com',
            'status' => MeetingRequest::STATUS_PENDING,
        ]);

        $this->getJson('/api/admin/messages')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'name', 'email', 'message', 'is_read', 'admin_reply', 'replied_at', 'delivery_failed_at', 'created_at']],
                'message',
            ])
            ->assertJsonPath('data.0.id', $message->id);

        $this->getJson('/api/admin/meeting-requests')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'name', 'email', 'preferred_date', 'preferred_time', 'message', 'status', 'admin_reply', 'admin_note', 'replied_at', 'delivery_failed_at', 'created_at']],
                'message',
            ])
            ->assertJsonPath('data.0.id', $request->id);
    }
}
