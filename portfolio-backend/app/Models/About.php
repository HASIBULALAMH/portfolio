<?php

namespace App\Models;

use App\Models\Concerns\IsSingleton;
use Illuminate\Database\Eloquent\Model;

class About extends Model
{
    use IsSingleton;

    protected $table = 'about';

    protected $fillable = [
        'bio_paragraph_1',
        'bio_paragraph_2',
        'image_path',
        'image_alt',
        'stats',
    ];

    protected function casts(): array
    {
        return [
            'stats' => 'array',
        ];
    }
}
