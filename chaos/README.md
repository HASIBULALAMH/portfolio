# Local Chaos Checks

These checks are manual and must run only against a disposable local environment.
They never use production credentials, Resend, Cloudflare, or real recipients.

| Fault                            | Injection                                         | Expected result                                                                   | Result                                                                                                                               |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Mail transport unavailable       | Set the local mailer to a throwing test transport | Submission remains saved; visitor receives the normal response; failure is logged | Run with `Mail::shouldReceive('to->send')->andThrow(...)`; covered by `SubmissionNotifierTest` and `PublicSubmissionIntegrationTest` |
| R2 unavailable during upload     | Use invalid local S3 endpoint/credentials         | Upload returns a controlled error; no success path or database pointer is created | Manual run pending local R2 fixture                                                                                                  |
| Database unavailable mid-request | Stop the disposable database before a request     | API returns a controlled 5xx; no partial success is reported                      | Manual run pending disposable DB restart access                                                                                      |

The first scenario is automated because the notifier owns the failure boundary. The
two infrastructure scenarios remain manual: injecting them against a real shared
database or bucket would risk data loss and violate the local-only test scope.
