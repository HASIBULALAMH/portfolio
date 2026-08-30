<?php

namespace Tests\Unit;

use App\Services\ReorderService;
use Tests\TestCase;

/**
 * ReorderService::reorder without a database.
 *
 * The real method opens a transaction and runs multiple UPDATEs, which needs a
 * database. The decision under test is the ordering contract the admin panel
 * sends in: each `{ id, order }` pair is applied in submission order, the
 * `order` value is coerced to an integer (the admin sends HTML-option numbers,
 * which are strings), and the return value is the count of rows the updates
 * actually touched.
 *
 * So the classes below stub the two moving parts the decision depends on — the
 * DB facade's transaction() and a fake eloquent builder whose whereKey() +
 * update() record the query — with zero SQL executed. The real closure is
 * passed through untouched, which is exactly how the method would behave in the
 * integration suite, minus the persistence.
 */
class ReorderServiceTest extends TestCase
{
    /**
     * A fake Eloquent query builder that records the updates it is asked to run.
     *
     * ReorderService calls `$class::query()->whereKey($id)->update([...])`,
     * so this is a chain of three calls the fake has to swallow. `whereKey()`
     * and `update()` mutate the same instance, letting the counts below observe
     * each whereKey/update pair.
     */
    private function builder(array $affected = []): object
    {
        return new class($affected)
        {
            public array $updates = [];

            public array $calls = [];

            private array $affected;

            public function __construct(array $affected)
            {
                $this->affected = $affected;
            }

            public function whereKey(int|string $id): static
            {
                $this->calls[] = ['whereKey' => $id];

                return $this;
            }

            public function update(array $values): int
            {
                $this->calls[] = ['update' => $values];

                $hit = $this->calls[count($this->calls) - 2]['whereKey'] ?? null;

                return in_array($hit, $this->affected, true) ? 1 : 0;
            }
        };
    }

    public function test_each_pair_is_written_in_submission_order(): void
    {
        $builder = $this->builder([9, 7]);

        DB::shouldReceive('transaction')
            ->once()
            ->andReturnUsing(fn ($closure) => $closure());

        $updated = app(ReorderService::class)->reorder($builder, [
            ['id' => 9, 'order' => 0],
            ['id' => 7, 'order' => 1],
        ]);

        $this->assertSame(2, $updated);
        $this->assertSame(
            [
                ['whereKey' => 9],
                ['update' => ['order' => 0]],
                ['whereKey' => 7],
                ['update' => ['order' => 1]],
            ],
            $builder->calls,
            'rows must be reordered in the order the client submitted them',
        );
    }

    public function test_string_orders_are_coerced_to_integers(): void
    {
        // The admin sends the whole list on every arrow click, with order values
        // that come straight from HTML option numbers — i.e. strings.
        $builder = $this->builder([1]);

        DB::shouldReceive('transaction')->once()->andReturnUsing(fn ($closure) => $closure());

        app(ReorderService::class)->reorder($builder, [
            ['id' => 1, 'order' => '4'],
        ]);

        $writes = array_column(array_filter($builder->calls, fn ($call) => isset($call['update'])), 'update');
        $this->assertSame([['order' => 4]], $writes, 'the string "4" must be persisted as the integer 4');
    }

    public function test_the_return_is_the_number_of_rows_actually_updated(): void
    {
        // A split unbind — the admin drags together rows that belong to a
        // different project — still returns 0 rather than pretending success.
        $builder = $this->builder([]);

        DB::shouldReceive('transaction')->once()->andReturnUsing(fn ($closure) => $closure());

        $updated = app(ReorderService::class)->reorder($builder, [
            ['id' => 99, 'order' => 0],
        ]);

        $this->assertSame(0, $updated);
    }

    public function test_a_non_transactional_execution_would_still_pass(): void
    {
        // Guard against a change that strips the wrapping transaction: the
        // reorder must never run partially. DB::transaction is the atomicity
        // boundary — asserting it is called keeps the updates inside it.
        DB::shouldReceive('transaction')
            ->once()
            ->withArgs(fn ($closure) => is_callable($closure))
            ->andReturnUsing(fn ($closure) => $closure());

        app(ReorderService::class)->reorder($this->builder([1]), [
            ['id' => 1, 'order' => 0],
        ]);
    }
}