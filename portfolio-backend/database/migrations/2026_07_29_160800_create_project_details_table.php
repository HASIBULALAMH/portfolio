<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The long-form case study body for a project. One row per project at most,
 * created or updated through POST /admin/projects/{id}/case-study.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_details', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')
                ->unique()
                ->constrained('projects')
                ->cascadeOnDelete();
            $table->string('client')->nullable();
            $table->string('date_range')->nullable();
            $table->text('challenge')->nullable();
            $table->text('solution')->nullable();
            // Arrays of plain strings.
            $table->json('results')->nullable();
            $table->json('gallery_images')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_details');
    }
};
