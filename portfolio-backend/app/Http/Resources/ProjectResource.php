<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'slug' => $this->slug,
            'image_path' => $this->image_path,
            'image_alt' => $this->image_alt,
            'tags' => $this->tags ?? [],
            'github_url' => $this->github_url,
            'live_url' => $this->live_url,
            'is_featured' => $this->is_featured,
            'order' => $this->order,
            // The case-study body is only attached when eager-loaded, which
            // keeps the list endpoint light — GET /api/projects/{slug} loads it.
            'detail' => new ProjectDetailResource($this->whenLoaded('detail')),
        ];
    }
}
