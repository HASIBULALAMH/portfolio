<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProjectRequest extends FormRequest
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
            'title' => ['required', 'string', 'max:255'],
            'description' => ['required', 'string', 'max:5000'],
            // Never required from the client: ProjectService derives the slug
            // from the title. Accepted here so an explicit slug can still be
            // supplied by an API client.
            'slug' => ['nullable', 'string', 'max:255'],
            'image_path' => ['nullable', 'string', 'max:2048'],
            'image_alt' => ['nullable', 'string', 'max:255'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:100'],
            'github_url' => ['nullable', 'string', 'max:2048', 'url'],
            'live_url' => ['nullable', 'string', 'max:2048', 'url'],
            'is_featured' => ['nullable', 'boolean'],
            'order' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /** Treat empty URL strings from the form as absent. */
    protected function prepareForValidation(): void
    {
        $replacements = [];

        foreach (['github_url', 'live_url', 'image_path', 'image_alt'] as $field) {
            if ($this->has($field) && trim((string) $this->input($field)) === '') {
                $replacements[$field] = null;
            }
        }

        if ($replacements !== []) {
            $this->merge($replacements);
        }
    }
}
