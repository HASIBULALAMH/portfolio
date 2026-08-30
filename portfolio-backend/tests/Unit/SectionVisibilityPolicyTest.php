<?php

namespace Tests\Unit;

use App\Support\SectionVisibilityPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The locked-row decision from SectionVisibilityBulkRequest, extracted into a
 * pure static helper so it can be unit-tested with zero framework bootstrapping.
 *
 * The decision itself is the load-bearing part: the request drains the DB for
 * the locked set, but "which submitted rows would hide a locked section" is
 * plain array logic, and that is what settling here guards. The request's
 * withValidator() now delegates here, and the behaviour is exercised end-to-end
 * by FormRequestValidationTest.
 */
class SectionVisibilityPolicyTest extends TestCase
{
    use SectionVisibilityPolicyProviders;

    /**
     * @param  array<int, array{id: int, is_visible: bool}>  $submitted
     * @param  list<int>  $lockedIds
     * @param  list<int>  $expected
     */
    #[DataProvider('hideScenarios')]
    public function test_locked_hides(array $submitted, array $lockedIds, array $expected): void
    {
        $this->assertSame($expected, SectionVisibilityPolicy::lockedHides($submitted, $lockedIds));
    }

    public static function hideScenarios(): array
    {
        return [
            'any number of submitted rows, none locked' => [
                [['id' => 1, 'is_visible' => true], ['id' => 2, 'is_visible' => true]],
                [1],
                [],
            ],
            'none submitted hides a locked section' => [
                [['id' => 1, 'is_visible' => true], ['id' => 2, 'is_visible' => true]],
                [10],
                [],
            ],
            'a single hidden locked section is reported once by its index' => [
                [['id' => 1, 'is_visible' => true], ['id' => 2, 'is_visible' => false]],
                [2],
                [1],
            ],
            'every hidden locked section is reported' => [
                [['id' => 1, 'is_visible' => false], ['id' => 2, 'is_visible' => false]],
                [1, 2],
                [0, 1],
            ],
            'a subset of hidden locked sections is reported' => [
                [['id' => 1, 'is_visible' => true], ['id' => 2, 'is_visible' => false], ['id' => 3, 'is_visible' => true]],
                [2, 3],
                [1],
            ],
            'a hidden locked section out of order is reported in its submission order' => [
                [['id' => 2, 'is_visible' => false], ['id' => 1, 'is_visible' => false]],
                [1],
                [1],
            ],
        ];
    }
}