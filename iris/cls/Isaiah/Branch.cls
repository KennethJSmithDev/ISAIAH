Include %occStatus

Class Isaiah.Branch Extends Ens.BusinessOperation
{
Parameter INVOCATION = "Queue";
Parameter SETTINGS = "Mode";
Property Mode As %String(MAXLEN = 16);

Method Record(input As Isaiah.Request, Output output As Isaiah.Response) As %Status
{
    Set run = input.RunId
    Lock +^IsaiahRun(run):2 Else  Return $$$ERROR($$$GeneralError,"Investigation state busy.")
    Try {
        Set decision = {}.%FromJSON(input.Payload)
        If '##class(Isaiah.State).Active(run) || (input.Action'="branch") || (input.Incident'=$Get(^IsaiahRun(run,"incident"))) || (decision.branch'=..Mode) {
            Throw ##class(%Exception.General).%New("Branch dispatch rejected by scope.")
        }
        If ..Mode="diagnostic" {
            Set receipt = {"mode":"diagnostic","operation":"read deployed predicate","observedMatchPriority":($Get(^IsaiahRoute(input.Incident,"predicate")))}
        } Else {
            Set receipt = {"mode":"review","operation":"record human review recommendation"}
        }
        Set ^IsaiahRun(run,"branch") = receipt.%ToJSON()
        Set output = ##class(Isaiah.Response).%New()
        Set output.Payload = {"decision":(decision),"branchReceipt":(receipt)}.%ToJSON()
        Set status = $$$OK
    } Catch ex {
        Set status = $$$ERROR($$$GeneralError,"Branch dispatch rejected by scope.")
    }
    Lock -^IsaiahRun(run)
    Return status
}

XData MessageMap
{
<MapItems>
  <MapItem MessageType="Isaiah.Request"><Method>Record</Method></MapItem>
</MapItems>
}
}
