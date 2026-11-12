Include %occStatus

Class Isaiah.TraceApi Extends %CSP.REST
{
Parameter UseSession = 0;
Parameter CONTENTTYPE = "application/json";
Parameter CHARSET = "utf-8";

XData UrlMap
{
<Routes>
  <Route Url="/health" Method="GET" Call="Health"/>
  <Route Url="/session/:id" Method="GET" Call="Session"/>
</Routes>
}

ClassMethod Target() As %DynamicObject [ Private ]
{
    Return ..TargetFor(%request.GetCgiEnv("HTTP_X_ISAIAH_TARGET"))
}

/// Shared target check for the scoped REST and MCP projections.
ClassMethod TargetFor(requested As %String) As %DynamicObject
{
    Set identity=$Get(^IsaiahTrace("identity")), expected=$Get(^IsaiahTrace("production"))
    If (identity="") || (identity'=requested) { Return {} }
    Set status=##class(Ens.Director).GetProductionStatus(.name,.state)
    If $$$ISERR(status) || (state'=1) || (name'=expected) { Return {} }
    Set hub=##class(%Dictionary.CompiledClass).%ExistsId("%AI.Agent")&&##class(%Dictionary.CompiledClass).%ExistsId("%AI.Provider")&&##class(%Dictionary.CompiledClass).%ExistsId("%AI.Tool")
    Set edition=$Select($ListFind($SYSTEM.Version.GetISCComponents(),"Health"):"iris-for-health",1:"iris")
    Return {"instance":(identity),"namespace":($Namespace),"production":(name),"build":($ZVersion),"nativeHub":(hub),"edition":(edition)}
}

ClassMethod Health() As %Status
{
    Set target=..Target()
    If 'target.%IsDefined("instance") { Return ##class(Isaiah.Api).Reply({"error":"Trace target is outside scope."},"403 Forbidden") }
    Return ##class(Isaiah.Api).Reply(target)
}

ClassMethod Session(id As %String) As %Status
{
    Set target=..Target()
    Set result=..SessionData(target,id)
    If 'result.ok { Return ##class(Isaiah.Api).Reply({"error":(result.error)},result.status) }
    Return ##class(Isaiah.Api).Reply(result.data)
}

/// A projection is available only for a pre-authorized session in the active production.
ClassMethod SessionData(target As %DynamicObject, id As %String) As %DynamicObject
{
    If 'target.%IsDefined("instance") || (id'?1.15N) || ((+id)'=id) {
        Return {"ok":0,"error":"Trace session is outside scope.","status":"404 Not Found"}
    }
    Set first=$Get(^IsaiahTrace("session",id))
    If first="" { Return {"ok":0,"error":"Trace session is outside scope.","status":"404 Not Found"} }
    Set sql="SELECT TOP 41 ID, SourceConfigName, TargetConfigName, MessageBodyClassName, Status, IsError, TimeCreated FROM Ens.MessageHeader WHERE SessionId = ? ORDER BY ID"
    Set rows=##class(%SQL.Statement).%ExecDirect(,sql,id), hops=[]
    While rows.%Next() {
        Set header=rows.%Get("ID")
        If (hops.%Size()=0) && (header'=first) {
            Return {"ok":0,"error":"Trace session is outside scope.","status":"404 Not Found"}
        }
        Do hops.%Push({"id":(header_""),"source":(rows.%Get("SourceConfigName")),"target":(rows.%Get("TargetConfigName")),
            "messageClass":(rows.%Get("MessageBodyClassName")_""),"status":(rows.%Get("Status")_""),"error":(+rows.%Get("IsError")),"at":(rows.%Get("TimeCreated"))})
    }
    If (hops.%Size()=0) || (hops.%Size()>40) {
        Return {"ok":0,"error":"Complete bounded trace unavailable.","status":"409 Conflict"}
    }
    Return {"ok":1,"data":{"target":(target),"session":(id),"hops":(hops)}}
}
}
