<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('timeline_items', function (Blueprint $table) {
            $table->id();
            // A string, not a year integer: the admin panel accepts ranges
            // like "2024 — Present" as well as plain years.
            $table->string('year');
            $table->string('title');
            $table->string('company');
            $table->text('description')->nullable();
            $table->unsignedInteger('order')->default(0)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('timeline_items');
    }
};
