<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Project extends Model
{
    protected $fillable = [
        'title',
        'description',
        'slug',
        'image_path',
        'image_alt',
        'tags',
        'github_url',
        'live_url',
        'is_featured',
        'order',
    ];

    protected function casts(): array
    {
        return [
            'tags' => 'array',
            'is_featured' => 'boolean',
            'order' => 'integer',
        ];
    }

    /** Public routes resolve projects by slug rather than id. */
    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function detail(): HasOne
    {
        return $this->hasOne(ProjectDetail::class);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('order')->orderBy('id');
    }
}
