<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Singleton table — see the note on create_settings_table. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('about', function (Blueprint $table) {
            $table->id();
            $table->text('bio_paragraph_1')->nullable();
            $table->text('bio_paragraph_2')->nullable();
            $table->string('image_path')->nullable();
            $table->string('image_alt')->nullable();
            // Array of {label, value} pairs rendered as the stats strip.
            $table->json('stats')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('about');
    }
};
