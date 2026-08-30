<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReorderRequest;
use App\Http\Requests\SkillCategoryRequest;
use App\Http\Resources\SkillCategoryResource;
use App\Http\Responses\ApiResponse;
use App\Models\SkillCategory;
use App\Services\ReorderService;
use Illuminate\Http\JsonResponse;

class SkillCategoryController extends Controller
{
    public function __construct(private readonly ReorderService $reorder) {}

    public function index(): JsonResponse
    {
        return ApiResponse::success(
            SkillCategoryResource::collection(SkillCategory::query()->ordered()->get()),
            'Skill categories retrieved.',
        );
    }

    public function store(SkillCategoryRequest $request): JsonResponse
    {
        $category = SkillCategory::query()->create($request->validated());

        return ApiResponse::created(
            new SkillCategoryResource($category),
            'Skill category created.',
        );
    }

    public function update(SkillCategoryRequest $request, SkillCategory $skillCategory): JsonResponse
    {
        $skillCategory->update($request->validated());

        return ApiResponse::success(
            new SkillCategoryResource($skillCategory->refresh()),
            'Skill category updated.',
        );
    }

    /** Cascades to the category's skills — the admin panel warns about this. */
    public function destroy(SkillCategory $skillCategory): JsonResponse
    {
        $skillCategory->delete();

        return ApiResponse::success(null, 'Skill category deleted.');
    }

    public function reorder(ReorderRequest $request): JsonResponse
    {
        $this->reorder->reorder(SkillCategory::class, $request->items());

        return ApiResponse::success(
            SkillCategoryResource::collection(SkillCategory::query()->ordered()->get()),
            'Skill category order updated.',
        );
    }
}
