<?php

namespace Tests\Unit;

use App\Services\AuthService;
use Tests\TestCase;

/**
 * AuthService::throttleKey — the login-throttle identity.
 *
 * The key is the only unit of AuthService that is pure string logic, which is
 * why it settles here: the wrong key undermines every other branch. The login
 * controller scopes a key to email + source IP, so a brute-forcer rotating one
 * of them gets a fresh budget. Email is case-folded because the login lookup is
 * case-insensitive in the application layer, and the email itself comes from a
 * validated request, so no escaping beyond folding is needed here.
 *
 * Everything else in AuthService (Hash::check against a fixed-cost dummy, token
 * minting, the RateLimiter helpers) is a thin call into framework services; the
 * behaviour that matters — "wrong credentials → null, right credentials → a
 * token bound to the admin" — is asserted against a real database in
 * tests/Feature/AdminLoginTest.php.
 */
class AuthServiceTest extends TestCase
{
    public function test_the_key_scopes_attempts_to_both_email_and_ip(): void
    {
        // Two attempts from different IPs must not share one budget: an attacker
        // rotating IPs would otherwise lock out nothing, but a few retries from a
        // second device would lock out the owner — either way the IP must matter.
        $this->assertNotSame(
            app(AuthService::class)->throttleKey('admin@example.com', '10.0.0.1'),
            app(AuthService::class)->throttleKey('admin@example.com', '10.0.0.2'),
        );

        $this->assertNotSame(
            app(AuthService::class)->throttleKey('admin@example.com', '10.0.0.1'),
            app(AuthService::class)->throttleKey('admin@example.net', '10.0.0.1'),
        );
    }

    public function test_the_email_is_case_insensitive_in_the_key(): void
    {
        // The auth lookup does not distinguish case, so a brute-forcer cycling
        // "Admin@", "ADMIN@", "aDmIn@" must not earn a fresh budget per casing.
        $this->assertSame(
            app(AuthService::class)->throttleKey('Admin@Example.com', '127.0.0.1'),
            app(AuthService::class)->throttleKey('admin@example.com', '127.0.0.1'),
        );
    }

    public function test_the_key_namespace_prefixes_every_attempt(): void
    {
        // The 'login:' prefix keeps the admin budget from colliding with any
        // other rate-limit namespace the app later adds.
        $this->assertStringStartsWith(
            'login:',
            app(AuthService::class)->throttleKey('admin@example.com', '127.0.0.1'),
        );
    }
}