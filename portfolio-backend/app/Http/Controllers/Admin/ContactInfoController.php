<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ContactInfoRequest;
use App\Http\Resources\ContactInfoResource;
use App\Http\Responses\ApiResponse;
use App\Models\ContactInfo;
use App\Services\SingletonResetService;
use Illuminate\Http\JsonResponse;

class ContactInfoController extends Controller
{
    public function show(): JsonResponse
    {
        return ApiResponse::success(
            new ContactInfoResource(ContactInfo::singleton()),
            'Contact info retrieved.',
        );
    }

    public function update(ContactInfoRequest $request): JsonResponse
    {
        $contactInfo = ContactInfo::singleton();
        $contactInfo->update($request->validated());

        return ApiResponse::success(
            new ContactInfoResource($contactInfo->refresh()),
            'Contact info updated successfully.',
        );
    }

    /**
     * POST /admin/contact-info/reset
     *
     * Blanks every field. This singleton holds no file paths, so nothing is
     * deleted from storage.
     */
    public function reset(SingletonResetService $resets): JsonResponse
    {
        $result = $resets->reset(ContactInfo::singleton());

        return ApiResponse::success(
            new ContactInfoResource($result['model']),
            'Contact info reset successfully.',
        );
    }
}
