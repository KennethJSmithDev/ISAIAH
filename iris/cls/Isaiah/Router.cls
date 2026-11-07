Include %occStatus

Class Isaiah.Router Extends Ens.BusinessProcess
{
Method OnRequest(input As Isaiah.Request, Output output As Isaiah.Response) As %Status
{
    Set key = ##class(Isaiah.State).TraceKey(input)
    If key = "" {
        Return $$$ERROR($$$GeneralError,"Synthetic routing scope refused.")
    }
    If (input.Action="change-check"), $Data(^IsaiahReceipt(key,1)) {
        Set output = ##class(Isaiah.Response).%New(), output.Payload={}.%FromJSON(^IsaiahReceipt(key,1)).status
        Return $$$OK
    }
    If input.Action'="change-check" { Kill ^IsaiahReceipt(key) }
    Set ^IsaiahInput(key,"priority") = input.Priority
    Set ^IsaiahInput(key,"requested") = input.Requested
    Set ^IsaiahInput(key,"expressAvailable") = input.ExpressAvailable
    Set predicate = input.Predicate
    If (input.Incident="R17"), (input.Action'="replay"), ##class(Isaiah.Change).Enabled() {
        Set config = ##class(Isaiah.Change).Current(), predicate = config.value
        If input.Action="change-check" {
            If config.revision'=$Get(^IsaiahChange("checking",input.RunId)) {
                Return $$$ERROR($$$GeneralError,"The claimed revision is no longer deployed.")
            }
            Set ^IsaiahRoute(key,"revision")=config.revision
        }
    }
    Set selected = $Select(input.Priority=predicate:"Express",1:"Standard")
    Set ^IsaiahRoute(key,"predicate") = predicate
    Set ^IsaiahRoute(key,"selected") = selected
    Set status = ..SendRequestSync(selected,input,.output,10)
    Quit:$$$ISERR(status) status
    If output.Payload = "unavailable" {
        Set status = ..SendRequestSync("Standard",input,.output,10)
    }
    Return status
}
}
