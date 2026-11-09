Include %occStatus

Class Isaiah.TraceMCPTools Extends %AI.ToolSet
{
XData Definition [ MimeType = application/xml ]
{
<ToolSet Name="IsaiahScopedTrace">
  <Policies><Authorization Class="Isaiah.TraceMCPPolicy"/></Policies>
  <Tool Name="ReadSessionTrace" Method="ReadSessionTrace"/>
  <Tool Name="ReadQueueSnapshot" Method="ReadQueueSnapshot"/>
  <Tool Name="ReadComponentSnapshot" Method="ReadComponentSnapshot"/>
</ToolSet>
}

/// Read message headers for one pre-authorized session. A recorded hop is not proof of delivery.
/// instance: Exact configured target identity.
/// namespace: Exact IRIS namespace.
/// production: Exact active production.
/// session: Pre-authorized canonical numeric session ID.
ClassMethod ReadSessionTrace(instance As %String, namespace As %String, production As %String, session As %String) As %DynamicObject
{
    If '##class(Isaiah.TraceMCPPolicy).Allows(instance,namespace,production,session) {
        Do ##class(Isaiah.TraceMCPPolicy).Audit("denied")
        Throw ##class(%Exception.General).%New("MCP tool or scope denied")
    }
    Set target=##class(Isaiah.TraceApi).TargetFor(instance)
    Set result=##class(Isaiah.TraceApi).SessionData(target,session)
    If 'result.ok {
        Do ##class(Isaiah.TraceMCPPolicy).Audit("unavailable")
        Throw ##class(%Exception.General).%New(result.error)
    }
    Set audit=##class(Isaiah.TraceMCPPolicy).Audit("allowed",session)
    If $$$ISERR(audit) { Throw ##class(%Exception.General).%New("MCP audit unavailable; trace not returned") }
    Return result.data
}

/// Read the count for one separately granted production queue. This is a momentary snapshot.
/// instance: Exact configured target identity.
/// namespace: Exact IRIS namespace.
/// production: Exact active production.
/// queue: Exact queue name separately granted by the operator.
ClassMethod ReadQueueSnapshot(instance As %String, namespace As %String, production As %String, queue As %String) As %DynamicObject
{
    If '##class(Isaiah.TraceMCPPolicy).AllowsQueue(instance,namespace,production,queue) {
        Do ##class(Isaiah.TraceMCPPolicy).AuditQueue("denied")
        Throw ##class(%Exception.General).%New("MCP queue scope denied")
    }
    Set count=##class(Ens.Queue).GetCount(queue)
    If count="" {
        Do ##class(Isaiah.TraceMCPPolicy).AuditQueue("unavailable")
        Throw ##class(%Exception.General).%New("Approved queue is unavailable")
    }
    Set target=##class(Isaiah.TraceApi).TargetFor(instance)
    If 'target.%IsDefined("instance") || (target.namespace'=namespace) || (target.production'=production) {
        Do ##class(Isaiah.TraceMCPPolicy).AuditQueue("unavailable")
        Throw ##class(%Exception.General).%New("Target changed during queue read")
    }
    Set audit=##class(Isaiah.TraceMCPPolicy).AuditQueue("allowed",queue)
    If $$$ISERR(audit) { Throw ##class(%Exception.General).%New("MCP audit unavailable; queue not returned") }
    Return {"target":(target),"queue":(queue),"count":(+count),"observedAt":($ZTIMESTAMP_""),"kind":"queue-snapshot","audit":"recorded","authority":"explicit-queue-grant"}
}

/// Read configuration for one granted component; enabled configuration does not prove a healthy job.
/// instance: Exact configured target identity.
/// namespace: Exact IRIS namespace.
/// production: Exact active production.
/// component: Exact component name separately granted by the operator.
ClassMethod ReadComponentSnapshot(instance As %String, namespace As %String, production As %String, component As %String) As %DynamicObject
{
    If '##class(Isaiah.TraceMCPPolicy).AllowsComponent(instance,namespace,production,component) {
        Do ##class(Isaiah.TraceMCPPolicy).AuditComponent("denied")
        Throw ##class(%Exception.General).%New("MCP component scope denied")
    }
    Set owner=##class(Ens.Config.Production).%OpenId(production)
    If '$IsObject(owner) { Throw ##class(%Exception.General).%New("Approved production is unavailable") }
    Set item=owner.FindItemByConfigName(component,.sc)
    If $$$ISERR(sc) || '$IsObject(item) { Throw ##class(%Exception.General).%New("Approved component is unavailable") }
    Set config={"name":(item.Name),"class":(item.ClassName),"enabled":(+item.Enabled),"poolSize":(+item.PoolSize)}
    Set target=##class(Isaiah.TraceApi).TargetFor(instance)
    If 'target.%IsDefined("instance") || (target.namespace'=namespace) || (target.production'=production) {
        Throw ##class(%Exception.General).%New("Target changed during component read")
    }
    Set audit=##class(Isaiah.TraceMCPPolicy).AuditComponent("allowed")
    If $$$ISERR(audit) { Throw ##class(%Exception.General).%New("MCP audit unavailable; component not returned") }
    Return {"target":(target),"component":(config),"kind":"component-config-snapshot","observedAt":($ZTIMESTAMP_""),"audit":"recorded","authority":"explicit-component-grant"}
}
}
