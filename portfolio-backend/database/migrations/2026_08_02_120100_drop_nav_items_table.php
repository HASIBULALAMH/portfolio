<?php

use App\Models\SectionVisibility;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Retire nav_items in favour of section_visibility.
 *
 * Every row it ever held pointed at a homepage section, so the two tables were
 * two half-answers to one question: nav_items decided the link, page.jsx
 * decided the section, and nothing kept them agreeing. section_visibility owns
 * both now.
 *
 * Labels and ordering are carried across by matching each old href to a
 * section. Hrefs are NOT carried across: the live rows used route-style paths
 * ("/hero", "/about") for anchor-only sections, so they were already dead
 * links — the seeded anchors are the corrected values and win.
 */
return new class extends Migration
{
    /** Old href (normalised) => section_key it was really pointing at. */
    private const HREF_TO_KEY = [
        'hero' => 'hero',
        'home' => 'hero',
        'about' => 'about',
        'skills' => 'skills',
        'projects' => 'projects',
        'apis' => 'api_showcase',
        'api-showcase' => 'api_showcase',
        'journey' => 'timeline',
        'timeline' => 'timeline',
        'testimonials' => 'testimonials',
        'contact' => 'contact',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('nav_items')) {
            return;
        }

        foreach (DB::table('nav_items')->orderBy('order')->orderBy('id')->get() as $navItem) {
            $key = self::HREF_TO_KEY[strtolower(trim((string) $navItem->href, '#/ '))] ?? null;

            if ($key === null) {
                // A genuinely custom link (external URL, standalone page).
                // None exist today, but if one does it must not vanish
                // silently — leave nav_items in place and stop.
                throw new RuntimeException(
                    "nav_items row #{$navItem->id} (\"{$navItem->label}\" -> \"{$navItem->href}\") is not a "
                    .'homepage section link and has nowhere to migrate to. Move it by hand, then re-run.',
                );
            }

            SectionVisibility::query()
                ->where('section_key', $key)
                ->update([
                    'label' => $navItem->label,
                    'order' => $navItem->order,
                ]);
        }

        Schema::dropIfExists('nav_items');
    }

    /**
     * Recreates the table and repopulates it from the visible sections. The
     * original rows' ids are not preserved — nothing referenced them.
     */
    public function down(): void
    {
        if (Schema::hasTable('nav_items')) {
            return;
        }

        Schema::create('nav_items', function (Blueprint $table) {
            $table->id();
            $table->string('label');
            $table->string('href');
            $table->unsignedInteger('order')->default(0)->index();
            $table->timestamps();
        });

        $rows = SectionVisibility::query()
            ->where('is_visible', true)
            ->ordered()
            ->get()
            ->map(fn (SectionVisibility $section): array => [
                'label' => $section->label,
                'href' => $section->nav_href,
                'order' => $section->order,
                'created_at' => now(),
                'updated_at' => now(),
            ])
            ->all();

        if ($rows !== []) {
            DB::table('nav_items')->insert($rows);
        }
    }
};
