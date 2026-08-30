<?php

use Database\Seeders\SectionVisibilitySeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per homepage section. This is the single source of truth for both
 * "does this section render" and "does it get a nav link" — the two used to be
 * managed separately (sections hardcoded in page.jsx, links in nav_items),
 * which is how a section could exist with no link, or a link with no section.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('section_visibility', function (Blueprint $table) {
            $table->id();
            // Matches the component slot in page.jsx, e.g. 'api_showcase'.
            $table->string('section_key')->unique();
            // Display name for the nav link.
            $table->string('label');
            // Anchor or path. Anchors must match the target section's DOM id.
            $table->string('nav_href');
            $table->boolean('is_visible')->default(true);
            // Drives page order AND nav order, so the two cannot drift apart.
            $table->unsignedInteger('order')->default(0)->index();
            // False for structural sections the admin must not hide (Hero).
            // Such a row still appears in the admin list — locked, not absent —
            // so its label and position stay visible for context.
            $table->boolean('is_toggleable')->default(true);
            $table->timestamps();
        });

        // Seeded here rather than only in SectionVisibilitySeeder because the
        // next migration (dropping nav_items) migrates labels and ordering
        // onto these rows and needs them to already exist.
        (new SectionVisibilitySeeder)->run();
    }

    public function down(): void
    {
        Schema::dropIfExists('section_visibility');
    }
};
