<?php

namespace App\Models;

use App\Models\Concerns\IsSingleton;
use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    use IsSingleton;

    protected $table = 'settings';

    protected $fillable = [
        'site_title',
        'brand_name',
        'footer_text',
        'copyright_text',
        'accent_color',
        'favicon_path',
        'logo_type',
        'logo_text',
        'logo_path',
        'logo_alt',
    ];
}
