<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Projection for the public projects grid — exactly what a card renders.
 *
 * Separate from ProjectResource because `description` deliberately does not
 * appear here: the card shows image, tags, links and title only, and the
 * description belongs to the details page. The admin panel and the detail
 * endpoint keep using ProjectResource, which is full-fidelity — the admin edit
 * form needs `description` to populate its textarea.
 */
class ProjectCardResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'image_path' => $this->image_path,
            'image_alt' => $this->image_alt,
            'tags' => $this->tags ?? [],
            'github_url' => $this->github_url,
            'live_url' => $this->live_url,
            'is_featured' => $this->is_featured,
            'order' => $this->order,
        ];
    }
}
