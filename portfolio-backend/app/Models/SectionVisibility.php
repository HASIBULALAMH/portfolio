<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A homepage section's visibility and position. Drives both what page.jsx
 * renders and what the navbar links to, so the two stay in sync by
 * construction rather than by remembering to edit both.
 */
class SectionVisibility extends Model
{
    protected $table = 'section_visibility';

    protected $fillable = [
        'section_key',
        'label',
        'nav_href',
        'is_visible',
        'order',
        'is_toggleable',
    ];

    protected function casts(): array
    {
        return [
            'is_visible' => 'boolean',
            'is_toggleable' => 'boolean',
            'order' => 'integer',
        ];
    }

    /** Display order, with id as a stable tiebreaker for equal order values. */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('order')->orderBy('id');
    }
}
