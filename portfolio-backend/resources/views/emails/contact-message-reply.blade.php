{{--
    Reply sent to someone who submitted the contact form.

    Structurally identical to meeting-request-reply.blade.php — same table-based
    layout, same branding, same escaping of the admin's text — so the two reply
    emails look like they came from the same site.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ filled($subjectLine) ? 'Re: ' . $subjectLine : 'Re: your message' }}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1f2333;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7; padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden;">
                    <tr>
                        <td style="padding:24px 32px; background-color:#4648d4; color:#ffffff;">
                            <h1 style="margin:0; font-size:20px; font-weight:600;">
                                {{ filled($subjectLine) ? 'Re: ' . $subjectLine : 'Re: your message' }}
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 16px; font-size:16px; line-height:1.5;">
                                Hi {{ $recipientName }},
                            </p>

                            <p style="margin:0 0 16px; font-size:16px; line-height:1.5;">
                                Thanks for getting in touch. Here's my reply:
                            </p>

                            {{-- nl2br over an escaped value: preserves the line breaks
                                 the admin typed without allowing raw HTML through. --}}
                            <div style="margin:0 0 24px; padding:16px 20px; background-color:#f4f4f7; border-left:3px solid #4648d4; border-radius:4px; font-size:16px; line-height:1.6; white-space:pre-wrap;">{!! nl2br(e($reply)) !!}</div>

                            <p style="margin:0; font-size:16px; line-height:1.5;">
                                Best regards,<br>
                                <strong>{{ config('mail.from.name') }}</strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 32px 24px; border-top:1px solid #e5e5ef; font-size:13px; color:#6b7280;">
                            You received this email because you sent a message through the contact form.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
