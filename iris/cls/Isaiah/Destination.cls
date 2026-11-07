Include %occStatus

Class Isaiah.Destination Extends Ens.BusinessOperation
{
Parameter INVOCATION = "Queue";
Parameter SETTINGS = "Destination";
Property Destination As %String(MAXLEN = 16);

Method Receive(input As Isaiah.Request, Output output As Isaiah.Response) As %Status
{
    Set key = ##class(Isaiah.State).TraceKey(input)
    If key = "" {
        Return $$$ERROR($$$GeneralError,"Destination accepts only synthetic fixture requests.")
    }
    Set result = $Select((..Destination="Express")&&('input.ExpressAvailable):"unavailable",1:"delivered")
    Set receipt = {"destination":(..Destination),"status":(result)}
    If input.Action="change-check" {
        Lock +^IsaiahReceipt(key):3 Else  Return $$$ERROR($$$GeneralError,"Verification receipt is busy.")
        If $Data(^IsaiahReceipt(key,1)) {
            Set receipt = {}.%FromJSON(^IsaiahReceipt(key,1)), result = receipt.status
        } Else {
            Set ^IsaiahReceipt(key,1) = receipt.%ToJSON()
        }
        Lock -^IsaiahReceipt(key)
    } Else {
        Set number = $Increment(^IsaiahReceiptSeq(key))
        Set ^IsaiahReceipt(key,number) = receipt.%ToJSON()
    }
    Set output = ##class(Isaiah.Response).%New(), output.Payload=result
    Return $$$OK
}

XData MessageMap
{
<MapItems>
  <MapItem MessageType="Isaiah.Request"><Method>Receive</Method></MapItem>
</MapItems>
}
}
