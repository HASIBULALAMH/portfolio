<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gives contact messages the same reply capability meeting requests already have.
 *
 * Mirrors the meeting_requests columns, including `delivery_failed_at` from the
 * start — that column had to be retrofitted onto meeting_requests after a refused
 * delivery turned out to be indistinguishable from a successful one, and there is
 * no reason to repeat the omission here.
 *
 * No `status` column, unlike meeting_requests. There it is a workflow enum that
 * predates the reply feature; here `replied_at` already answers "has this been
 * replied to" without a second field that could disagree with it. Pairing
 * `replied_at` (delivery succeeded) with `delivery_failed_at` (last attempt was
 * refused) covers every state the inbox needs to show.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contact_messages', function (Blueprint $table) {
            $table->text('admin_reply')->nullable()->after('message');
            // Stamped only when the send succeeds, so it never claims the sender
            // was reached when they were not.
            $table->timestamp('replied_at')->nullable()->after('is_read');
            $table->timestamp('delivery_failed_at')->nullable()->after('replied_at');
        });
    }

    public function down(): void
    {
        Schema::table('contact_messages', function (Blueprint $table) {
            $table->dropColumn(['admin_reply', 'replied_at', 'delivery_failed_at']);
        });
    }
};
