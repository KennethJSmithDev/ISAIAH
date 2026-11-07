Class Isaiah.State
{
ClassMethod Now() As %Integer
{
    Return ($Piece($Horolog,",",1)*86400)+$Piece($Horolog,",",2)
}

ClassMethod Incident(id As %String) As %Boolean
{
    Return (id = "R17") || (id = "R29")
}

ClassMethod RunId(id As %String) As %Boolean
{
    Return (id?36ANP) && ($Translate(id,"0123456789abcdef-")="")
}

ClassMethod Active(run As %String) As %Boolean
{
    Return ($Get(^IsaiahRun(run,"deadline")) > ..Now()) && ('$Get(^IsaiahRun(run,"cancelled")))
}

ClassMethod TraceKey(input As Isaiah.Request) As %String
{
    If '..Incident(input.Incident) { Return "" }
    If input.Action = "fixture" { Return input.Incident }
    If input.Action = "replay", ..RunId(input.RunId),
        $Get(^IsaiahRepair(input.RunId,"incident")) = input.Incident,
        $Get(^IsaiahRepair(input.RunId,"phase")) = "running" { Return input.RunId }
    If input.Action = "change-check", input.Incident = "R17", ..RunId(input.RunId),
        ##class(Isaiah.Change).IsChecking(input.RunId) { Return "change:"_input.RunId }
    Return ""
}

ClassMethod Fixture(incident As %String) As %DynamicObject
{
    If '..Incident(incident) { Return {"error":"Unknown fixture."} }
    Set result = ..Trace(incident)
    If result.%IsDefined("error") { Return result }
    Set result.incident = incident, result.references = [("trace:"_incident),("receipts:"_incident)]
    Return result
}

ClassMethod Trace(key As %String) As %DynamicObject
{
    If '$Data(^IsaiahRoute(key)) { Return {"error":"Trace unavailable."} }
    Set ingress = {"priority":($Get(^IsaiahInput(key,"priority"))),"requestedDestination":($Get(^IsaiahInput(key,"requested")))}
    Set route = {"matchPriority":($Get(^IsaiahRoute(key,"predicate"))),"selectedDestination":($Get(^IsaiahRoute(key,"selected")))}
    Set receipts = []
    Set index = 0
    For {
        Set index = $Order(^IsaiahReceipt(key,index))
        Quit:index=""
        Do receipts.%Push({}.%FromJSON(^IsaiahReceipt(key,index)))
    }
    Return {"ingress":(ingress),"router":(route),"receipts":(receipts)}
}

ClassMethod Status(run As %String) As %DynamicObject
{
    Set audit = []
    Set number = 0
    For {
        Set number = $Order(^IsaiahRun(run,"audit",number))
        Quit:number=""
        Do audit.%Push({}.%FromJSON(^IsaiahRun(run,"audit",number)))
    }
    Return {"stage":($Get(^IsaiahRun(run,"stage"),"Waiting for production")),"tools":(audit)}
}
}
