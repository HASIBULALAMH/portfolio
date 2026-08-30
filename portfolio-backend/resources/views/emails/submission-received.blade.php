{{--
    Acknowledgment sent to the visitor immediately after they submit either
    public form. Says only that the submission arrived — the admin's real
    response is a separate email sent later.

    Table-based layout with inline styles, matching the other two mail views,
    because mail clients cannot be relied on for anything else.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $isMeeting ? 'We received your meeting request' : 'We received your message' }}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1f2333;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7; padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden;">
                    <tr>
                        <td style="padding:24px 32px; background-color:#4648d4; color:#ffffff;">
                            <h1 style="margin:0; font-size:20px; font-weight:600;">
                                {{ $isMeeting ? 'We received your meeting request' : 'We received your message' }}
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 16px; font-size:16px; line-height:1.5;">
                                Hi {{ $recipientName }},
                            </p>

                            @if ($isMeeting)
                                <p style="margin:0 0 16px; font-size:16px; line-height:1.5;">
                                    @if ($requestedSlot)
                                        Thanks for asking to meet — noted for <strong>{{ $requestedSlot }}</strong>.
                                    @else
                                        Thanks for asking to meet.
                                    @endif
                                    Your request has arrived and I will confirm the details shortly.
                                </p>
                            @else
                                <p style="margin:0 0 16px; font-size:16px; line-height:1.5;">
                                    @if ($subjectLine)
                                        Thanks for reaching out about <strong>{{ $subjectLine }}</strong>.
                                    @else
                                        Thanks for reaching out.
                                    @endif
                                    Your message has arrived and I will get back to you soon.
                                </p>
                            @endif

                            <p style="margin:0; font-size:16px; line-height:1.5;">
                                Best regards,<br>
                                <strong>{{ config('mail.from.name') }}</strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 32px 24px; border-top:1px solid #e5e5ef; font-size:13px; color:#6b7280;">
                            This is an automatic confirmation — no reply is needed. A personal
                            response will follow separately.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
