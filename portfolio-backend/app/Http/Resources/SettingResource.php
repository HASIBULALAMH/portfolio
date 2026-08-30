<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SettingResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'site_title' => $this->site_title,
            'brand_name' => $this->brand_name,
            'footer_text' => $this->footer_text,
            'copyright_text' => $this->copyright_text,
            'accent_color' => $this->accent_color,
            'favicon_path' => $this->favicon_path,
            // Both logo options are always exposed, not just the active one, so
            // the admin form can switch type without refetching and the
            // inactive option keeps whatever was last entered.
            'logo_type' => $this->logo_type ?: 'text',
            'logo_text' => $this->logo_text,
            'logo_path' => $this->logo_path,
            'logo_alt' => $this->logo_alt,
            'updated_at' => $this->updated_at,
        ];
    }
}
