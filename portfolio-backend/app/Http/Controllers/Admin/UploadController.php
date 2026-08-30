<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\UploadRequest;
use App\Http\Responses\ApiResponse;
use App\Services\UploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class UploadController extends Controller
{
    public function __construct(private readonly UploadService $uploads) {}

    /**
     * POST /admin/upload
     *
     * Returns { url, path, disk }. FileUpload.jsx reads result.data.url and
     * stores it straight into the owning record's *_path field.
     */
    public function store(UploadRequest $request): JsonResponse
    {
        try {
            $result = $this->uploads->store(
                $request->file('file'),
                $request->uploadType(),
            );
        } catch (\Throwable $e) {
            Log::error('File upload failed.', [
                'type' => $request->uploadType(),
                'exception' => $e->getMessage(),
            ]);

            return ApiResponse::error(
                'The file could not be stored. Please try again.',
                500,
            );
        }

        return ApiResponse::created($result, 'File uploaded successfully.');
    }
}
