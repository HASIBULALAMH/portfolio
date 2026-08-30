<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectDetailResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'client' => $this->client,
            'date_range' => $this->date_range,
            'challenge' => $this->challenge,
            'solution' => $this->solution,
            'results' => $this->results ?? [],
            'gallery_images' => $this->gallery_images ?? [],
            'document_path' => $this->document_path,
        ];
    }
}
