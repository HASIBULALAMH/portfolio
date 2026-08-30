<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Body for POST /admin/projects/{id}/case-study. The project itself comes from
 * the route, so project_id is not expected in the payload.
 */
class ProjectDetailRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'client' => ['nullable', 'string', 'max:255'],
            'date_range' => ['nullable', 'string', 'max:255'],
            'challenge' => ['nullable', 'string', 'max:10000'],
            'solution' => ['nullable', 'string', 'max:10000'],
            'results' => ['nullable', 'array'],
            'results.*' => ['string', 'max:500'],
            'gallery_images' => ['nullable', 'array'],
            'gallery_images.*' => ['string', 'max:2048'],
            // Path/URL returned by POST /admin/upload, not an uploaded file.
            'document_path' => ['nullable', 'string', 'max:2048'],
        ];
    }

    /** An empty document field from the form means "no document", not "". */
    protected function prepareForValidation(): void
    {
        if ($this->has('document_path') && trim((string) $this->input('document_path')) === '') {
            $this->merge(['document_path' => null]);
        }
    }
}
