Include %occStatus

Class Isaiah.ReviewGate
{
/// Only a recorded, scoped synthetic review may create an advisory task.
ClassMethod Valid(input As Isaiah.Request) As %Boolean
{
    If (input.Action'="branch") || (input.Incident'="R29") || ('##class(Isaiah.State).RunId(input.RunId)) { Return 0 }
    If input.Incident'=$Get(^IsaiahRun(input.RunId,"incident")) { Return 0 }
    If '$Data(^IsaiahRun(input.RunId,"branch")) { Return 0 }
    Try {
        Set decision = {}.%FromJSON(input.Payload), receipt = {}.%FromJSON(^IsaiahRun(input.RunId,"branch"))
        Return (decision.branch="review") && (receipt.mode="review")
    } Catch ex { Return 0 }
}

/// An IRIS administrator may retry a scoped notice; this does not create a task or approve a change.
ClassMethod Retry(run As %String) As %Status
{
    Set input=##class(Isaiah.Request).%New(),input.Action="branch",input.Incident="R29",input.RunId=run,input.Payload="{""branch"":""review""}"
    If '..Valid(input) { Return $$$ERROR($$$GeneralError,"Review notification rejected by scope.") }
    Set status=##class(Ens.Director).CreateBusinessService("Intake",.service)
    Quit:$$$ISERR(status) status
    Return service.SendRequestSync("ReviewOutbox",input,.response,10)
}
}
