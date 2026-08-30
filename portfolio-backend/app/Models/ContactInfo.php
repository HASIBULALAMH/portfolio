<?php

namespace App\Models;

use App\Models\Concerns\IsSingleton;
use Illuminate\Database\Eloquent\Model;

class ContactInfo extends Model
{
    use IsSingleton;

    protected $table = 'contact_info';

    protected $fillable = [
        'email',
        'phone',
        'location',
        'calendly_link',
        'whatsapp_number',
    ];
}
