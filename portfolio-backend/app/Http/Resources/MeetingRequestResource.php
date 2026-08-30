<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Admin-only. `admin_note` is included here because the admin inbox displays
 * and edits it — it must never be exposed on a public endpoint or in an email.
 */
class MeetingRequestResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            // Y-m-d rather than a full ISO timestamp: this is a calendar date,
            // and the admin panel renders it as plain text.
            'preferred_date' => $this->preferred_date?->toDateString(),
            'preferred_time' => $this->preferred_time,
            'message' => $this->message,
            'status' => $this->status,
            'admin_reply' => $this->admin_reply,
            'admin_note' => $this->admin_note,
            'replied_at' => $this->replied_at,
            // Non-null means the last send attempt was refused. The admin list
            // renders a retry indicator from this.
            'delivery_failed_at' => $this->delivery_failed_at,
            'created_at' => $this->created_at,
        ];
    }
}
