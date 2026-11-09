Include %occStatus

Class Isaiah.ReviewOutbox Extends Ens.BusinessOperation
{
Parameter INVOCATION = "Queue";
Parameter ADAPTER = "Isaiah.ReviewFileAdapter";

Method Notify(input As Isaiah.Request, Output output As Isaiah.Response) As %Status
{
    If '##class(Isaiah.ReviewGate).Valid(input) { Return $$$ERROR($$$GeneralError,"Review notification rejected by scope.") }
    Lock +^IsaiahReviewDispatch(input.RunId):2 Else  Return $$$ERROR($$$GeneralError,"Review notification is busy.")
    Set status = ..Adapter.WriteNotice(input.RunId)
    Set ^IsaiahRun(input.RunId,"notification") = $Select($$$ISOK(status):"written",1:"failed")
    Lock -^IsaiahReviewDispatch(input.RunId)
    Quit:$$$ISERR(status) status
    Set output = ##class(Isaiah.Response).%New(), output.Payload="outbox-written"
    Return $$$OK
}

XData MessageMap
{
<MapItems><MapItem MessageType="Isaiah.Request"><Method>Notify</Method></MapItem></MapItems>
}
}
