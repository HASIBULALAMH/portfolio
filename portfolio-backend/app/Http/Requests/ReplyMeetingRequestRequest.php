<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Body for PUT /admin/meeting-requests/{id}/reply — this text is emailed. */
class ReplyMeetingRequestRequest extends FormRequest
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
            'admin_reply' => ['required', 'string', 'max:10000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'admin_reply.required' => 'A reply message is required.',
        ];
    }
}
