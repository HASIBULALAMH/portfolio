<?php

namespace App\Support;

/**
 * Rules that gate what may be hidden on the homepage, independent of any
 * Request or database object so they can be unit-tested without a framework.
 *
 * A "locked" section (the hero, and any other row flagged is_toggleable=false)
 * must never become hidden, even briefly: there is no UI to bring it back, and
 * a portfolio homepage without its intro is not a recoverable state. The admin
 * page greys those toggles out, so a violation here only arrives as a
 * hand-crafted request — this is the last line of defence.
 */
final class SectionVisibilityPolicy
{
    private function __construct()
    {
    }

    /**
     * Indexes of submitted sections that would hide a locked section.
     *
     * @param  array<int, array{id: int, is_visible: bool}>  $sections
     * @param  array<int, int>  $lockedIds  ids of sections that may not be hidden
     * @return list<int>
     */
    public static function lockedHides(array $sections, array $lockedIds): array
    {
        $locked = array_fill_keys($lockedIds, true);

        $blocked = [];

        foreach ($sections as $index => $section) {
            if (! empty($locked[$section['id']]) && ! $section['is_visible']) {
                $blocked[] = $index;
            }
        }

        return $blocked;
    }

    /** Whether the section at a given index was hidden against a lock. */
    public static function isHidingLocked(array $sections, array $lockedIds, int $index): bool
    {
        return in_array($index, self::lockedHides($sections, $lockedIds), true);
    }
}