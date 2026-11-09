Include %occStatus

Class Isaiah.SenderContract
{
/// Reviewed configuration is owned by the change ledger, never by a model or change request.
/// This gate covers only the existing synthetic R17 predicate correction.
ClassMethod Check(sandbox As %String, basis As %DynamicObject) As %DynamicObject
{
    Set refused={"status":"review-required","reason":"No applicable reviewed sender contract."}
    Try {
        Set selected=$Get(^IsaiahChange("sender-contract",sandbox,"active"))
        If selected="" { Return refused }
        Set bytes=$Get(^IsaiahChange("sender-contract",sandbox,"revision",selected))
        If (bytes="") || ($Length(bytes)>16000) { Return refused }
        Set document={}.%FromJSON(bytes), scope=document.scope
        If (document.id="") || (document.revision="") || ($Get(^IsaiahChange("sender-contract",sandbox,"review",selected))="") { Return refused }
        If (scope.instance'=sandbox) || (scope.namespace'=$Namespace) || (scope.production'="Isaiah.Production") ||
            (scope.sender'="R17.synthetic") || (scope.schema'="routing-v1") || (scope.field'="priority") ||
            (scope.action'="predicate-correction") { Return refused }
        Set now=##class(Isaiah.State).Now()
        If (document.effectiveFrom'?1.12N) || (document.effectiveUntil'?1.12N) { Return refused }
        If (document.effectiveFrom>=document.effectiveUntil) || (document.effectiveFrom>now) || (document.effectiveUntil<=now) { Return refused }
        Set identity={"id":(document.id),"revision":(document.revision),"digest":(##class(Isaiah.Change).Digest(bytes)),
            "selection":(+$Get(^IsaiahChange("sender-contract",sandbox,"generation")))}
        If basis.incident.ingress.priority'=document.expectedIncoming {
            Return {"status":"rejected","reason":"Incoming priority disagrees with the sender contract.","identity":(identity)}
        }
        If (document.expectedPredicate'="P1") || (document.destination'="Express") ||
            (basis.incident.ingress.requestedDestination'=document.destination) {
            Return {"status":"rejected","reason":"The predicate proposal disagrees with the sender contract.","identity":(identity)}
        }
        Return {"status":"permitted","identity":(identity)}
    } Catch ex { Return refused }
}

/// Explicit administrative review, with CAS and the existing change mutex/transaction.
/// There is deliberately no REST or MCP route for accepting a sender contract.
ClassMethod Accept(document As %DynamicObject, expected As %String) As %Status
{
    If '$SYSTEM.Security.Check("%Admin_Secure","U") { Return $$$ERROR($$$GeneralError,"Administrative contract review required") }
    Set sandbox=##class(Isaiah.Change).Identity(.key)
    If sandbox="" { Return $$$ERROR($$$GeneralError,"Disposable change sandbox required") }
    If $TLevel { Return $$$ERROR($$$GeneralError,"Contract review requires its own transaction") }
    Set bytes=document.%ToJSON()
    If ($Length(bytes)>16000) || (document.id="") || ($Length(document.id)>64) ||
        ($Translate(document.id,"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.")'="") ||
        (document.revision'?1.6N) || ((+document.revision)'=document.revision) || (document.revision<1) {
        Return $$$ERROR($$$GeneralError,"Invalid contract revision")
    }
    If (document.scope.instance'=sandbox) || (document.scope.namespace'=$Namespace) || (document.scope.production'="Isaiah.Production") {
        Return $$$ERROR($$$GeneralError,"Contract target differs from sandbox")
    }
    If (document.scope.sender'="R17.synthetic") || (document.scope.schema'="routing-v1") ||
        (document.scope.field'="priority") || (document.scope.action'="predicate-correction") ||
        (document.effectiveFrom'?1.12N) || (document.effectiveUntil'?1.12N) || (document.effectiveFrom>=document.effectiveUntil) ||
        ((document.expectedIncoming'="P1") && (document.expectedIncoming'="PRIORITY")) ||
        ((document.expectedPredicate'="P1") && (document.expectedPredicate'="PRIORITY")) || (document.destination'="Express") {
        Return $$$ERROR($$$GeneralError,"Unsupported or malformed synthetic contract")
    }
    Set revision=document.id_":"_document.revision
    Lock +^IsaiahChange("mutex"):3 Else  Return $$$ERROR($$$GeneralError,"Change ledger busy")
    Try {
        If $Get(^IsaiahChange("sender-contract",sandbox,"active"))'=expected { Throw ##class(%Exception.General).%New("Contract review is stale") }
        Set previous=$Get(^IsaiahChange("sender-contract",sandbox,"revision",revision))
        If (previous'="") && (previous'=bytes) { Throw ##class(%Exception.General).%New("Contract revision is immutable") }
        TStart
        Set ^IsaiahChange("sender-contract",sandbox,"revision",revision)=bytes
        If '$Data(^IsaiahChange("sender-contract",sandbox,"review",revision)) {
            Set ^IsaiahChange("sender-contract",sandbox,"review",revision)=$ListBuild($USERNAME,##class(Isaiah.State).Now())
        }
        If expected'=revision {
            Set generation=$Increment(^IsaiahChange("sender-contract",sandbox,"generation"))
            Set ^IsaiahChange("sender-contract",sandbox,"selection",generation)=$ListBuild(expected,revision,$USERNAME,##class(Isaiah.State).Now())
        }
        Set ^IsaiahChange("sender-contract",sandbox,"active")=revision
        TCommit
        Set sc=$$$OK
    } Catch ex { If $TLevel { TRollback } Set sc=ex.AsStatus() }
    Lock -^IsaiahChange("mutex")
    Return sc
}
}
