<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the downloadable document (PDF spec, design doc, write-up) shown in the
 * Document section of a project's details page. Holds a path/URL from
 * POST /admin/upload, matching how image_path and gallery_images are stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_details', function (Blueprint $table) {
            $table->string('document_path')->nullable()->after('gallery_images');
        });
    }

    public function down(): void
    {
        Schema::table('project_details', function (Blueprint $table) {
            $table->dropColumn('document_path');
        });
    }
};
