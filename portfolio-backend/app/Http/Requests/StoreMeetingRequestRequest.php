<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Public endpoint. Note what is *not* accepted here: status, admin_reply,
 * admin_note and replied_at are all admin-controlled, so a visitor cannot set
 * them even by including them in the payload.
 */
class StoreMeetingRequestRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'preferred_date' => ['nullable', 'date'],
            // A label from a fixed dropdown ("09:00", "2:00 PM"), not a time.
            'preferred_time' => ['nullable', 'string', 'max:64'],
            'message' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Please tell me your name.',
            'email.required' => 'Please provide an email address so I can reply.',
            'email.email' => 'That email address does not look valid.',
            'preferred_date.date' => 'Please provide a valid date.',
        ];
    }
}
