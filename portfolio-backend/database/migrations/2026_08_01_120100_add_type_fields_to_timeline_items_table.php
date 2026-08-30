<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Turns timeline_items into one table serving both education and experience
 * entries, rather than two tables. `type` selects the variant, and the two
 * shared columns are relabelled by the UI:
 *
 *   education   institute_or_company = institute, subject_or_role = subject
 *   experience  institute_or_company = company,   subject_or_role = role
 *
 * The original `year`, `title` and `company` columns are kept: `year` still
 * backs the display string (it accepts ranges like "2024 — Present", which
 * start_year/end_year cannot express), and dropping the other two would throw
 * away data for no gain. They are backfilled into the new columns below.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('timeline_items', function (Blueprint $table) {
            // String rather than a DB enum: adding a variant later then needs a
            // code change, not a schema migration. The API validates the value.
            $table->string('type')->default('experience')->after('id')->index();
            $table->string('institute_or_company')->nullable()->after('type');
            $table->string('subject_or_role')->nullable()->after('institute_or_company');
            // Strings, for the same reason `year` is: "Present" is a valid end.
            $table->string('start_year')->nullable()->after('subject_or_role');
            $table->string('end_year')->nullable()->after('start_year');
        });

        // Backfill from the pre-existing columns so nothing has to be re-entered.
        DB::table('timeline_items')->update([
            'institute_or_company' => DB::raw('company'),
            'subject_or_role' => DB::raw('title'),
            'start_year' => DB::raw('year'),
        ]);

        // Best-effort type guess for existing rows. Academic wording is the only
        // signal available; anything unmatched stays 'experience', and the admin
        // can correct it in the form.
        DB::table('timeline_items')
            ->where(function ($query) {
                foreach (['diploma', 'bsc', 'b.sc', 'msc', 'm.sc', 'degree', 'bachelor', 'master', 'engneering', 'engineering', 'university', 'univarcity', 'college', 'polytechnic', 'school', 'institute'] as $needle) {
                    $query->orWhere('title', 'like', "%{$needle}%")
                        ->orWhere('company', 'like', "%{$needle}%");
                }
            })
            ->update(['type' => 'education']);
    }

    public function down(): void
    {
        Schema::table('timeline_items', function (Blueprint $table) {
            $table->dropColumn([
                'type',
                'institute_or_company',
                'subject_or_role',
                'start_year',
                'end_year',
            ]);
        });
    }
};
