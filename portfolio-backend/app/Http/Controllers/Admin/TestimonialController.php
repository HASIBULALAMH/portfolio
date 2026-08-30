<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReorderRequest;
use App\Http\Requests\TestimonialRequest;
use App\Http\Resources\TestimonialResource;
use App\Http\Responses\ApiResponse;
use App\Models\Testimonial;
use App\Services\ReorderService;
use Illuminate\Http\JsonResponse;

class TestimonialController extends Controller
{
    public function __construct(private readonly ReorderService $reorder) {}

    public function index(): JsonResponse
    {
        return ApiResponse::success(
            TestimonialResource::collection(Testimonial::query()->ordered()->get()),
            'Testimonials retrieved.',
        );
    }

    public function store(TestimonialRequest $request): JsonResponse
    {
        $testimonial = Testimonial::query()->create($request->validated());

        return ApiResponse::created(
            new TestimonialResource($testimonial),
            'Testimonial created.',
        );
    }

    public function update(TestimonialRequest $request, Testimonial $testimonial): JsonResponse
    {
        $testimonial->update($request->validated());

        return ApiResponse::success(
            new TestimonialResource($testimonial->refresh()),
            'Testimonial updated.',
        );
    }

    public function destroy(Testimonial $testimonial): JsonResponse
    {
        $testimonial->delete();

        return ApiResponse::success(null, 'Testimonial deleted.');
    }

    public function reorder(ReorderRequest $request): JsonResponse
    {
        $this->reorder->reorder(Testimonial::class, $request->items());

        return ApiResponse::success(
            TestimonialResource::collection(Testimonial::query()->ordered()->get()),
            'Testimonial order updated.',
        );
    }
}
