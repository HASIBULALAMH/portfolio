<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReorderRequest;
use App\Http\Requests\SkillRequest;
use App\Http\Resources\SkillResource;
use App\Http\Responses\ApiResponse;
use App\Models\Skill;
use App\Services\ReorderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SkillController extends Controller
{
    public function __construct(private readonly ReorderService $reorder) {}

    /**
     * GET /admin/skills?category_id=N
     *
     * The admin panel always passes category_id — it shows the skills for the
     * selected category. Without it, every skill is returned.
     */
    public function index(Request $request): JsonResponse
    {
        $categoryId = $request->query('category_id');

        $skills = Skill::query()
            ->when($categoryId, fn ($query) => $query->where('skill_category_id', $categoryId))
            ->ordered()
            ->get();

        return ApiResponse::success(
            SkillResource::collection($skills),
            'Skills retrieved.',
        );
    }

    public function store(SkillRequest $request): JsonResponse
    {
        $skill = Skill::query()->create($request->validated());

        return ApiResponse::created(
            new SkillResource($skill),
            'Skill created.',
        );
    }

    public function update(SkillRequest $request, Skill $skill): JsonResponse
    {
        $skill->update($request->validated());

        return ApiResponse::success(
            new SkillResource($skill->refresh()),
            'Skill updated.',
        );
    }

    public function destroy(Skill $skill): JsonResponse
    {
        $skill->delete();

        return ApiResponse::success(null, 'Skill deleted.');
    }

    public function reorder(ReorderRequest $request): JsonResponse
    {
        $this->reorder->reorder(Skill::class, $request->items());

        $ids = collect($request->items())->pluck('id');

        return ApiResponse::success(
            SkillResource::collection(
                Skill::query()->whereKey($ids)->ordered()->get(),
            ),
            'Skill order updated.',
        );
    }
}
