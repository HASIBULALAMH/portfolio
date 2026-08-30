<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContactMessageResource extends JsonResource
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
            'subject' => $this->subject,
            'message' => $this->message,
            'is_read' => $this->is_read,
            'admin_reply' => $this->admin_reply,
            // Set only on a delivered reply.
            'replied_at' => $this->replied_at,
            // Non-null means the last send attempt was refused. The admin list
            // renders a retry indicator from this.
            'delivery_failed_at' => $this->delivery_failed_at,
            // The inbox list shows a received date, so created_at is part of
            // the contract rather than incidental metadata.
            'created_at' => $this->created_at,
        ];
    }
}
