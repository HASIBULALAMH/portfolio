<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TimelineItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'institute_or_company' => $this->institute_or_company,
            'subject_or_role' => $this->subject_or_role,
            'start_year' => $this->start_year,
            'end_year' => $this->end_year,
            // Pre-rendered range, so the frontend does not reimplement the
            // "empty end_year means Present" rule.
            'year_range' => $this->yearRange(),
            'description' => $this->description,
            'order' => $this->order,

            // Legacy columns, still populated and still returned so nothing
            // reading them breaks. `year` also covers rows created before the
            // type migration, where start_year/end_year may be empty.
            'year' => $this->year,
            'title' => $this->title,
            'company' => $this->company,
        ];
    }
}
