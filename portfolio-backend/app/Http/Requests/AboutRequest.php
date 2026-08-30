<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AboutRequest extends FormRequest
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
            'bio_paragraph_1' => ['required', 'string', 'max:5000'],
            'bio_paragraph_2' => ['nullable', 'string', 'max:5000'],
            'image_path' => ['nullable', 'string', 'max:2048'],
            'image_alt' => ['nullable', 'string', 'max:255'],
            // The admin page already strips blank rows before submitting; this
            // accepts the resulting (possibly empty) list of {label, value}.
            'stats' => ['nullable', 'array'],
            'stats.*.label' => ['required', 'string', 'max:255'],
            'stats.*.value' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'stats.*.label.required' => 'Every stat needs a label.',
            'stats.*.value.required' => 'Every stat needs a value.',
        ];
    }
}
