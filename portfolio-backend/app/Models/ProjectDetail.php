<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectDetail extends Model
{
    protected $fillable = [
        'project_id',
        'client',
        'date_range',
        'challenge',
        'solution',
        'results',
        'gallery_images',
        'document_path',
    ];

    protected function casts(): array
    {
        return [
            'project_id' => 'integer',
            'results' => 'array',
            'gallery_images' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
