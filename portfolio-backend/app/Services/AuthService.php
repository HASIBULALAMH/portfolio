<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AuthService
{
    /** Failed logins allowed from one IP/email pair before it is throttled. */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 60;

    /**
     * Verify credentials and mint a Sanctum token.
     *
     * @return array{token: string, user: User}|null  null when credentials are wrong
     */
    public function attemptLogin(string $email, string $password, string $ip): ?array
    {
        $user = User::query()->where('email', $email)->first();

        // Hash::check on a dummy hash when the user is missing, so a wrong
        // email costs the same time as a wrong password and cannot be
        // distinguished by response timing.
        if (! $user) {
            Hash::check($password, '$2y$12$'.str_repeat('0', 53));

            return null;
        }

        if (! Hash::check($password, $user->password)) {
            return null;
        }

        return [
            'token' => $user->createToken('admin-panel')->plainTextToken,
            'user' => $user,
        ];
    }

    /** Throttle key for a login attempt, scoped to email + source IP. */
    public function throttleKey(string $email, string $ip): string
    {
        return 'login:'.Str::lower($email).'|'.$ip;
    }

    public function tooManyAttempts(string $key): bool
    {
        return RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS);
    }

    public function recordFailure(string $key): void
    {
        RateLimiter::hit($key, self::DECAY_SECONDS);
    }

    public function clearAttempts(string $key): void
    {
        RateLimiter::clear($key);
    }

    public function secondsUntilRetry(string $key): int
    {
        return RateLimiter::availableIn($key);
    }
}
