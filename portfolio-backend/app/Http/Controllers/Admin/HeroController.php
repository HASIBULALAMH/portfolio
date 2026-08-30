<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\HeroRequest;
use App\Http\Resources\HeroResource;
use App\Http\Responses\ApiResponse;
use App\Models\Hero;
use App\Services\SingletonResetService;
use Illuminate\Http\JsonResponse;

class HeroController extends Controller
{
    public function show(): JsonResponse
    {
        return ApiResponse::success(
            new HeroResource(Hero::singleton()),
            'Hero section retrieved.',
        );
    }

    public function update(HeroRequest $request): JsonResponse
    {
        $hero = Hero::singleton();
        $hero->update($request->validated());

        return ApiResponse::success(
            new HeroResource($hero->refresh()),
            'Hero section updated successfully.',
        );
    }

    /**
     * POST /admin/hero/reset
     *
     * Blanks every field and deletes the uploaded portrait and CV.
     */
    public function reset(SingletonResetService $resets): JsonResponse
    {
        $result = $resets->reset(Hero::singleton());

        return ApiResponse::success(
            new HeroResource($result['model']),
            'Hero section reset successfully.',
        );
    }
}
