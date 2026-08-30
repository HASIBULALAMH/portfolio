<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ApiShowcaseRequest;
use App\Http\Requests\ReorderRequest;
use App\Http\Resources\ApiShowcaseResource;
use App\Http\Responses\ApiResponse;
use App\Models\ApiShowcase;
use App\Services\ReorderService;
use Illuminate\Http\JsonResponse;

class ApiShowcaseController extends Controller
{
    public function __construct(private readonly ReorderService $reorder) {}

    public function index(): JsonResponse
    {
        return ApiResponse::success(
            ApiShowcaseResource::collection(ApiShowcase::query()->ordered()->get()),
            'API showcases retrieved.',
        );
    }

    public function store(ApiShowcaseRequest $request): JsonResponse
    {
        $showcase = ApiShowcase::query()->create($request->validated());

        return ApiResponse::created(
            new ApiShowcaseResource($showcase),
            'API showcase created.',
        );
    }

    public function update(ApiShowcaseRequest $request, ApiShowcase $apiShowcase): JsonResponse
    {
        $apiShowcase->update($request->validated());

        return ApiResponse::success(
            new ApiShowcaseResource($apiShowcase->refresh()),
            'API showcase updated.',
        );
    }

    public function destroy(ApiShowcase $apiShowcase): JsonResponse
    {
        $apiShowcase->delete();

        return ApiResponse::success(null, 'API showcase deleted.');
    }

    /**
     * The current admin UI has no reorder control for showcases, but the
     * endpoint exists for parity with the other ordered lists.
     */
    public function reorder(ReorderRequest $request): JsonResponse
    {
        $this->reorder->reorder(ApiShowcase::class, $request->items());

        return ApiResponse::success(
            ApiShowcaseResource::collection(ApiShowcase::query()->ordered()->get()),
            'API showcase order updated.',
        );
    }
}
