/// Test-only operation: delay beyond the branch's three-second wait, then use the real adapter.
Class IsaiahTest.SlowReviewOutbox Extends Isaiah.ReviewOutbox
{
Method Notify(input As Isaiah.Request, Output output As Isaiah.Response) As %Status
{
    Hang 6
    Return ##super(input,.output)
}
}
