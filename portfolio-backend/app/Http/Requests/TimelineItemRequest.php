<?php

namespace App\Http\Requests;

use App\Models\TimelineItem;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TimelineItemRequest extends FormRequest
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
            'type' => ['required', Rule::in(TimelineItem::TYPES)],
            // Labelled "Institute"/"Subject" for education and
            // "Company"/"Role" for experience — one pair of columns either way.
            'institute_or_company' => ['required', 'string', 'max:255'],
            'subject_or_role' => ['required', 'string', 'max:255'],
            // Strings rather than integers so "Present" is a valid end_year.
            'start_year' => ['required', 'string', 'max:32'],
            'end_year' => ['nullable', 'string', 'max:32'],
            'description' => ['nullable', 'string', 'max:5000'],
            'order' => ['nullable', 'integer', 'min:0'],

            // Derived in prepareForValidation() from the fields above, and
            // listed here so validated() actually returns them — these columns
            // are NOT NULL, so omitting them would fail the insert.
            'year' => ['required', 'string', 'max:64'],
            'title' => ['required', 'string', 'max:255'],
            'company' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * Derive the pre-existing NOT NULL columns from the new fields.
     *
     * `year`, `title` and `company` are still populated so older rows and any
     * consumer reading them keep working; the admin form no longer sends them.
     */
    protected function prepareForValidation(): void
    {
        $start = trim((string) $this->input('start_year'));
        $end = trim((string) $this->input('end_year'));

        $merge = [];

        if ($start !== '') {
            $merge['year'] = $end !== '' ? "{$start} — {$end}" : "{$start} — Present";
        }

        if (filled($this->input('subject_or_role'))) {
            $merge['title'] = $this->input('subject_or_role');
        }

        if (filled($this->input('institute_or_company'))) {
            $merge['company'] = $this->input('institute_or_company');
        }

        if ($end === '') {
            $merge['end_year'] = null;
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}
