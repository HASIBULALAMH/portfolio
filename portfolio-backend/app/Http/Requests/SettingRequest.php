<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SettingRequest extends FormRequest
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
            'site_title' => ['required', 'string', 'max:255'],
            'brand_name' => ['required', 'string', 'max:255'],
            'footer_text' => ['nullable', 'string', 'max:2000'],
            'copyright_text' => ['nullable', 'string', 'max:255'],
            // Mirrors the admin form's own /^#[0-9A-F]{6}$/i check.
            'accent_color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'favicon_path' => ['nullable', 'string', 'max:2048'],
            // The render path treats anything other than 'image' as text, but
            // the value is still constrained here so a typo cannot persist and
            // silently change which logo the site shows.
            'logo_type' => ['nullable', 'string', 'in:image,text'],
            // Short by design: this renders as a wordmark in a 16px-tall header
            // slot, so a sentence would be unreadable rather than merely long.
            'logo_text' => ['nullable', 'string', 'max:32'],
            'logo_path' => ['nullable', 'string', 'max:2048'],
            'logo_alt' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'accent_color.regex' => 'Accent color must be a hex value like #4648D4.',
            'logo_type.in' => 'Logo type must be either "image" or "text".',
            'logo_text.max' => 'Logo text must be 32 characters or fewer.',
        ];
    }
}
