<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\NoteMeetingRequestRequest;
use App\Http\Requests\ReplyMeetingRequestRequest;
use App\Http\Resources\MeetingRequestResource;
use App\Http\Responses\ApiResponse;
use App\Models\MeetingRequest;
use App\Services\MeetingRequestService;
use Illuminate\Http\JsonResponse;

class MeetingRequestController extends Controller
{
    public function __construct(private readonly MeetingRequestService $service) {}

    /** Newest first — this is an inbox. */
    public function index(): JsonResponse
    {
        return ApiResponse::success(
            MeetingRequestResource::collection(
                MeetingRequest::query()->latest()->get(),
            ),
            'Meeting requests retrieved.',
        );
    }

    /**
     * PUT /admin/meeting-requests/{id}/reply — stores the reply, flips status
     * to replied, stamps replied_at, and emails the requester.
     *
     * A send that fails answers 502, not 200. The admin panel decides success
     * from the HTTP status, so a 200 here produced a green "Reply sent
     * successfully" toast over a reply that was never delivered — the admin had
     * no way to know. The saved record still comes back in the body, because the
     * reply itself is persisted either way.
     */
    public function reply(ReplyMeetingRequestRequest $request, MeetingRequest $meetingRequest): JsonResponse
    {
        $result = $this->service->reply(
            $meetingRequest,
            $request->validated()['admin_reply'],
        );

        $resource = new MeetingRequestResource($result['request']);

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

    /** PUT /admin/meeting-requests/{id}/note — internal only, never emailed. */
    public function note(NoteMeetingRequestRequest $request, MeetingRequest $meetingRequest): JsonResponse
    {
        $updated = $this->service->saveNote(
            $meetingRequest,
            $request->validated()['admin_note'],
        );

        return ApiResponse::success(
            new MeetingRequestResource($updated),
            'Internal note saved.',
        );
    }

    /** Soft delete — recoverable from the database if needed. */
    public function destroy(MeetingRequest $meetingRequest): JsonResponse
    {
        $meetingRequest->delete();

        return ApiResponse::success(null, 'Meeting request deleted.');
    }
}
