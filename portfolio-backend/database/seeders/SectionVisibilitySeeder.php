<?php

namespace Database\Seeders;

use App\Models\SectionVisibility;
use Illuminate\Database\Seeder;

/**
 * One row per homepage section, in the order page.jsx renders them today.
 *
 * `nav_href` anchors must match the target section's DOM id exactly — a
 * mismatch is a silently dead nav link. The ids are set in
 * portfolio-frontend/components/portfolio/*.jsx; note `timeline` renders
 * `#journey` and `api-showcase` renders `#apis`, so the keys and anchors
 * deliberately differ for those two.
 *
 * Idempotent: keyed on section_key via updateOrCreate, and only the structural
 * columns are written, so re-seeding never resets an admin's visibility or
 * ordering choices.
 */
class SectionVisibilitySeeder extends Seeder
{
    /**
     * @var array<int, array{section_key: string, label: string, nav_href: string, is_toggleable: bool}>
     */
    private const SECTIONS = [
        // Hero is structural — hiding it would leave the page opening on a
        // bare navbar, so its toggle is locked on.
        ['section_key' => 'hero', 'label' => 'Home', 'nav_href' => '#home', 'is_toggleable' => false],
        ['section_key' => 'about', 'label' => 'About', 'nav_href' => '#about', 'is_toggleable' => true],
        ['section_key' => 'skills', 'label' => 'Skills', 'nav_href' => '#skills', 'is_toggleable' => true],
        ['section_key' => 'projects', 'label' => 'Projects', 'nav_href' => '#projects', 'is_toggleable' => true],
        ['section_key' => 'api_showcase', 'label' => 'APIs', 'nav_href' => '#apis', 'is_toggleable' => true],
        ['section_key' => 'timeline', 'label' => 'Journey', 'nav_href' => '#journey', 'is_toggleable' => true],
        ['section_key' => 'testimonials', 'label' => 'Testimonials', 'nav_href' => '#testimonials', 'is_toggleable' => true],
        ['section_key' => 'contact', 'label' => 'Contact', 'nav_href' => '#contact', 'is_toggleable' => true],
    ];

    public function run(): void
    {
        foreach (self::SECTIONS as $index => $section) {
            SectionVisibility::query()->updateOrCreate(
                ['section_key' => $section['section_key']],
                [
                    'label' => $section['label'],
                    'nav_href' => $section['nav_href'],
                    'is_toggleable' => $section['is_toggleable'],
                    // Only seed order/visibility on first insert; an existing
                    // row keeps whatever the admin arranged.
                    'order' => SectionVisibility::query()
                        ->where('section_key', $section['section_key'])
                        ->value('order') ?? $index,
                    'is_visible' => SectionVisibility::query()
                        ->where('section_key', $section['section_key'])
                        ->value('is_visible') ?? true,
                ],
            );
        }
    }
}
