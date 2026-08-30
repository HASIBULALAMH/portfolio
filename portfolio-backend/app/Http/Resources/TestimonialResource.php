<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TestimonialResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'quote' => $this->quote,
            'author_name' => $this->author_name,
            'author_role' => $this->author_role,
            'avatar_path' => $this->avatar_path,
            'avatar_alt' => $this->avatar_alt,
            'order' => $this->order,
        ];
    }
}
