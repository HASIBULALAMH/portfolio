<?php

namespace App\Http\Requests;

use App\Models\SectionVisibility;
use App\Support\SectionVisibilityPolicy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Bulk update for the admin Sections page: the whole list is posted on every
 * toggle or reorder, as { sections: [{ id, is_visible, order }, ...] }.
 */
class SectionVisibilityBulkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'sections' => ['required', 'array', 'min:1'],
            'sections.*.id' => ['required', 'integer', 'min:1'],
            'sections.*.is_visible' => ['required', 'boolean'],
            'sections.*.order' => ['required', 'integer', 'min:0'],
        ];
    }

    /**
     * Reject an attempt to hide a non-toggleable section.
     *
     * The admin UI renders those toggles disabled, so this only fires for a
     * hand-crafted request — but "the UI does not offer it" is not the same as
     * "the API refuses it", and Hero going missing is not a recoverable state
     * for a portfolio homepage.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $sections = $validator->validated()['sections'] ?? [];

            $locked = SectionVisibility::query()
                ->where('is_toggleable', false)
                ->pluck('label', 'id');

            foreach (SectionVisibilityPolicy::lockedHides($sections, array_keys($locked->all())) as $index) {
                $validator->errors()->add(
                    "sections.{$index}.is_visible",
                    "The {$locked[$sections[$index]['id']]} section cannot be hidden.",
                );
            }
        });
    }

    /**
     * @return array<int, array{id: int, is_visible: bool, order: int}>
     */
    public function sections(): array
    {
        return $this->validated()['sections'];
    }
}
