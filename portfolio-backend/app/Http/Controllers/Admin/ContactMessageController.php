<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReplyContactMessageRequest;
use App\Http\Resources\ContactMessageResource;
use App\Http\Responses\ApiResponse;
use App\Models\ContactMessage;
use App\Services\ContactMessageService;
use Illuminate\Http\JsonResponse;

class ContactMessageController extends Controller
{
    public function __construct(private readonly ContactMessageService $service) {}

    /** Newest first — this is an inbox. */
    public function index(): JsonResponse
    {
        return ApiResponse::success(
            ContactMessageResource::collection(
                ContactMessage::query()->latest()->get(),
            ),
            'Messages retrieved.',
        );
    }

    /**
     * PUT /admin/messages/{id}/read
     *
     * A toggle, not a one-way "mark as read": the admin panel uses this single
     * endpoint for both its "Mark Read" and "Mark Unread" buttons.
     */
    public function toggleRead(ContactMessage $message): JsonResponse
    {
        $message->update(['is_read' => ! $message->is_read]);
        $message->refresh();

        return ApiResponse::success(
            new ContactMessageResource($message),
            $message->is_read ? 'Message marked as read.' : 'Message marked as unread.',
        );
    }

    /**
     * POST /admin/contact-messages/{id}/reply — stores the reply, stamps
     * replied_at, and emails the sender.
     *
     * Same response contract as the meeting-request reply endpoint: a send that
     * fails answers 502, not 200, because the admin panel decides success from the
     * HTTP status and a green toast over an undelivered reply is worse than no
     * reply at all. The saved record comes back on both paths — the reply itself is
     * persisted either way, and the panel needs it to refresh instead of going stale.
     */
    public function reply(ReplyContactMessageRequest $request, ContactMessage $message): JsonResponse
    {
        $result = $this->service->reply(
            $message,
            $request->validated()['admin_reply'],
        );

        $resource = new ContactMessageResource($result['message']);

        if (! $result['emailed']) {
            // 502 rather than 500: nothing here is broken internally, an upstream
            // mail provider refused the send.
            return ApiResponse::error(
                'Reply saved, but the email could not be delivered. Check the mail configuration.',
                502,
                data: $resource,
            );
        }

        return ApiResponse::success($resource, 'Reply sent successfully.');
    }

    /** Soft delete — recoverable from the database if needed. */
    public function destroy(ContactMessage $message): JsonResponse
    {
        $message->delete();

        return ApiResponse::success(null, 'Message deleted.');
    }
}
