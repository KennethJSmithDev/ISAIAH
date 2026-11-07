Include %occStatus

Class DevTrace.Sink Extends Ens.BusinessOperation
{
Parameter INVOCATION="Queue";

Method OnMessage(input As DevTrace.Request, Output output As Ens.Response) As %Status
{
    Set output=##class(Ens.Response).%New()
    Return $$$OK
}

XData MessageMap
{
<MapItems><MapItem MessageType="DevTrace.Request"><Method>OnMessage</Method></MapItem></MapItems>
}
}
