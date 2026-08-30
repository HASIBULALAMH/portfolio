<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets the inbox distinguish a reply that reached the client from one that did not.
 *
 * Before this, `status` was flipped to 'replied' before the send was even
 * attempted, so a refused delivery and a successful one looked identical in the
 * admin list. The transient error toast was the only signal, and it disappeared
 * after three seconds.
 *
 * A nullable timestamp rather than a boolean: "when did delivery last fail" is
 * strictly more information than "did it fail", and null already carries the
 * "no failure outstanding" meaning without a second default to keep in sync.
 *
 * No new `status` value is introduced. The column is an enum of pending/replied,
 * and a third member would need a table rebuild on some drivers; more to the
 * point, delivery failure is orthogonal to where the request sits in the
 * workflow — a request can be replied-and-failed (a retry that did not land) or
 * pending-and-failed (a first attempt that did not land), and one enum cannot
 * express both without collapsing information.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('meeting_requests', function (Blueprint $table) {
            $table->timestamp('delivery_failed_at')->nullable()->after('replied_at');
        });
    }

    public function down(): void
    {
        Schema::table('meeting_requests', function (Blueprint $table) {
            $table->dropColumn('delivery_failed_at');
        });
    }
};
