<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('skills', function (Blueprint $table) {
            $table->id();
            // Deleting a category removes its skills — the admin panel warns
            // about exactly this before confirming a category delete.
            $table->foreignId('skill_category_id')
                ->constrained('skill_categories')
                ->cascadeOnDelete();
            $table->string('name');
            $table->string('icon')->nullable();
            $table->unsignedInteger('order')->default(0);
            $table->timestamps();

            $table->index(['skill_category_id', 'order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('skills');
    }
};
