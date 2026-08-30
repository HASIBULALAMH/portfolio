<?php

namespace App\Models;

use App\Models\Concerns\IsSingleton;
use Illuminate\Database\Eloquent\Model;

class Hero extends Model
{
    use IsSingleton;

    /**
     * Social platforms the admin may choose, mapped to the Simple Icons slug
     * the frontend renders for each.
     *
     * A null slug means Simple Icons ships no mark for that platform, so the
     * frontend supplies its own: LinkedIn's mark and Twitter's bird were both
     * removed upstream over trademark policy, so `linkedin` genuinely has no
     * slug available and `x` is the only Twitter entry left. `email` and
     * `website` are not brands at all and use generic icons.
     *
     * Keep in sync with lib/social-platforms.js in both Next apps.
     */
    public const SOCIAL_PLATFORMS = [
        'github' => 'github',
        'linkedin' => null,
        'facebook' => 'facebook',
        'x' => 'x',
        'instagram' => 'instagram',
        'youtube' => 'youtube',
        'whatsapp' => 'whatsapp',
        'telegram' => 'telegram',
        'email' => null,
        'website' => null,
    ];

    /**
     * Orbit capacity. The ring distributes badges at 360/count degrees, so any
     * count renders evenly, but past six the 48px badges start to touch at the
     * mobile orbit radius.
     */
    public const MAX_TECH_BADGES = 6;

    protected $table = 'hero';

    protected $fillable = [
        'heading',
        'subheading',
        'roles',
        'tech_badges',
        'is_available',
        'availability_label',
        'cta_primary_text',
        'cta_primary_link',
        'cta_secondary_text',
        'cta_secondary_link',
        'image_path',
        'image_alt',
        'social_links',
        'email',
        'cv_path',
    ];

    protected function casts(): array
    {
        return [
            'roles' => 'array',
            'tech_badges' => 'array',
            'social_links' => 'array',
            'is_available' => 'boolean',
        ];
    }

    /** @return array<int, string> */
    public static function socialPlatforms(): array
    {
        return array_keys(self::SOCIAL_PLATFORMS);
    }
}
