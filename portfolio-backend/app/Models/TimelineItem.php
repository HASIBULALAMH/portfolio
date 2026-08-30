<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class TimelineItem extends Model
{
    public const TYPE_EDUCATION = 'education';
    public const TYPE_EXPERIENCE = 'experience';

    public const TYPES = [self::TYPE_EDUCATION, self::TYPE_EXPERIENCE];

    protected $fillable = [
        'type',
        'institute_or_company',
        'subject_or_role',
        'start_year',
        'end_year',
        'year',
        'title',
        'company',
        'description',
        'order',
    ];

    protected function casts(): array
    {
        return [
            'order' => 'integer',
        ];
    }

    /**
     * Display string for the year column, e.g. "2018 — 2022" or "2025 — Present".
     *
     * Falls back to the stored `year` when the range columns are empty, which
     * is what rows created before the type migration look like.
     */
    public function yearRange(): string
    {
        if (blank($this->start_year)) {
            return (string) $this->year;
        }

        $end = filled($this->end_year) ? $this->end_year : 'Present';

        return "{$this->start_year} — {$end}";
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('order')->orderBy('id');
    }
}
