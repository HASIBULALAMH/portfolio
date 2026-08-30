<?php

namespace Tests\Unit;

use App\Http\Requests\HeroRequest;
use App\Http\Requests\NoteMeetingRequestRequest;
use App\Http\Requests\ReorderRequest;
use App\Http\Requests\ReplyContactMessageRequest;
use App\Http\Requests\ReplyMeetingRequestRequest;
use App\Http\Requests\SettingRequest;
use App\Http\Requests\StoreContactMessageRequest;
use App\Http\Requests\StoreMeetingRequestRequest;
use App\Http\Requests\TimelineItemRequest;
use App\Http\Requests\UploadRequest;
use App\Models\Hero;
use App\Services\UploadService;
use Tests\Support\ResolvesFormRequests;
use Tests\TestCase;

/**
 * Validation rules, resolved the way the framework resolves them — including
 * prepareForValidation() and withValidator() — but with no route, no middleware
 * and no database.
 *
 * Only the requests whose rules encode a real decision are covered. A request
 * that is nothing but `required|string|max:255` per field adds no information
 * beyond restating itself; the ones here either normalise their input, derive
 * columns, cross-check fields, or guard a public endpoint against the internet.
 *
 * SectionVisibilityBulkRequest is deliberately absent: its withValidator() queries
 * section_visibility for locked rows, so it belongs in the integration suite.
 */
class FormRequestValidationTest extends TestCase
{
    use ResolvesFormRequests;

    // ------------------------------------------------------------------
    // StoreContactMessageRequest — unauthenticated, reachable by anyone
    // ------------------------------------------------------------------

    public function test_a_contact_submission_needs_a_name_email_and_message(): void
    {
        $this->assertFailsOn(StoreContactMessageRequest::class, [], 'name');
        $this->assertFailsOn(StoreContactMessageRequest::class, [], 'email');
        $this->assertFailsOn(StoreContactMessageRequest::class, [], 'message');
    }

    public function test_a_contact_submission_accepts_a_missing_subject(): void
    {
        // The public form leaves subject optional, and ContactMessageReplyMail has
        // a documented fallback subject for exactly this case.
        $this->assertPasses(StoreContactMessageRequest::class, [
            'name' => 'Dana',
            'email' => 'dana@example.com',
            'message' => 'Hello.',
        ]);
    }

    public function test_a_contact_submission_rejects_a_malformed_email(): void
    {
        $this->assertFailsOn(StoreContactMessageRequest::class, [
            'name' => 'Dana',
            'email' => 'not-an-address',
            'message' => 'Hello.',
        ], 'email');
    }

    public function test_a_contact_message_is_length_bounded(): void
    {
        // The ceiling is what keeps an unauthenticated POST from writing an
        // unbounded blob into the inbox.
        $this->assertFailsOn(StoreContactMessageRequest::class, [
            'name' => 'Dana',
            'email' => 'dana@example.com',
            'message' => str_repeat('a', 5001),
        ], 'message');
    }

    // ------------------------------------------------------------------
    // StoreMeetingRequestRequest — same exposure, plus admin-only fields
    // ------------------------------------------------------------------

    public function test_a_meeting_request_accepts_a_bare_name_and_email(): void
    {
        // message, preferred_date and preferred_time are all optional: a visitor
        // who only wants a call back should not be blocked.
        $this->assertPasses(StoreMeetingRequestRequest::class, [
            'name' => 'Jane',
            'email' => 'jane@example.com',
        ]);
    }

    public function test_a_meeting_request_rejects_a_non_date_preferred_date(): void
    {
        $this->assertFailsOn(StoreMeetingRequestRequest::class, [
            'name' => 'Jane',
            'email' => 'jane@example.com',
            'preferred_date' => 'next tuesday-ish',
        ], 'preferred_date');
    }

    public function test_a_visitor_cannot_set_the_admin_only_fields(): void
    {
        // These are not merely unvalidated — they must not survive into
        // validated(), which is what the controller passes to create().
        $validated = $this->validateRequest(StoreMeetingRequestRequest::class, [
            'name' => 'Jane',
            'email' => 'jane@example.com',
            'status' => 'replied',
            'admin_reply' => 'I injected this.',
            'admin_note' => 'and this',
            'replied_at' => '2026-01-01 00:00:00',
            'delivery_failed_at' => null,
        ]);

        foreach (['status', 'admin_reply', 'admin_note', 'replied_at', 'delivery_failed_at'] as $field) {
            $this->assertArrayNotHasKey($field, $validated, "a visitor must not be able to set [{$field}]");
        }
    }

    public function test_preferred_time_is_a_label_not_a_time(): void
    {
        // The public form uses a fixed dropdown of labels like "2:00 PM", so a
        // strict `date_format:H:i` here would reject the app's own values.
        $this->assertPasses(StoreMeetingRequestRequest::class, [
            'name' => 'Jane',
            'email' => 'jane@example.com',
            'preferred_time' => '2:00 PM',
        ]);
    }

    // ------------------------------------------------------------------
    // Reply requests — the text that actually gets emailed
    // ------------------------------------------------------------------

    /**
     * @return array<string, array{class-string}>
     */
    public static function replyRequests(): array
    {
        return [
            'meeting' => [ReplyMeetingRequestRequest::class],
            'contact' => [ReplyContactMessageRequest::class],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('replyRequests')]
    public function test_a_reply_cannot_be_empty(string $class): void
    {
        // An empty reply must be refused before the send, or the client receives
        // a blank email that cannot be unsent.
        $this->assertFailsOn($class, ['admin_reply' => ''], 'admin_reply');
        $this->assertFailsOn($class, [], 'admin_reply');
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('replyRequests')]
    public function test_a_reply_is_length_bounded(string $class): void
    {
        $this->assertPasses($class, ['admin_reply' => str_repeat('a', 10000)]);
        $this->assertFailsOn($class, ['admin_reply' => str_repeat('a', 10001)], 'admin_reply');
    }

    public function test_an_internal_note_may_be_cleared_but_must_be_present(): void
    {
        // `present|nullable` rather than `nullable` alone: sending null clears the
        // note deliberately, while omitting the key entirely is a malformed
        // request rather than a request to clear.
        $this->assertPasses(NoteMeetingRequestRequest::class, ['admin_note' => null]);
        $this->assertPasses(NoteMeetingRequestRequest::class, ['admin_note' => 'Lowball budget.']);
        $this->assertFailsOn(NoteMeetingRequestRequest::class, [], 'admin_note');
    }

    // ------------------------------------------------------------------
    // HeroRequest — the only request with real normalisation logic
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function heroPayload(array $overrides = []): array
    {
        return array_merge(['heading' => 'Hasibul Alam'], $overrides);
    }

    public function test_blank_role_rows_are_stripped_rather_than_rejected(): void
    {
        // The repeatable list input starts with empty rows; rejecting them would
        // make the form unsubmittable until every placeholder was deleted.
        $validated = $this->validateRequest(HeroRequest::class, $this->heroPayload([
            'roles' => ['Laravel Developer', '', '  ', 'Platform Engineer'],
        ]));

        $this->assertSame(['Laravel Developer', 'Platform Engineer'], $validated['roles']);
    }

    public function test_the_roles_list_is_capped(): void
    {
        $this->assertFailsOn(HeroRequest::class, $this->heroPayload([
            'roles' => array_map(fn (int $i) => "Role {$i}", range(1, 13)),
        ]), 'roles');
    }

    public function test_a_badge_with_a_blank_icon_slug_becomes_null_not_an_empty_string(): void
    {
        // The frontend branches on `slug ? renderLogo() : renderTextBadge()`, and
        // '' is falsy there but still a string in the database — null is the
        // honest "no logo picked" and keeps the two representations from drifting.
        $validated = $this->validateRequest(HeroRequest::class, $this->heroPayload([
            'tech_badges' => [
                ['label' => 'Laravel', 'icon_slug' => 'laravel'],
                ['label' => 'Custom', 'icon_slug' => ''],
                ['label' => 'Spaced', 'icon_slug' => '  vuedotjs  '],
            ],
        ]));

        $this->assertSame('laravel', $validated['tech_badges'][0]['icon_slug']);
        $this->assertNull($validated['tech_badges'][1]['icon_slug']);
        $this->assertSame('vuedotjs', $validated['tech_badges'][2]['icon_slug']);
    }

    public function test_unlabelled_badge_rows_are_dropped(): void
    {
        $validated = $this->validateRequest(HeroRequest::class, $this->heroPayload([
            'tech_badges' => [
                ['label' => 'Laravel', 'icon_slug' => 'laravel'],
                ['label' => '  ', 'icon_slug' => 'react'],
            ],
        ]));

        $this->assertCount(1, $validated['tech_badges']);
    }

    public function test_the_badge_orbit_cap_matches_the_models_constant(): void
    {
        // Hero::MAX_TECH_BADGES is the documented geometric limit; the rule builds
        // its `max:` from it, so the two cannot disagree — this asserts the rule
        // actually reads the constant rather than repeating the number.
        $overCap = array_map(
            fn (int $i) => ['label' => "Badge {$i}", 'icon_slug' => null],
            range(1, Hero::MAX_TECH_BADGES + 1),
        );

        $this->assertFailsOn(HeroRequest::class, $this->heroPayload(['tech_badges' => $overCap]), 'tech_badges');
    }

    public function test_a_social_platform_outside_the_supported_set_is_rejected(): void
    {
        // A platform the admin can save but the frontend cannot draw renders an
        // iconless circle, which is why the set is validated rather than free text.
        $this->assertFailsOn(HeroRequest::class, $this->heroPayload([
            'social_links' => [['platform' => 'myspace', 'url' => 'https://myspace.com/x']],
        ]), 'social_links.0.platform');
    }

    public function test_every_supported_platform_actually_validates(): void
    {
        // The mirror of the test above: a typo in Hero::SOCIAL_PLATFORMS would
        // otherwise only surface as a platform the admin dropdown offers and the
        // API refuses.
        foreach (Hero::socialPlatforms() as $platform) {
            $url = $platform === 'email' ? 'hi@example.com' : 'https://example.com/profile';

            $this->assertPasses(HeroRequest::class, $this->heroPayload([
                'social_links' => [['platform' => $platform, 'url' => $url]],
            ]));
        }
    }

    public function test_a_brand_platform_requires_an_absolute_http_url(): void
    {
        foreach (['github.com/me', 'ftp://example.com', 'javascript:alert(1)'] as $bad) {
            $this->assertFailsOn(HeroRequest::class, $this->heroPayload([
                'social_links' => [['platform' => 'github', 'url' => $bad]],
            ]), 'social_links.0.url');
        }
    }

    public function test_the_email_platform_accepts_a_bare_address_or_a_mailto_link(): void
    {
        foreach (['hi@example.com', 'mailto:hi@example.com', 'MAILTO:hi@example.com'] as $good) {
            $this->assertPasses(HeroRequest::class, $this->heroPayload([
                'social_links' => [['platform' => 'email', 'url' => $good]],
            ]));
        }

        $this->assertFailsOn(HeroRequest::class, $this->heroPayload([
            'social_links' => [['platform' => 'email', 'url' => 'https://example.com']],
        ]), 'social_links.0.url');
    }

    public function test_a_blank_optional_field_is_normalised_to_null(): void
    {
        // The admin form submits '' for untouched fields. Without the coercion the
        // `email` rule fires on an empty string and blocks the whole save.
        $validated = $this->validateRequest(HeroRequest::class, $this->heroPayload([
            'email' => '',
            'cv_path' => '  ',
            'availability_label' => '',
        ]));

        $this->assertNull($validated['email']);
        $this->assertNull($validated['cv_path']);
        $this->assertNull($validated['availability_label']);
    }

    // ------------------------------------------------------------------
    // TimelineItemRequest — derives three NOT NULL legacy columns
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function timelinePayload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'experience',
            'institute_or_company' => 'Acme Ltd',
            'subject_or_role' => 'Backend Engineer',
            'start_year' => '2022',
            'order' => 0,
        ], $overrides);
    }

    public function test_the_legacy_columns_are_derived_from_the_new_fields(): void
    {
        // year/title/company are NOT NULL and the admin form no longer sends them,
        // so a broken derivation fails the insert rather than degrading.
        $validated = $this->validateRequest(TimelineItemRequest::class, $this->timelinePayload([
            'end_year' => '2024',
        ]));

        $this->assertSame('2022 — 2024', $validated['year']);
        $this->assertSame('Backend Engineer', $validated['title']);
        $this->assertSame('Acme Ltd', $validated['company']);
    }

    public function test_a_missing_end_year_derives_a_present_label_and_nulls_the_column(): void
    {
        $validated = $this->validateRequest(TimelineItemRequest::class, $this->timelinePayload([
            'end_year' => '',
        ]));

        $this->assertSame('2022 — Present', $validated['year']);
        $this->assertNull($validated['end_year']);
    }

    public function test_a_non_numeric_end_year_is_allowed(): void
    {
        // end_year is a string column precisely so "Present" is expressible.
        $this->assertPasses(TimelineItemRequest::class, $this->timelinePayload(['end_year' => 'Present']));
    }

    public function test_an_unknown_timeline_type_is_rejected(): void
    {
        $this->assertFailsOn(TimelineItemRequest::class, $this->timelinePayload(['type' => 'sabbatical']), 'type');
    }

    // ------------------------------------------------------------------
    // SettingRequest, ReorderRequest, UploadRequest
    // ------------------------------------------------------------------

    public function test_the_accent_colour_must_be_a_six_digit_hex(): void
    {
        $base = ['site_title' => 'Portfolio', 'brand_name' => 'Hasibul'];

        $this->assertPasses(SettingRequest::class, $base + ['accent_color' => '#4648D4']);
        $this->assertPasses(SettingRequest::class, $base + ['accent_color' => '#4648d4']);
        $this->assertFailsOn(SettingRequest::class, $base + ['accent_color' => '#FFF'], 'accent_color');
        $this->assertFailsOn(SettingRequest::class, $base + ['accent_color' => 'rebeccapurple'], 'accent_color');
    }

    public function test_the_logo_type_is_constrained_to_image_or_text(): void
    {
        // The render path treats anything non-'image' as text, so a typo would be
        // silently absorbed rather than reported — hence the explicit `in:` rule.
        $base = ['site_title' => 'Portfolio', 'brand_name' => 'Hasibul'];

        $this->assertPasses(SettingRequest::class, $base + ['logo_type' => 'image']);
        $this->assertPasses(SettingRequest::class, $base + ['logo_type' => 'text']);
        $this->assertFailsOn(SettingRequest::class, $base + ['logo_type' => 'Image'], 'logo_type');
    }

    public function test_the_logo_text_ceiling_matches_the_admin_forms_own_limit(): void
    {
        $base = ['site_title' => 'Portfolio', 'brand_name' => 'Hasibul'];

        $this->assertPasses(SettingRequest::class, $base + ['logo_text' => str_repeat('a', 32)]);
        $this->assertFailsOn(SettingRequest::class, $base + ['logo_text' => str_repeat('a', 33)], 'logo_text');
    }

    public function test_a_reorder_needs_a_non_empty_list_of_id_order_pairs(): void
    {
        $this->assertPasses(ReorderRequest::class, ['items' => [['id' => 3, 'order' => 0]]], 'PUT');
        $this->assertFailsOn(ReorderRequest::class, ['items' => []], 'items', 'PUT');
        $this->assertFailsOn(ReorderRequest::class, [], 'items', 'PUT');
        $this->assertFailsOn(ReorderRequest::class, ['items' => [['id' => 3]]], 'items.0.order', 'PUT');
        $this->assertFailsOn(ReorderRequest::class, ['items' => [['id' => 0, 'order' => 0]]], 'items.0.id', 'PUT');
    }

    public function test_an_upload_without_a_recognised_type_falls_back_to_generic(): void
    {
        // FileUpload.jsx sends no type, so this branch decides the real limits for
        // most uploads in the app.
        $request = UploadRequest::create('/test', 'POST', []);
        $this->assertSame(UploadService::TYPE_GENERIC, $request->uploadType());

        $request = UploadRequest::create('/test', 'POST', ['type' => 'not-a-type']);
        $this->assertSame(UploadService::TYPE_GENERIC, $request->uploadType());

        $request = UploadRequest::create('/test', 'POST', ['type' => UploadService::TYPE_CV]);
        $this->assertSame(UploadService::TYPE_CV, $request->uploadType());
    }

    public function test_the_upload_rules_are_built_from_the_resolved_type(): void
    {
        $request = UploadRequest::create('/test', 'POST', ['type' => UploadService::TYPE_CV]);
        $request->setContainer(app());

        $fileRules = implode('|', $request->rules()['file']);

        $this->assertStringContainsString('mimetypes:application/pdf', $fileRules);
        $this->assertStringContainsString('max:10240', $fileRules);
        $this->assertStringNotContainsString('image/png', $fileRules);
    }
}
