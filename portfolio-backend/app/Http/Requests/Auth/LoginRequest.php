<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
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
            'email' => ['required', 'email'],
            // Deliberately no min-length rule: this validates that credentials
            // were *supplied*, not that they are strong. A short password is a
            // failed login (401), not a malformed request (422).
            'password' => ['required', 'string'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.required' => 'An email address is required.',
            'email.email' => 'Enter a valid email address.',
            'password.required' => 'A password is required.',
        ];
    }
}
