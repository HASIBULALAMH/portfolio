<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `icon_slug` to both `skills` and `api_showcases`.
 *
 * The column stores a Simple Icons slug (e.g. "laravel", "vuedotjs"), never an
 * image: the frontend renders the SVG from the slug via the `simple-icons`
 * package, so the brand mark stays correct without any uploads.
 *
 * The pre-existing `icon` / `icon_name` columns are deliberately kept. They
 * hold different things — a free-text badge label and a lucide-react icon name
 * respectively — and both frontends fall back to them whenever `icon_slug` is
 * null, so unmigrated rows keep rendering exactly as they did before.
 */
return new class extends Migration
{
    /**
     * Skill names that map cleanly onto a Simple Icons slug.
     *
     * Deliberately conservative: only entries whose brand identity is
     * unambiguous are listed. Anything absent stays null and falls back, which
     * is the safer failure mode — a wrong logo is worse than a generic badge.
     *
     * Keys are normalised names (see normalise()), values are Simple Icons slugs.
     *
     * @var array<string, string>
     */
    private const NAME_TO_SLUG = [
        'php' => 'php',
        'laravel' => 'laravel',
        'livewire' => 'livewire',
        'symfony' => 'symfony',
        'javascript' => 'javascript',
        'js' => 'javascript',
        'typescript' => 'typescript',
        'ts' => 'typescript',
        'node' => 'nodedotjs',
        'nodejs' => 'nodedotjs',
        'express' => 'express',
        'react' => 'react',
        'reactjs' => 'react',
        'nextjs' => 'nextdotjs',
        'next' => 'nextdotjs',
        'vue' => 'vuedotjs',
        'vuejs' => 'vuedotjs',
        'nuxt' => 'nuxt',
        'angular' => 'angular',
        'svelte' => 'svelte',
        'jquery' => 'jquery',
        'alpinejs' => 'alpinedotjs',
        'html' => 'html5',
        'html5' => 'html5',
        'css' => 'css',
        'css3' => 'css',
        'sass' => 'sass',
        'scss' => 'sass',
        'tailwind' => 'tailwindcss',
        'tailwindcss' => 'tailwindcss',
        'bootstrap' => 'bootstrap',
        'mysql' => 'mysql',
        'mariadb' => 'mariadb',
        'postgresql' => 'postgresql',
        'postgres' => 'postgresql',
        'sqlite' => 'sqlite',
        'mongodb' => 'mongodb',
        'redis' => 'redis',
        'elasticsearch' => 'elasticsearch',
        'docker' => 'docker',
        'kubernetes' => 'kubernetes',
        'nginx' => 'nginx',
        'apache' => 'apache',
        'linux' => 'linux',
        'ubuntu' => 'ubuntu',
        'git' => 'git',
        'github' => 'github',
        'gitlab' => 'gitlab',
        'bitbucket' => 'bitbucket',
        'python' => 'python',
        'django' => 'django',
        'flask' => 'flask',
        'go' => 'go',
        'golang' => 'go',
        'rust' => 'rust',
        'ruby' => 'ruby',
        'rails' => 'rubyonrails',
        'swift' => 'swift',
        'kotlin' => 'kotlin',
        'flutter' => 'flutter',
        'dart' => 'dart',
        'graphql' => 'graphql',
        'firebase' => 'firebase',
        'supabase' => 'supabase',
        'vercel' => 'vercel',
        'netlify' => 'netlify',
        'cloudflare' => 'cloudflare',
        'digitalocean' => 'digitalocean',
        'heroku' => 'heroku',
        'jest' => 'jest',
        'vitest' => 'vitest',
        'cypress' => 'cypress',
        'composer' => 'composer',
        'npm' => 'npm',
        'yarn' => 'yarn',
        'vite' => 'vite',
        'webpack' => 'webpack',
        'figma' => 'figma',
        'postman' => 'postman',
        'stripe' => 'stripe',
        'paypal' => 'paypal',
        'jira' => 'jira',
        'slack' => 'slack',
        'wordpress' => 'wordpress',
    ];

    public function up(): void
    {
        Schema::table('skills', function (Blueprint $table) {
            $table->string('icon_slug')->nullable()->after('icon');
        });

        Schema::table('api_showcases', function (Blueprint $table) {
            $table->string('icon_slug')->nullable()->after('icon_name');
        });

        $this->backfillSkills();
    }

    public function down(): void
    {
        Schema::table('skills', function (Blueprint $table) {
            $table->dropColumn('icon_slug');
        });

        Schema::table('api_showcases', function (Blueprint $table) {
            $table->dropColumn('icon_slug');
        });
    }

    /**
     * Best-effort backfill for skills, matched on the skill's own name.
     *
     * `api_showcases` is intentionally left alone: its `icon_name` holds
     * lucide concept icons ("Zap", "Database", "Webhook") that describe a
     * capability rather than naming a brand, so there is nothing honest to map
     * them onto. Those rows keep rendering their lucide icon until an admin
     * picks a real logo.
     */
    private function backfillSkills(): void
    {
        DB::table('skills')
            ->select('id', 'name')
            ->orderBy('id')
            ->chunkById(200, function ($skills) {
                foreach ($skills as $skill) {
                    $slug = self::NAME_TO_SLUG[$this->normalise($skill->name)] ?? null;

                    if ($slug !== null) {
                        DB::table('skills')
                            ->where('id', $skill->id)
                            ->update(['icon_slug' => $slug]);
                    }
                }
            });
    }

    /**
     * Fold a human-typed name onto a lookup key: "Vue.js" and "vue js" both
     * become "vuejs". Kept separate from the Simple Icons slug rules because
     * this only has to be stable across the map above, not reversible.
     */
    private function normalise(?string $name): string
    {
        return preg_replace('/[^a-z0-9]/', '', strtolower((string) $name)) ?? '';
    }
};
