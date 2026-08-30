<?php

namespace Tests\Feature;

use App\Mail\ContactMessageReplyMail;
use App\Models\ContactMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * HTTP contract for POST /api/admin/contact-messages/{id}/reply, plus the
 * Mailable's own contract.
 *
 * Deliberately mirrors MeetingRequestReplyEndpointTest: the contact reply was
 * built to the same standard as the meeting reply, delivery tracking included from
 * the start, so it is held to the same assertions.
 */
class ContactMessageReplyEndpointTest extends TestCase
{
    use RefreshDatabase;

    private function makeMessage(array $attributes = []): ContactMessage
    {
        return ContactMessage::query()->create(array_merge([
            'name' => 'Dana Sender',
            'email' => 'dana@example.com',
            'subject' => 'Project inquiry',
            'message' => 'Are you available for contract work?',
        ], $attributes));
    }

    private function actAsAdmin(): void
    {
        Sanctum::actingAs(User::factory()->create());
    }

    private function replyUrl(ContactMessage $message): string
    {
        return "/api/admin/contact-messages/{$message->id}/reply";
    }

    public function test_a_delivered_reply_answers_200(): void
    {
        Mail::fake();
        $this->actAsAdmin();

        $message = $this->makeMessage();

        $response = $this->postJson($this->replyUrl($message), [
            'admin_reply' => 'Yes — happy to talk this week.',
        ]);

        $response->assertOk();
        $response->assertJsonPath('message', 'Reply sent successfully.');
        $response->assertJsonPath('data.admin_reply', 'Yes — happy to talk this week.');
        $response->assertJsonPath('data.delivery_failed_at', null);
        $this->assertNotNull($response->json('data.replied_at'));
    }

    public function test_the_reply_is_emailed_to_the_sender(): void
    {
        Mail::fake();
        $this->actAsAdmin();

        $message = $this->makeMessage();

        $this->postJson($this->replyUrl($message), [
            'admin_reply' => 'Sending this to Dana.',
        ])->assertOk();

        Mail::assertSent(ContactMessageReplyMail::class, function ($mail) {
            return $mail->hasTo('dana@example.com')
                && $mail->reply === 'Sending this to Dana.'
                && $mail->recipientName === 'Dana Sender';
        });
    }

    public function test_a_failed_send_answers_502_not_200(): void
    {
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport refused recipient'));
        $this->actAsAdmin();

        $message = $this->makeMessage();

        $response = $this->postJson($this->replyUrl($message), [
            'admin_reply' => 'This one never leaves the building.',
        ]);

        $response->assertStatus(502);
        $this->assertStringContainsString(
            'could not be delivered',
            $response->json('message'),
            'the body must say delivery failed, not report a clean success',
        );
    }

    public function test_a_failed_send_stamps_delivery_failed_at_and_saves_the_reply(): void
    {
        Mail::shouldReceive('to->send')->andThrow(new \RuntimeException('transport refused recipient'));
        $this->actAsAdmin();

        $message = $this->makeMessage();

        $response = $this->postJson($this->replyUrl($message), [
            'admin_reply' => 'Undelivered but kept.',
        ]);

        $response->assertStatus(502);
        // The saved record has to come back, or the panel cannot tell this apart
        // from a request that never landed.
        $response->assertJsonPath('data.admin_reply', 'Undelivered but kept.');
        $this->assertNotNull($response->json('data.delivery_failed_at'));
        // replied_at stays null: the sender was never actually reached.
        $response->assertJsonPath('data.replied_at', null);

        $message->refresh();
        $this->assertSame('Undelivered but kept.', $message->admin_reply);
        $this->assertNotNull($message->delivery_failed_at);
        $this->assertNull($message->replied_at);
    }

    public function test_a_successful_retry_clears_delivery_failed_at(): void
    {
        $this->actAsAdmin();

        $message = $this->makeMessage();

        Mail::shouldReceive('to->send')->once()->andThrow(new \RuntimeException('transport refused recipient'));

        $this->postJson($this->replyUrl($message), [
            'admin_reply' => 'First try.',
        ])->assertStatus(502);

        $this->assertNotNull($message->refresh()->delivery_failed_at);

        // The stale marker has to go, or the red indicator would stay on a message
        // that has since been answered.
        Mail::shouldReceive('to->send')->once()->andReturnNull();

        $retry = $this->postJson($this->replyUrl($message), [
            'admin_reply' => 'Second try.',
        ]);

        $retry->assertOk();
        $retry->assertJsonPath('data.delivery_failed_at', null);

        $message->refresh();
        $this->assertNull($message->delivery_failed_at);
        $this->assertSame('Second try.', $message->admin_reply);
        $this->assertNotNull($message->replied_at);
    }

    public function test_an_empty_reply_is_rejected_before_any_send(): void
    {
        Mail::fake();
        $this->actAsAdmin();

        $message = $this->makeMessage();

        $this->postJson($this->replyUrl($message), [
            'admin_reply' => '',
        ])->assertStatus(422);

        Mail::assertNothingSent();
    }

    public function test_the_endpoint_requires_authentication(): void
    {
        Mail::fake();

        $message = $this->makeMessage();

        $this->postJson($this->replyUrl($message), [
            'admin_reply' => 'Should never land.',
        ])->assertStatus(401);

        Mail::assertNothingSent();
    }

    public function test_the_subject_echoes_what_the_sender_wrote_about(): void
    {
        $message = $this->makeMessage(['subject' => 'Contract work']);

        $mailable = ContactMessageReplyMail::forMessage($message, 'Answering.');

        $this->assertSame('Re: Contract work', $mailable->envelope()->subject);
    }

    public function test_the_subject_falls_back_when_the_sender_gave_none(): void
    {
        // subject is nullable on the public form, so this is a real case.
        $message = $this->makeMessage(['subject' => null]);

        $mailable = ContactMessageReplyMail::forMessage($message, 'Answering.');

        $this->assertSame('Re: your message', $mailable->envelope()->subject);
    }

    public function test_the_rendered_body_carries_the_name_and_reply(): void
    {
        $message = $this->makeMessage(['name' => 'Sam Buyer']);

        $rendered = ContactMessageReplyMail::forMessage($message, 'Here is my answer.')->render();

        $this->assertStringContainsString('Sam Buyer', $rendered);
        $this->assertStringContainsString('Here is my answer.', $rendered);
    }
}
