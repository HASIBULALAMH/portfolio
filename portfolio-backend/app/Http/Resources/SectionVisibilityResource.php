<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SectionVisibilityResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'section_key' => $this->section_key,
            'label' => $this->label,
            'nav_href' => $this->nav_href,
            'is_visible' => $this->is_visible,
            'order' => $this->order,
            'is_toggleable' => $this->is_toggleable,
        ];
    }
}
