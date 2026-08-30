<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReorderRequest;
use App\Http\Requests\TimelineItemRequest;
use App\Http\Resources\TimelineItemResource;
use App\Http\Responses\ApiResponse;
use App\Models\TimelineItem;
use App\Services\ReorderService;
use Illuminate\Http\JsonResponse;

class TimelineItemController extends Controller
{
    public function __construct(private readonly ReorderService $reorder) {}

    public function index(): JsonResponse
    {
        return ApiResponse::success(
            TimelineItemResource::collection(TimelineItem::query()->ordered()->get()),
            'Timeline items retrieved.',
        );
    }

    public function store(TimelineItemRequest $request): JsonResponse
    {
        $item = TimelineItem::query()->create($request->validated());

        return ApiResponse::created(
            new TimelineItemResource($item),
            'Timeline item created.',
        );
    }

    public function update(TimelineItemRequest $request, TimelineItem $timelineItem): JsonResponse
    {
        $timelineItem->update($request->validated());

        return ApiResponse::success(
            new TimelineItemResource($timelineItem->refresh()),
            'Timeline item updated.',
        );
    }

    public function destroy(TimelineItem $timelineItem): JsonResponse
    {
        $timelineItem->delete();

        return ApiResponse::success(null, 'Timeline item deleted.');
    }

    public function reorder(ReorderRequest $request): JsonResponse
    {
        $this->reorder->reorder(TimelineItem::class, $request->items());

        return ApiResponse::success(
            TimelineItemResource::collection(TimelineItem::query()->ordered()->get()),
            'Timeline order updated.',
        );
    }
}
