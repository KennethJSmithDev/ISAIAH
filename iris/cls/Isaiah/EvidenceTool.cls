Include %occStatus

Class Isaiah.EvidenceTool Extends %AI.Tool
{
Property Name As %String [ InitialExpression = "ISAIAH incident evidence" ];
Property Description As %String [ InitialExpression = "Read one synthetic incident, scoped to the current investigation." ];

/// Read ingress fields, the deployed routing predicate, router selection, and destination receipts.
/// incident: Exact synthetic incident ID from the current task contract.
/// Returns a read-only snapshot and stable evidence references, or an explicit refusal.
ClassMethod ReadIncident(incident As %String) As %DynamicObject
{
    Set run = $Get(^||IsaiahRun)
    If run = "" { Return {"error":"No active investigation scope."} }
    Lock +^IsaiahRun(run):2 Else  Return {"error":"Investigation state unavailable."}
    Set number = $Get(^IsaiahRun(run,"tools"))
    If number >= 24 {
        Lock -^IsaiahRun(run)
        Return {"error":"Tool dispatch budget exhausted."}
    }
    Set number = $Increment(^IsaiahRun(run,"tools"))
    Set result = {"error":"Scope refused before reading fixture data."}
    If ##class(Isaiah.State).Active(run), incident = $Get(^IsaiahRun(run,"incident")) {
        Set result = ##class(Isaiah.State).Fixture(incident)
    }
    Set audit = {"tool":"ReadIncident","input":{"incident":(incident)},"output":(result)}
    Set ^IsaiahRun(run,"audit",number) = audit.%ToJSON()
    Lock -^IsaiahRun(run)
    Return result
}
}
