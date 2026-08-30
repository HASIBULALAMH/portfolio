{{--
    Admin notification for a new visitor submission.

    Markup mirrors emails/meeting-request-reply.blade.php: table-based layout
    and inline styles, because mail clients cannot be relied on for anything
    else. Unlike that view, this one is internal — it is only ever sent to the
    admin's own address.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $isMeeting ? 'New meeting request' : 'New contact message' }}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1f2333;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7; padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#ffffff; border-radius:8px; overflow:hidden;">
                    <tr>
                        <td style="padding:24px 32px; background-color:#4648d4; color:#ffffff;">
                            <h1 style="margin:0; font-size:20px; font-weight:600;">
                                {{ $isMeeting ? 'New meeting request' : 'New contact message' }}
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px; line-height:1.5;">
                                <tr>
                                    <td style="padding:0 0 8px; color:#6b7280; width:130px;">From</td>
                                    <td style="padding:0 0 8px;"><strong>{{ $senderName }}</strong></td>
                                </tr>
                                <tr>
                                    <td style="padding:0 0 8px; color:#6b7280;">Email</td>
                                    <td style="padding:0 0 8px;">
                                        <a href="mailto:{{ $senderEmail }}" style="color:#4648d4;">{{ $senderEmail }}</a>
                                    </td>
                                </tr>
                                @foreach ($details as $label => $value)
                                    <tr>
                                        <td style="padding:0 0 8px; color:#6b7280;">{{ $label }}</td>
                                        <td style="padding:0 0 8px;">{{ $value }}</td>
                                    </tr>
                                @endforeach
                            </table>

                            @if (filled($body))
                                <p style="margin:24px 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:0.04em; color:#6b7280;">
                                    Message
                                </p>

                                {{-- nl2br over an escaped value: keeps the visitor's line
                                     breaks without letting raw HTML through. --}}
                                <div style="margin:0; padding:16px 20px; background-color:#f4f4f7; border-left:3px solid #4648d4; border-radius:4px; font-size:16px; line-height:1.6; white-space:pre-wrap;">{!! nl2br(e($body)) !!}</div>
                            @endif
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 32px 24px; border-top:1px solid #e5e5ef; font-size:13px; color:#6b7280;">
                            Sent automatically by the portfolio CMS. Reply to this email to
                            respond to {{ $senderName }} directly.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
