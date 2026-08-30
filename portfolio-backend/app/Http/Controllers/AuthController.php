<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Http\Responses\ApiResponse;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(private readonly AuthService $auth) {}

    /**
     * POST /api/login
     *
     * Returns { token, user } — portfolio-admin stores result.data.token in
     * localStorage and sends it as a Bearer token on every later request.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();
        $key = $this->auth->throttleKey($credentials['email'], $request->ip());

        if ($this->auth->tooManyAttempts($key)) {
            $seconds = $this->auth->secondsUntilRetry($key);

            return ApiResponse::error(
                "Too many login attempts. Please try again in {$seconds} seconds.",
                429,
            );
        }

        $result = $this->auth->attemptLogin(
            $credentials['email'],
            $credentials['password'],
            $request->ip(),
        );

        if ($result === null) {
            $this->auth->recordFailure($key);

            // 401 rather than 422: the request was well-formed, the credentials
            // were simply wrong. The message stays vague on purpose so it does
            // not reveal whether the email exists.
            return ApiResponse::unauthorized('The provided credentials are incorrect.');
        }

        $this->auth->clearAttempts($key);

        return ApiResponse::success([
            'token' => $result['token'],
            'user' => new UserResource($result['user']),
        ], 'Logged in successfully.');
    }

    /**
     * POST /api/logout — revokes only the token used for this request, so
     * other sessions stay signed in.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return ApiResponse::success(null, 'Logged out successfully.');
    }

    /**
     * GET /api/admin/me — the admin panel calls this on every page load to
     * confirm the stored token is still valid.
     */
    public function me(Request $request): JsonResponse
    {
        return ApiResponse::success(
            new UserResource($request->user()),
            'Authenticated user retrieved.',
        );
    }
}
