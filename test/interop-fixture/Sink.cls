Include %occStatus
Class DevTrace.Sink Extends Ens.BusinessOperation
{
Parameter INVOCATION = "Queue";
Method OnMessage(input As DevTrace.Request, Output output As Ens.Response) As %Status
{
    Set output=##class(Ens.Response).%New()
    Return $$$OK
}
/// Synthetic destination: REJECT-prefixed control IDs deliberately receive an AE acknowledgment.
Method OnHL7(input As EnsLib.HL7.Message, Output output As EnsLib.HL7.Message) As %Status
{
    Set control=input.GetValueAt("MSH:10")
    If control="" { Return $$$ERROR($$$GeneralError,"Synthetic message control ID required") }
    Set output=input.NewReplyDocument(,,.sc)
    If $$$ISERR(sc) { Return sc }
    Set code=$Select($Extract(control,1,6)="REJECT":"AE",1:"AA")
    Set sc=output.SetValueAt(code,"MSA:1")
    If $$$ISERR(sc) { Return sc }
    Set sc=output.SetValueAt(control,"MSA:2")
    If $$$ISERR(sc) { Return sc }
    Set receipt={"controlId":(control),"receivedBodyId":(input.%Id()),"ackCode":(code),"ackControlId":(output.GetValueAt("MSA:2")),"at":($ZTIMESTAMP_"")}
    Set ^IsaiahInteropProof("destination",control)=receipt.%ToJSON()
    Return $$$OK
}
XData MessageMap
{
<MapItems><MapItem MessageType="DevTrace.Request"><Method>OnMessage</Method></MapItem><MapItem MessageType="EnsLib.HL7.Message"><Method>OnHL7</Method></MapItem></MapItems>
}
}
