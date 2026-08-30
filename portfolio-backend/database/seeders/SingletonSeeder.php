<?php

namespace Database\Seeders;

use App\Models\About;
use App\Models\ContactInfo;
use App\Models\Hero;
use App\Models\Setting;
use Illuminate\Database\Seeder;

/**
 * Creates the one row each singleton table is designed around, with empty but
 * sensible defaults. Admin pages tolerate a null payload, but seeding means
 * GET /admin/hero and friends return a real record from the very first load.
 *
 * Idempotent: it only fills a table that is still empty, so re-seeding never
 * overwrites content entered through the admin panel.
 */
class SingletonSeeder extends Seeder
{
    public function run(): void
    {
        if (Setting::query()->doesntExist()) {
            Setting::query()->create([
                'site_title' => 'Hasibul Alam — Full-Stack Developer',
                'brand_name' => 'Hasibul',
                'footer_text' => '',
                'copyright_text' => '© '.date('Y').' Hasibul Alam. All rights reserved.',
                'accent_color' => '#4648D4',
                // A fresh install has no uploaded file, so the text logo is the
                // option that looks finished immediately. logo_text is left
                // unset on purpose — the render path falls back to brand_name.
                'logo_type' => 'text',
            ]);
        }

        if (Hero::query()->doesntExist()) {
            Hero::query()->create([
                'heading' => '',
                'subheading' => '',
                'cta_primary_text' => '',
                'cta_primary_link' => '',
                'cta_secondary_text' => '',
                'cta_secondary_link' => '',
            ]);
        }

        if (About::query()->doesntExist()) {
            About::query()->create([
                'bio_paragraph_1' => '',
                'bio_paragraph_2' => '',
                'stats' => [],
            ]);
        }

        if (ContactInfo::query()->doesntExist()) {
            ContactInfo::query()->create([
                'email' => '',
                'phone' => '',
                'location' => '',
                'calendly_link' => '',
                'whatsapp_number' => '',
            ]);
        }
    }
}
