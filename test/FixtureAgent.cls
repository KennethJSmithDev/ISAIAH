Include %occStatus
/// Test-only stand-in. It does not execute AI Hub or supply native evidence.
Class IsaiahTest.FixtureAgent Extends Ens.BusinessOperation
{
Parameter INVOCATION = "Queue";
Method Investigate(input As Isaiah.Request, Output output As Isaiah.Response) As %Status
{
    If input.Incident="R29" {
        Set decision={"finding":"downstream_fallback","branch":"review","proposal":{"action":"review_destination_availability","from":"Express","to":""},"evidence":["trace:R29","receipts:R29"]}
    } Else {
        Set decision={"finding":"rule_mismatch","branch":"diagnostic","proposal":{"action":"align_match_priority","from":"PRIORITY","to":"P1"},"evidence":["trace:R17","receipts:R17"]}
    }
    Set output=##class(Isaiah.Response).%New(),output.Payload=decision.%ToJSON()
    Return $$$OK
}
XData MessageMap
{
<MapItems><MapItem MessageType="Isaiah.Request"><Method>Investigate</Method></MapItem></MapItems>
}
}
