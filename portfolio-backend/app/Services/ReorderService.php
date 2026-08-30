<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class ReorderService
{
    /**
     * Persist a new display order for a list.
     *
     * The admin panel sends the whole reordered list on every arrow click, as
     * `{ items: [{ id, order }, ...] }`. Each row is written inside one
     * transaction so a failure part-way through cannot leave the list in a
     * half-reordered state.
     *
     * @param  class-string<Model>  $modelClass
     * @param  array<int, array{id: int|string, order: int|string}>  $items
     * @return int  number of rows actually updated
     */
    public function reorder(string $modelClass, array $items): int
    {
        return DB::transaction(function () use ($modelClass, $items): int {
            $updated = 0;

            foreach ($items as $item) {
                $updated += $modelClass::query()
                    ->whereKey($item['id'])
                    ->update(['order' => (int) $item['order']]);
            }

            return $updated;
        });
    }
}
