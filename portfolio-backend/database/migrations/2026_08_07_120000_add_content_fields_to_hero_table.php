<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Moves the last four hardcoded Hero elements into admin-managed data: the
 * rotating role titles, the orbiting tech badges, the availability badge and
 * the social links.
 *
 * `social_links` replaces the fixed github_url/linkedin_url pair. Those two are
 * backfilled into the new array BEFORE they are dropped, so an existing profile
 * keeps both links — GitHub first, LinkedIn second — without the admin having
 * to re-enter them. A column that is null or blank contributes no entry rather
 * than an empty one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hero', function (Blueprint $table) {
            $table->json('roles')->nullable()->after('subheading');
            $table->json('tech_badges')->nullable()->after('roles');
            $table->boolean('is_available')->default(true)->after('tech_badges');
            $table->string('availability_label')->nullable()->after('is_available');
            $table->json('social_links')->nullable()->after('image_alt');
        });

        foreach (DB::table('hero')->select('id', 'github_url', 'linkedin_url')->get() as $row) {
            $links = [];

            foreach (['github' => $row->github_url, 'linkedin' => $row->linkedin_url] as $platform => $url) {
                if (filled($url)) {
                    $links[] = ['platform' => $platform, 'url' => $url];
                }
            }

            DB::table('hero')->where('id', $row->id)->update([
                'social_links' => json_encode($links),
            ]);
        }

        Schema::table('hero', function (Blueprint $table) {
            $table->dropColumn(['github_url', 'linkedin_url']);
        });
    }

    public function down(): void
    {
        Schema::table('hero', function (Blueprint $table) {
            $table->string('github_url')->nullable()->after('image_alt');
            $table->string('linkedin_url')->nullable()->after('github_url');
        });

        // Put the two known platforms back in the columns they came from. Any
        // other link the admin added has no column to return to and goes away
        // with social_links below — unavoidable, the old schema cannot hold it.
        foreach (DB::table('hero')->select('id', 'social_links')->get() as $row) {
            $links = json_decode($row->social_links ?? '[]', true) ?: [];
            $byPlatform = [];

            foreach ($links as $link) {
                if (is_array($link) && filled($link['platform'] ?? null) && filled($link['url'] ?? null)) {
                    $byPlatform[$link['platform']] ??= $link['url'];
                }
            }

            DB::table('hero')->where('id', $row->id)->update([
                'github_url' => $byPlatform['github'] ?? null,
                'linkedin_url' => $byPlatform['linkedin'] ?? null,
            ]);
        }

        Schema::table('hero', function (Blueprint $table) {
            $table->dropColumn([
                'roles', 'tech_badges', 'is_available', 'availability_label', 'social_links',
            ]);
        });
    }
};
