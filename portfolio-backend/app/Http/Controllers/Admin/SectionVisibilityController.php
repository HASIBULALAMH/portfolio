<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\SectionVisibilityBulkRequest;
use App\Http\Resources\SectionVisibilityResource;
use App\Http\Responses\ApiResponse;
use App\Models\SectionVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Section visibility and ordering. Rows are fixed — one per section, created
 * by migration — so there is no store or destroy here, only list and bulk
 * update.
 */
class SectionVisibilityController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::success(
            SectionVisibilityResource::collection(SectionVisibility::query()->ordered()->get()),
            'Section visibility retrieved.',
        );
    }

    /**
     * Apply toggles and reordering in one request.
     *
     * The admin panel posts the entire list on every change, so one transaction
     * covers the whole update — a partial write here would desync the page
     * order from the nav order, which is the exact failure this table exists
     * to prevent.
     */
    public function update(SectionVisibilityBulkRequest $request): JsonResponse
    {
        DB::transaction(function () use ($request): void {
            foreach ($request->sections() as $section) {
                SectionVisibility::query()
                    ->whereKey($section['id'])
                    ->update([
                        'is_visible' => $section['is_visible'],
                        'order' => $section['order'],
                    ]);
            }
        });

        return ApiResponse::success(
            SectionVisibilityResource::collection(SectionVisibility::query()->ordered()->get()),
            'Sections updated.',
        );
    }
}
