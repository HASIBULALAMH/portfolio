<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AboutResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'bio_paragraph_1' => $this->bio_paragraph_1,
            'bio_paragraph_2' => $this->bio_paragraph_2,
            'image_path' => $this->image_path,
            'image_alt' => $this->image_alt,
            // Always an array — the admin page checks Array.isArray(stats)
            // before mapping over it.
            'stats' => $this->stats ?? [],
            'updated_at' => $this->updated_at,
        ];
    }
}
