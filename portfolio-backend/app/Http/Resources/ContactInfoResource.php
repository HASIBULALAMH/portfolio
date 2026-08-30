<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContactInfoResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'phone' => $this->phone,
            'location' => $this->location,
            'calendly_link' => $this->calendly_link,
            'whatsapp_number' => $this->whatsapp_number,
            'updated_at' => $this->updated_at,
        ];
    }
}
