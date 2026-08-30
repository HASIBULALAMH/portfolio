<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SkillCategoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'order' => $this->order,
            // Only present when the caller eager-loaded skills. GET /api/skills
            // nests them for the public site; the admin list endpoint does not,
            // since it fetches skills per category separately.
            'skills' => SkillResource::collection($this->whenLoaded('skills')),
        ];
    }
}
