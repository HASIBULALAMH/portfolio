<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MeetingRequest extends Model
{
    use SoftDeletes;

    public const STATUS_PENDING = 'pending';
    public const STATUS_REPLIED = 'replied';

    protected $fillable = [
        'name',
        'email',
        'preferred_date',
        'preferred_time',
        'message',
        'status',
        'admin_reply',
        'admin_note',
        'replied_at',
        'delivery_failed_at',
    ];

    protected function casts(): array
    {
        return [
            'preferred_date' => 'date',
            'replied_at' => 'datetime',
            'delivery_failed_at' => 'datetime',
        ];
    }
}
