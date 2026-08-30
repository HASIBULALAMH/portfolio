<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\AboutRequest;
use App\Http\Resources\AboutResource;
use App\Http\Responses\ApiResponse;
use App\Models\About;
use App\Services\SingletonResetService;
use Illuminate\Http\JsonResponse;

class AboutController extends Controller
{
    public function show(): JsonResponse
    {
        return ApiResponse::success(
            new AboutResource(About::singleton()),
            'About section retrieved.',
        );
    }

    public function update(AboutRequest $request): JsonResponse
    {
        $about = About::singleton();
        $data = $request->validated();

        // A missing `stats` key means "no change"; an empty array means the
        // admin removed every stat, which must actually clear the column.
        if (! array_key_exists('stats', $data)) {
            unset($data['stats']);
        } else {
            $data['stats'] = $data['stats'] ?? [];
        }

        $about->update($data);

        return ApiResponse::success(
            new AboutResource($about->refresh()),
            'About section updated successfully.',
        );
    }

    /**
     * POST /admin/about/reset
     *
     * Blanks every field and deletes the uploaded portrait. `stats` resets to
     * an empty array rather than null, matching the json-array cast.
     */
    public function reset(SingletonResetService $resets): JsonResponse
    {
        $result = $resets->reset(About::singleton());

        return ApiResponse::success(
            new AboutResource($result['model']),
            'About section reset successfully.',
        );
    }
}
