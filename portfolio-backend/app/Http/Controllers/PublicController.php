<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreContactMessageRequest;
use App\Http\Requests\StoreMeetingRequestRequest;
use App\Http\Resources\AboutResource;
use App\Http\Resources\ApiShowcaseResource;
use App\Http\Resources\ContactInfoResource;
use App\Http\Resources\HeroResource;
use App\Http\Resources\ProjectCardResource;
use App\Http\Resources\ProjectResource;
use App\Http\Resources\SectionVisibilityResource;
use App\Http\Resources\SettingResource;
use App\Http\Resources\SkillCategoryResource;
use App\Http\Resources\TestimonialResource;
use App\Http\Resources\TimelineItemResource;
use App\Http\Responses\ApiResponse;
use App\Models\About;
use App\Models\ApiShowcase;
use App\Models\ContactInfo;
use App\Models\ContactMessage;
use App\Models\Hero;
use App\Models\MeetingRequest;
use App\Models\Project;
use App\Models\SectionVisibility;
use App\Models\Setting;
use App\Models\SkillCategory;
use App\Models\Testimonial;
use App\Models\TimelineItem;
use App\Services\SubmissionNotifier;
use Illuminate\Http\JsonResponse;

/**
 * Read-only, unauthenticated endpoints for the public site, plus the two
 * visitor-submitted forms.
 */
class PublicController extends Controller
{
    public function __construct(private readonly SubmissionNotifier $notifier) {}

    public function settings(): JsonResponse
    {
        return ApiResponse::success(
            new SettingResource(Setting::singleton()),
            'Settings retrieved.',
        );
    }

    /**
     * Every section with its visibility flag and position — the one source of
     * truth for what the homepage renders AND what the navbar links to. Hidden
     * rows are included rather than filtered: the caller needs the full list to
     * order what it keeps, and shipping `is_visible: false` is what lets the
     * frontend drop a section and its nav link in the same pass.
     */
    public function sectionVisibility(): JsonResponse
    {
        return ApiResponse::success(
            SectionVisibilityResource::collection(SectionVisibility::query()->ordered()->get()),
            'Section visibility retrieved.',
        );
    }

    public function hero(): JsonResponse
    {
        return ApiResponse::success(
            new HeroResource(Hero::singleton()),
            'Hero section retrieved.',
        );
    }

    public function about(): JsonResponse
    {
        return ApiResponse::success(
            new AboutResource(About::singleton()),
            'About section retrieved.',
        );
    }

    /** Categories with their skills nested inside. */
    public function skills(): JsonResponse
    {
        $categories = SkillCategory::query()
            ->with('skills')
            ->ordered()
            ->get();

        return ApiResponse::success(
            SkillCategoryResource::collection($categories),
            'Skills retrieved.',
        );
    }

    public function timeline(): JsonResponse
    {
        return ApiResponse::success(
            TimelineItemResource::collection(TimelineItem::query()->ordered()->get()),
            'Timeline retrieved.',
        );
    }

    /**
     * List view — the card projection. Neither the case-study body nor
     * `description` is included: the card renders neither, and the description
     * now lives on the details page.
     */
    public function projects(): JsonResponse
    {
        return ApiResponse::success(
            ProjectCardResource::collection(Project::query()->ordered()->get()),
            'Projects retrieved.',
        );
    }

    /** Single project by slug, with its case-study body attached. */
    public function project(string $slug): JsonResponse
    {
        $project = Project::query()
            ->with('detail')
            ->where('slug', $slug)
            ->first();

        if (! $project) {
            return ApiResponse::notFound("No project found with slug \"{$slug}\".");
        }

        return ApiResponse::success(
            new ProjectResource($project),
            'Project retrieved.',
        );
    }

    public function apiShowcases(): JsonResponse
    {
        return ApiResponse::success(
            ApiShowcaseResource::collection(ApiShowcase::query()->ordered()->get()),
            'API showcases retrieved.',
        );
    }

    public function testimonials(): JsonResponse
    {
        return ApiResponse::success(
            TestimonialResource::collection(Testimonial::query()->ordered()->get()),
            'Testimonials retrieved.',
        );
    }

    public function contactInfo(): JsonResponse
    {
        return ApiResponse::success(
            new ContactInfoResource(ContactInfo::singleton()),
            'Contact info retrieved.',
        );
    }

    /**
     * POST /api/contact-messages — visitor contact form.
     *
     * The response deliberately carries no data: a public caller has no reason
     * to read back the stored record.
     *
     * Save first, notify best-effort: the record is committed before any email
     * is attempted, and SubmissionNotifier swallows its own failures. Any new
     * public-facing submission endpoint should follow the same pattern and send
     * BOTH emails — an admin notification and a client acknowledgment — via the
     * same notifier, so a visitor never sees a 500 because mail is
     * misconfigured, and never submits into silence.
     */
    public function storeContactMessage(StoreContactMessageRequest $request): JsonResponse
    {
        $message = ContactMessage::query()->create($request->validated());

        $this->notifier->notifyOfContactMessage($message);

        return ApiResponse::created(
            null,
            'Thanks for reaching out. Your message has been sent.',
        );
    }

    /**
     * POST /api/meeting-requests — visitor meeting request form.
     *
     * Same save-first, notify-best-effort contract as storeContactMessage
     * above: admin notification plus client acknowledgment, neither blocking.
     */
    public function storeMeetingRequest(StoreMeetingRequestRequest $request): JsonResponse
    {
        $meetingRequest = MeetingRequest::query()->create([
            ...$request->validated(),
            'status' => MeetingRequest::STATUS_PENDING,
        ]);

        $this->notifier->notifyOfMeetingRequest($meetingRequest);

        return ApiResponse::created(
            null,
            'Your meeting request has been submitted. I will get back to you by email.',
        );
    }
}
