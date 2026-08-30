<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;

/**
 * Every endpoint answers with the same three keys:
 *
 *   { "data": ..., "message": "...", "errors": {...} | null }
 *
 * portfolio-admin's apiCall() helper reads response.data.data on success and
 * response.data.errors / .message on failure, so the shape has to be identical
 * whether a request succeeded or not.
 */
final class ApiResponse
{
    public static function success(mixed $data = null, string $message = '', int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => $data,
            'message' => $message,
            'errors' => null,
        ], $status);
    }

    public static function created(mixed $data = null, string $message = 'Created.'): JsonResponse
    {
        return self::success($data, $message, 201);
    }

    /**
     * @param  array<string, array<int, string>>  $errors
     */
    public static function validationError(array $errors, string $message = 'The given data was invalid.'): JsonResponse
    {
        return response()->json([
            'data' => null,
            'message' => $message,
            'errors' => $errors,
        ], 422);
    }

    /**
     * $data is for the partial-failure case only: an action that committed its
     * write and then failed on a side effect (a reply saved but not emailed)
     * answers non-2xx, yet still has to hand back the saved record so the caller
     * can tell "nothing happened" from "the write landed, the delivery did not".
     * It stays null for ordinary errors.
     */
    public static function error(
        string $message,
        int $status = 400,
        ?array $errors = null,
        mixed $data = null,
    ): JsonResponse {
        return response()->json([
            'data' => $data,
            'message' => $message,
            'errors' => $errors,
        ], $status);
    }

    public static function notFound(string $message = 'Resource not found.'): JsonResponse
    {
        return self::error($message, 404);
    }

    public static function unauthorized(string $message = 'Unauthenticated.'): JsonResponse
    {
        return self::error($message, 401);
    }
}
