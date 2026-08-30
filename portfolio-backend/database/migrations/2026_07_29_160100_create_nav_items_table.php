<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nav_items', function (Blueprint $table) {
            $table->id();
            $table->string('label');
            // Site-relative paths ("/about"), anchors ("#contact") and
            // absolute URLs were all valid here. This table is dropped again by
            // 2026_08_02_120100 in favour of section_visibility; the create is
            // kept so the migration history still replays from scratch.
            $table->string('href');
            $table->unsignedInteger('order')->default(0)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nav_items');
    }
};
