Include %occStatus

Class Isaiah.TraceMCPPolicy Extends (%AI.Policy.Authorization, %XML.Adaptor)
{
Parameter XMLNAME = "Authorization";

/// Both the MCP dispatcher and tool implementation check the authenticated principal and scope.
ClassMethod Allows(instance As %String, namespace As %String, production As %String, session As %String) As %Boolean
{
    Set principal=$Get(^IsaiahTrace("mcp","principal"))
    If (principal="") || ($ZCONVERT($USERNAME,"L")'=$ZCONVERT(principal,"L")) { Return 0 }
    If (namespace'=$Namespace) || (production'=$Get(^IsaiahTrace("production"))) { Return 0 }
    If (session'?1.15N) || ((+session)'=session) || ($Get(^IsaiahTrace("session",session))="") { Return 0 }
    Set target=##class(Isaiah.TraceApi).TargetFor(instance)
    Return target.%IsDefined("instance") && (target.production=production) && (target.namespace=namespace)
}

/// Uses the separately configured IRIS audit facility; never writes trace or application state.
ClassMethod Audit(outcome As %String, session As %String = "") As %Status
{
    Set data=outcome
    If (outcome="allowed") && (session?1.15N) { Set data=data_";session="_session }
    Try { Return $SYSTEM.Security.Audit("ISAIAH","MCP","TraceAccess",data,"Scoped MCP trace access") }
    Catch ex { Return $$$ERROR($$$GeneralError,"MCP audit unavailable") }
}

/// Queue access requires its own explicit principal-and-queue grant.
ClassMethod AllowsQueue(instance As %String, namespace As %String, production As %String, queue As %String) As %Boolean
{
    Return ..AllowsItem(instance,namespace,production,queue,"queue")
}

ClassMethod AllowsComponent(instance As %String, namespace As %String, production As %String, component As %String) As %Boolean
{
    Return ..AllowsItem(instance,namespace,production,component,"component")
}

ClassMethod AllowsItem(instance As %String, namespace As %String, production As %String, queue As %String, kind As %String) As %Boolean [ Private ]
{
    Set principal=$Get(^IsaiahTrace("mcp","principal"))
    If (principal="") || ($ZCONVERT($USERNAME,"L")'=$ZCONVERT(principal,"L")) { Return 0 }
    If (namespace'=$Namespace) || (production'=$Get(^IsaiahTrace("production"))) { Return 0 }
    If (queue="") || ($Length(queue)>100) || (queue[";") || '$Get(^IsaiahTrace("mcp",kind,principal,queue)) { Return 0 }
    For i=1:1:$Length(queue) { If $ASCII(queue,i)<32 { Return 0 } }
    Set target=##class(Isaiah.TraceApi).TargetFor(instance)
    Return target.%IsDefined("instance") && (target.production=production) && (target.namespace=namespace)
}

ClassMethod AuditQueue(outcome As %String, queue As %String = "") As %Status
{
    Set data="queue;"_outcome
    If (outcome="allowed") && (queue'="") { Set data=data_";name="_queue }
    Try { Return $SYSTEM.Security.Audit("ISAIAH","MCP","TraceAccess",data,"Scoped MCP queue access") }
    Catch ex { Return $$$ERROR($$$GeneralError,"MCP audit unavailable") }
}

ClassMethod AuditComponent(outcome As %String) As %Status
{
    Try { Return $SYSTEM.Security.Audit("ISAIAH","MCP","TraceAccess","component;"_outcome,"Scoped MCP component access") }
    Catch ex { Return $$$ERROR($$$GeneralError,"MCP audit unavailable") }
}

Method %CanExecute(toolref As %String, call As %DynamicObject, metadata As %DynamicObject) As %Status
{
    Set allowed=0
    Try {
        If call.%Get("name")="ReadSessionTrace" {
            Set args=call.%Get("arguments")
            Set allowed=##class(Isaiah.TraceMCPPolicy).Allows(args.%Get("instance",""),args.%Get("namespace",""),args.%Get("production",""),args.%Get("session",""))
        }
        If call.%Get("name")="ReadQueueSnapshot" {
            Set args=call.%Get("arguments")
            Set allowed=##class(Isaiah.TraceMCPPolicy).AllowsQueue(args.%Get("instance",""),args.%Get("namespace",""),args.%Get("production",""),args.%Get("queue",""))
        }
        If call.%Get("name")="ReadComponentSnapshot" {
            Set args=call.%Get("arguments")
            Set allowed=##class(Isaiah.TraceMCPPolicy).AllowsComponent(args.%Get("instance",""),args.%Get("namespace",""),args.%Get("production",""),args.%Get("component",""))
        }
    } Catch ex { Set allowed=0 }
    If 'allowed {
        Do ##class(Isaiah.TraceMCPPolicy).Audit("denied")
        Return $$$ERROR($$$GeneralError,"MCP tool or scope denied")
    }
    Return $$$OK
}
}
