<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_showcases', function (Blueprint $table) {
            $table->id();
            // The name of a lucide-react icon, resolved on the frontend.
            $table->string('icon_name')->nullable();
            $table->string('title');
            $table->text('description')->nullable();
            // Array of plain strings, e.g. "GET /api/projects".
            $table->json('endpoints')->nullable();
            $table->unsignedInteger('order')->default(0)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_showcases');
    }
};
