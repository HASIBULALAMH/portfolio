<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Singleton table — exactly one row, seeded with empty defaults by
 * SettingsSeeder. Nothing enforces the single row at the database level; the
 * application always reads and writes row 1 via Settings::singleton().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('site_title')->nullable();
            $table->string('brand_name')->nullable();
            $table->text('footer_text')->nullable();
            $table->string('copyright_text')->nullable();
            $table->string('accent_color', 32)->nullable();
            $table->string('favicon_path')->nullable();
            $table->string('logo_path')->nullable();
            // The admin panel's FileUpload component collects alt text next to
            // every image, so each image column has a matching *_alt column.
            $table->string('logo_alt')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
