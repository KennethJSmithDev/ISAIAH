Include %occStatus

Class Isaiah.Investigation Extends Ens.BusinessProcess
{
Method OnRequest(input As Isaiah.Request, Output output As Isaiah.Response) As %Status
{
    Set run = input.RunId
    If '##class(Isaiah.State).Active(run) {
        Return $$$ERROR($$$GeneralError,"Investigation cancelled or expired.")
    }
    Set ^IsaiahRun(run,"stage") = "Native AI Hub investigation in progress"
    Set status = ..SendRequestSync("Agent",input,.decisionResponse,295)
    Quit:$$$ISERR(status) status
    If '##class(Isaiah.State).Active(run) {
        Return $$$ERROR($$$GeneralError,"Investigation cancelled or expired.")
    }
    Set decision = {}.%FromJSON(decisionResponse.Payload)
    Set branch = $Select(decision.branch="diagnostic":"Diagnostic",decision.branch="review":"Review",1:"")
    If branch = "" {
        Return $$$ERROR($$$GeneralError,"Decision requested an unapproved branch.")
    }
    Set ^IsaiahRun(run,"stage") = "Dispatching serialized decision to "_branch
    Set next = ##class(Isaiah.Request).%New()
    Set next.Action="branch", next.RunId=run, next.Incident=input.Incident, next.Payload=decisionResponse.Payload
    Set status = ..SendRequestSync(branch,next,.output,10)
    Quit:$$$ISERR(status) status
    Set ^IsaiahRun(run,"stage") = "Production decision and branch receipt returned"
    Return $$$OK
}
}
