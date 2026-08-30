<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shared by every `PUT .../reorder` endpoint. The admin panel posts the entire
 * reordered list: { items: [{ id, order }, ...] }.
 */
class ReorderRequest extends FormRequest
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
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer', 'min:1'],
            'items.*.order' => ['required', 'integer', 'min:0'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'items.required' => 'An ordered list of items is required.',
            'items.*.id.required' => 'Every item needs an id.',
            'items.*.order.required' => 'Every item needs an order value.',
        ];
    }

    /**
     * @return array<int, array{id: int, order: int}>
     */
    public function items(): array
    {
        return $this->validated()['items'];
    }
}
