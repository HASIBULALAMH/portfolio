<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\SettingRequest;
use App\Http\Resources\SettingResource;
use App\Http\Responses\ApiResponse;
use App\Models\Setting;
use App\Services\SingletonResetService;
use Illuminate\Http\JsonResponse;

class SettingController extends Controller
{
    public function show(): JsonResponse
    {
        return ApiResponse::success(
            new SettingResource(Setting::singleton()),
            'Settings retrieved.',
        );
    }

    public function update(SettingRequest $request): JsonResponse
    {
        $settings = Setting::singleton();
        $settings->update($request->validated());

        return ApiResponse::success(
            new SettingResource($settings->refresh()),
            'Settings updated successfully.',
        );
    }

    /**
     * POST /admin/settings/reset
     *
     * Blanks every field and deletes the uploaded logo/favicon. Returns the
     * cleared record so the admin form can re-render from persisted state
     * rather than guessing at what the reset did.
     */
    public function reset(SingletonResetService $resets): JsonResponse
    {
        $result = $resets->reset(Setting::singleton());

        return ApiResponse::success(
            new SettingResource($result['model']),
            'Settings reset successfully.',
        );
    }
}
