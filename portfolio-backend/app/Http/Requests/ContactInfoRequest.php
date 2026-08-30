<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ContactInfoRequest extends FormRequest
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
            'email' => ['nullable', 'string', 'max:255', 'email'],
            'phone' => ['nullable', 'string', 'max:64'],
            'location' => ['nullable', 'string', 'max:255'],
            'calendly_link' => ['nullable', 'string', 'max:2048', 'url'],
            // Digits only — wa.me rejects "+" and spaces.
            'whatsapp_number' => ['nullable', 'string', 'max:32', 'regex:/^[0-9]+$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'whatsapp_number.regex' => 'Use international format with digits only, e.g. 8801700000000.',
        ];
    }

    /** Treat blank optional fields as absent rather than invalid. */
    protected function prepareForValidation(): void
    {
        $replacements = [];

        foreach (['email', 'phone', 'location', 'calendly_link', 'whatsapp_number'] as $field) {
            if ($this->has($field) && trim((string) $this->input($field)) === '') {
                $replacements[$field] = null;
            }
        }

        if ($replacements !== []) {
            $this->merge($replacements);
        }
    }
}
