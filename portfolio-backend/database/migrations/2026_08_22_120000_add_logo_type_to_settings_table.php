<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Makes the logo an admin-chosen option: an uploaded image, or a word rendered
 * as a styled text logo with no image file at all.
 *
 * `logo_path` is left exactly as it was — the image option still uses it, and
 * keeping both columns populated is deliberate so switching type back and forth
 * in the admin panel never discards the other option's value.
 *
 * The column default is 'text', which is what a fresh install should get: it
 * needs no upload to look finished. But an existing install that already has an
 * uploaded logo is a different case — defaulting those rows to 'text' would
 * silently drop the image the site is currently showing. So rows with a
 * `logo_path` are backfilled to 'image' to preserve exactly what they render
 * today; only rows with no logo (which were already falling back to the text
 * wordmark) stay on 'text'.
 *
 * `logo_text` is left null rather than seeded from `brand_name`: the render path
 * already falls back to the brand name when it is blank, and copying the value
 * in would turn one editable field into two that silently disagree once the
 * admin changes the brand name.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            // Stored as a plain string rather than a DB enum: SQLite (used by
            // the test suite) cannot ALTER an enum's members, so adding a third
            // logo type later would need a table rebuild. Validation lives in
            // SettingRequest, which both drivers honour identically.
            $table->string('logo_type', 16)->default('text')->after('accent_color');
            $table->string('logo_text')->nullable()->after('logo_type');
        });

        DB::table('settings')
            ->whereNotNull('logo_path')
            ->where('logo_path', '!=', '')
            ->update(['logo_type' => 'image']);
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn(['logo_type', 'logo_text']);
        });
    }
};
