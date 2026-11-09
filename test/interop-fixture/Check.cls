Include %occStatus
Class InteropProof.Check Extends %RegisteredObject
{
ClassMethod Run() As %DynamicObject
{
    Set sc=##class(Ens.Director).CreateBusinessService("Fixture Intake",.service)
    $$$ThrowOnError(sc)
    Set cases=[]
    For i=1:1:2 {
        Set control=$Select(i=1:"ACCEPT",1:"REJECT")_"-"_$Translate($SYSTEM.Util.CreateGUID(),"{}-","")
        Set text="MSH|^~\&|ISAIAH|SYNTHETIC|TARGET|SYNTHETIC|202601011200||ADT^A01|"_control_"|P|2.5"_$Char(13)_"EVN|A01|202601011200"_$Char(13)
        Set message=##class(EnsLib.HL7.Message).ImportFromString(text,.sc)
        $$$ThrowOnError(sc)
        Set message.DocType="2.5:ADT_A01"
        Set sc=service.ProcessInput(message,.ack)
        $$$ThrowOnError(sc)
        Set receipt={}.%FromJSON($Get(^IsaiahInteropProof("destination",control)))
        Set expected=$Select(i=1:"AA",1:"AE")
        If (ack.GetValueAt("MSA:1")'=expected)||(ack.GetValueAt("MSA:2")'=control)||(receipt.controlId'=control)||(receipt.ackCode'=expected)||(receipt.receivedBodyId'=message.%Id()) {
            Throw ##class(%Exception.General).%New("HL7 correlation mismatch")
        }
        Do cases.%Push({"controlId":(control),"bodyId":(message.%Id()),"ack":(expected),"receipt":(receipt)})
    }
    Return {"status":"pass","fixture":"synthetic-in-process-HL7","cases":(cases)}
}
}
