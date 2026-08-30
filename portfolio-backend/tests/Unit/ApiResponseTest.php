<?php

namespace Tests\Unit;

use App\Http\Responses\ApiResponse;
use Tests\TestCase;

/**
 * The three-key envelope every endpoint answers with.
 *
 * Unit, not feature: no route, no database, no middleware. The only framework
 * service touched is the response factory, which ApiResponse cannot be exercised
 * without.
 *
 * Worth pinning at this level because portfolio-admin's apiCall() reads
 * `data.data` on success and `data.message` / `data.errors` on failure, and
 * derives its own success boolean from the HTTP status. A silent change to any
 * of the three keys, or to a status code, breaks the panel with no PHP error.
 */
class ApiResponseTest extends TestCase
{
    /** @return array<string, mixed> */
    private function body(\Illuminate\Http\JsonResponse $response): array
    {
        return json_decode($response->getContent(), true);
    }

    public function test_success_answers_200_with_all_three_keys(): void
    {
        $response = ApiResponse::success(['id' => 1], 'Retrieved.');

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(
            ['data', 'message', 'errors'],
            array_keys($this->body($response)),
            'the envelope key set is a contract with apiCall(), not an implementation detail',
        );
        $this->assertSame(['id' => 1], $this->body($response)['data']);
        $this->assertSame('Retrieved.', $this->body($response)['message']);
        $this->assertNull($this->body($response)['errors']);
    }

    public function test_success_carries_a_null_data_without_dropping_the_key(): void
    {
        // An unset singleton legitimately serialises as data: null, and
        // fetchFromApi() in portfolio-frontend distinguishes "key missing"
        // (malformed, use fallback) from "key present and null" (valid).
        $body = $this->body(ApiResponse::success(null, 'Nothing yet.'));

        $this->assertArrayHasKey('data', $body);
        $this->assertNull($body['data']);
    }

    public function test_created_answers_201(): void
    {
        $response = ApiResponse::created(null, 'Stored.');

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('Stored.', $this->body($response)['message']);
    }

    public function test_validation_error_answers_422_with_the_field_errors(): void
    {
        $response = ApiResponse::validationError(['email' => ['Bad address.']]);

        $this->assertSame(422, $response->getStatusCode());
        $this->assertSame(['email' => ['Bad address.']], $this->body($response)['errors']);
        $this->assertNull($this->body($response)['data']);
    }

    public function test_error_defaults_to_400_and_a_null_data(): void
    {
        $response = ApiResponse::error('Nope.');

        $this->assertSame(400, $response->getStatusCode());
        $this->assertNull($this->body($response)['data']);
        $this->assertNull($this->body($response)['errors']);
    }

    public function test_error_can_carry_a_payload_alongside_a_failure_status(): void
    {
        // This is the partial-failure case the reply endpoints depend on: a 502
        // whose body still holds the saved record. Without it the admin panel
        // cannot tell "nothing happened" from "the write landed, delivery did not".
        $response = ApiResponse::error('Saved but not delivered.', 502, data: ['id' => 7]);

        $this->assertSame(502, $response->getStatusCode());
        $this->assertSame(['id' => 7], $this->body($response)['data']);
    }

    public function test_not_found_answers_404(): void
    {
        $this->assertSame(404, ApiResponse::notFound()->getStatusCode());
    }

    public function test_unauthorized_answers_401(): void
    {
        $this->assertSame(401, ApiResponse::unauthorized()->getStatusCode());
    }
}
