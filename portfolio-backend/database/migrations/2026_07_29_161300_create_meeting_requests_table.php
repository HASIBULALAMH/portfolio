<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meeting_requests', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->date('preferred_date')->nullable();
            // A free-text time slot ("09:00", "2:00 PM"), not a time column —
            // the public form offers a fixed dropdown of labels.
            $table->string('preferred_time')->nullable();
            $table->text('message')->nullable();
            $table->enum('status', ['pending', 'replied'])->default('pending')->index();
            // Emailed to the requester when the admin replies.
            $table->text('admin_reply')->nullable();
            // Internal only — never included in any email or public response.
            $table->text('admin_note')->nullable();
            $table->timestamp('replied_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meeting_requests');
    }
};
