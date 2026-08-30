<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Body for PUT /admin/meeting-requests/{id}/note. Internal only — this text is
 * never emailed, and clearing the note (sending '') is a valid action.
 */
class NoteMeetingRequestRequest extends FormRequest
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
            'admin_note' => ['present', 'nullable', 'string', 'max:10000'],
        ];
    }
}
