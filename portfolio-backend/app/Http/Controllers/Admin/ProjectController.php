<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProjectDetailRequest;
use App\Http\Requests\ProjectRequest;
use App\Http\Requests\ReorderRequest;
use App\Http\Resources\ProjectDetailResource;
use App\Http\Resources\ProjectResource;
use App\Http\Responses\ApiResponse;
use App\Models\Project;
use App\Services\ProjectService;
use App\Services\ReorderService;
use Illuminate\Http\JsonResponse;

class ProjectController extends Controller
{
    public function __construct(
        private readonly ProjectService $projects,
        private readonly ReorderService $reorder,
    ) {}

    public function index(): JsonResponse
    {
        return ApiResponse::success(
            ProjectResource::collection(Project::query()->with('detail')->ordered()->get()),
            'Projects retrieved.',
        );
    }

    public function store(ProjectRequest $request): JsonResponse
    {
        $project = $this->projects->create($request->validated());

        return ApiResponse::created(
            new ProjectResource($project),
            'Project created.',
        );
    }

    public function update(ProjectRequest $request, Project $project): JsonResponse
    {
        $project = $this->projects->update($project, $request->validated());

        return ApiResponse::success(
            new ProjectResource($project->load('detail')),
            'Project updated.',
        );
    }

    /** Cascades to project_details. */
    public function destroy(Project $project): JsonResponse
    {
        $project->delete();

        return ApiResponse::success(null, 'Project deleted.');
    }

    public function reorder(ReorderRequest $request): JsonResponse
    {
        $this->reorder->reorder(Project::class, $request->items());

        return ApiResponse::success(
            ProjectResource::collection(Project::query()->ordered()->get()),
            'Project order updated.',
        );
    }

    /**
     * POST /admin/projects/{id}/case-study — creates the case study on first
     * call and updates it on later ones.
     */
    public function saveCaseStudy(ProjectDetailRequest $request, Project $project): JsonResponse
    {
        $detail = $this->projects->saveCaseStudy($project, $request->validated());

        return ApiResponse::success(
            new ProjectDetailResource($detail),
            'Case study saved.',
        );
    }
}
