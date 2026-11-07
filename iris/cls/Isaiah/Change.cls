Include %occStatus

Class Isaiah.Change
{
ClassMethod Enabled() As %Boolean
{
    Return ($SYSTEM.Util.GetEnviron("ISAIAH_APPLY_SANDBOX")="1") && ($Namespace="ISAIAH") &&
        ($ZVersion["2026.3.0AI (Build 154U)")
}

ClassMethod Current() As %DynamicObject
{
    Set config = $Get(^IsaiahChange("config"))
    Return {"value":($ListGet(config,1,"PRIORITY")),"revision":(+$ListGet(config,2,1))}
}

ClassMethod IsChecking(id As %String) As %Boolean
{
    Return ..Enabled() && ($Get(^IsaiahChange("checking",id))>0)
}

ClassMethod Identity(Output key As %String) As %String
{
    Set key = ""
    If '..Enabled() { Return "" }
    Set file = ##class(%Stream.FileCharacter).%New()
    If $$$ISERR(file.LinkToFile("/run/secrets/isaiah-apply-operator")) { Return "" }
    Set sandbox = $Translate(file.ReadLine(),$Char(13)), key = $Translate(file.ReadLine(),$Char(13))
    If '##class(Isaiah.State).RunId(sandbox) || ($Length(key)'=67) || ($Extract(key,1,3)'="IA!") { Return "" }
    Return sandbox
}

ClassMethod OperatorMatches(candidate As %String, key As %String) As %Boolean
{
    If $Length(candidate)'=$Length(key) { Return 0 }
    Set mismatch = 0
    For index=1:1:$Length(key) {
        Set mismatch = mismatch+($Ascii(candidate,index)'=$Ascii(key,index))
    }
    Return mismatch=0
}

ClassMethod Digest(value As %String) As %String
{
    Return $SYSTEM.Encryption.Base64Encode($SYSTEM.Encryption.SHAHash(256,$ZConvert(value,"O","UTF8")),1)
}

ClassMethod Basis() As %DynamicObject
{
    Return {"incident":(##class(Isaiah.State).Fixture("R17")),"control":(##class(Isaiah.State).Fixture("R29"))}
}

ClassMethod Error(code As %String, message As %String) As %DynamicObject
{
    Return {"httpStatus":(code),"error":(message)}
}

ClassMethod Read(id As %String) As %DynamicObject
{
    Set sandbox = ..Identity(.key)
    If sandbox="" { Return ..Error("403 Forbidden","Change workflow is disabled outside its disposable sandbox.") }
    If '##class(Isaiah.State).RunId(id) { Return ..Error("400 Bad Request","Invalid change ID.") }
    Lock +^IsaiahChange("mutex"):3 Else  Return ..Error("409 Conflict","Change is busy. Read its receipt again shortly.")
    Set raw = $Get(^IsaiahChange("record",id)), current = ..Current()
    Lock -^IsaiahChange("mutex")
    If raw="" { Return ..Error("404 Not Found","No change receipt exists for this ID.") }
    Set record = {}.%FromJSON(raw)
    If record.plan.target.sandbox'=sandbox { Return ..Error("409 Conflict","This change belongs to a different sandbox identity.") }
    Set record.current = current
    Return record
}

ClassMethod Process(data As %DynamicObject) As %DynamicObject
{
    Set sandbox = ..Identity(.key), id = data.id
    If sandbox="" { Return ..Error("403 Forbidden","Change workflow is disabled outside its disposable sandbox.") }
    If '##class(Isaiah.State).RunId(id) { Return ..Error("400 Bad Request","Invalid change ID.") }
    If $TLevel { Return ..Error("409 Conflict","Change requests require their own transaction.") }
    Lock +^IsaiahChange("mutex"):3 Else  Return ..Error("409 Conflict","Change is busy. Read its receipt before continuing.")
    Try {
        Set raw = $Get(^IsaiahChange("record",id)), record = {}.%FromJSON($Select(raw="":"{}",1:raw))
        If (raw'=""), (record.plan.target.sandbox'=sandbox) {
            Set result = ..Error("409 Conflict","This change belongs to a different sandbox identity.")
        } ElseIf (data.operation="plan-apply") || (data.operation="plan-rollback") {
            Set result = ..Create(data,sandbox,record)
        } ElseIf raw="" {
            Set result = ..Error("404 Not Found","No change receipt exists for this ID.")
        } ElseIf (data.fingerprint'=record.fingerprint) || (..Digest(record.plan.%ToJSON())'=record.fingerprint) {
            Set result = ..Error("409 Conflict","The supplied fingerprint does not match the sealed plan.")
        } ElseIf data.operation="approve" {
            Set result = ..Approve(record,data.operatorKey,key)
        } ElseIf data.operation="execute" {
            Set result = ..Execute(record)
        } ElseIf data.operation="verify" {
            Set result = ..Verify(record)
        } ElseIf data.operation="reconcile" {
            Set result = ..Reconcile(record)
        } Else {
            Set result = ..Error("400 Bad Request","Unsupported change operation.")
        }
    } Catch ex {
        If $TLevel { TRollback }
        Set result = ..Error("500 Internal Server Error","Change outcome is unknown. Read its receipt before continuing.")
    }
    If 'result.%IsDefined("error") { Set result.current = ..Current() }
    Lock -^IsaiahChange("mutex")
    Return result
}

ClassMethod Store(record As %DynamicObject)
{
    Set ^IsaiahChange("record",record.plan.id) = record.%ToJSON()
}

ClassMethod Create(data As %DynamicObject, sandbox As %String, existing As %DynamicObject) As %DynamicObject
{
    Set kind = $Select(data.operation="plan-apply":"apply",1:"rollback")
    If existing.%IsDefined("plan") {
        Set prior = existing.plan
        If (prior.kind=kind), (prior.sourceRun=data.sourceRun), (prior.replayId=data.replayId), (prior.appliedId=data.appliedId) { Return existing }
        Return ..Error("409 Conflict","This change ID already identifies another request.")
    }
    Set before = ..Current(), basis = ..Basis()
    If basis.incident.%IsDefined("error") || basis.control.%IsDefined("error") {
        Return ..Error("409 Conflict","The original traces are unavailable.")
    }
    If kind="apply" {
        If '..Qualified(data,basis,before) {
            Return ..Error("409 Conflict","A passing R17 replay and matching before-state are required.")
        }
        Set afterValue = "P1", destination = "Express"
    } Else {
        If '##class(Isaiah.State).RunId(data.appliedId) {
            Return ..Error("400 Bad Request","A committed apply ID is required for rollback.")
        }
        Set applied = {}.%FromJSON($Get(^IsaiahChange("record",data.appliedId),"{}"))
        If 'applied.%IsDefined("commit") {
            Return ..Error("409 Conflict","The referenced apply has no commit receipt.")
        }
        If (applied.plan.kind'="apply") || (applied.plan.target.sandbox'=sandbox) ||
            (applied.plan.after.value'=before.value) || (applied.plan.after.revision'=before.revision) ||
            (applied.plan.basisHash'=..Digest(basis.%ToJSON())) {
            Return ..Error("409 Conflict","The referenced apply no longer matches the deployed rule or original evidence.")
        }
        Set afterValue = applied.plan.before.value, destination = "Standard"
    }
    Set target = {"sandbox":(sandbox),"build":"154U","namespace":"ISAIAH","production":"Isaiah.Production","item":"Router","setting":"R17.matchPriority"}
    Set after = {"value":(afterValue),"revision":(before.revision+1)}
    Set plan = {"id":(data.id),"kind":(kind),"policy":"r17-change-v1","target":(target),"sourceRun":(data.sourceRun),
        "replayId":(data.replayId),"appliedId":(data.appliedId),"before":(before),"after":(after),
        "expectedDestination":(destination),"basisHash":(..Digest(basis.%ToJSON()))}
    Set record = {"plan":(plan),"fingerprint":(..Digest(plan.%ToJSON())),"phase":"planned"}
    Do ..Store(record)
    Return record
}

ClassMethod Qualified(data As %DynamicObject, basis As %DynamicObject, before As %DynamicObject) As %Boolean
{
    Set replay = data.replayId, source = data.sourceRun
    If '##class(Isaiah.State).RunId(replay) || '##class(Isaiah.State).RunId(source) { Return 0 }
    If (before.value'="PRIORITY") || (basis.incident.router.matchPriority'=before.value) ||
        (basis.incident.ingress.priority'="P1") || (basis.incident.ingress.requestedDestination'="Express") { Return 0 }
    If ($Get(^IsaiahRepair(replay,"phase"))'="complete") || ($Get(^IsaiahRepair(replay,"source"))'=source) ||
        ($Get(^IsaiahRepair(replay,"incident"))'="R17") || ($Get(^IsaiahRun(source,"incident"))'="R17") ||
        ($Get(^IsaiahRepair(replay,"before"))'=basis.%ToJSON()) { Return 0 }
    Set trace = ##class(Isaiah.State).Trace(replay)
    Return ..Delivered(trace,"P1","Express")
}

ClassMethod Delivered(trace As %DynamicObject, value As %String, destination As %String) As %Boolean
{
    If trace.%IsDefined("error") { Return 0 }
    If (trace.ingress.priority'="P1") || (trace.ingress.requestedDestination'="Express") ||
        (trace.router.matchPriority'=value) || (trace.router.selectedDestination'=destination) ||
        (trace.receipts.%Size()'=1) { Return 0 }
    Set receipt = trace.receipts.%Get(0)
    Return (receipt.destination=destination) && (receipt.status="delivered")
}

ClassMethod BeforeMatches(plan As %DynamicObject) As %Boolean
{
    Set current = ..Current()
    Return (current.value=plan.before.value) && (current.revision=plan.before.revision) &&
        (..Digest(..Basis().%ToJSON())=plan.basisHash)
}

ClassMethod Approve(record As %DynamicObject, candidate As %String, key As %String) As %DynamicObject
{
    If '..OperatorMatches(candidate,key) { Return ..Error("403 Forbidden","Sandbox operator approval key was refused.") }
    If record.%IsDefined("approval") { Return record }
    If '..BeforeMatches(record.plan) { Return ..Error("409 Conflict","Before-state changed. Create a new plan.") }
    Set now = ##class(Isaiah.State).Now()
    Set record.approval = {"actor":"local-sandbox-operator","approvedAt":(now),"expiresAt":(now+300),"consumed":false}
    Set record.phase = "approved"
    Do ..Store(record)
    Return record
}

ClassMethod Execute(record As %DynamicObject) As %DynamicObject
{
    If record.%IsDefined("commit") { Return record }
    If 'record.%IsDefined("approval") { Return ..Error("409 Conflict","Explicit operator approval is required.") }
    If record.approval.consumed || (record.approval.expiresAt<=##class(Isaiah.State).Now()) {
        Return ..Error("409 Conflict","Approval is expired or unavailable.")
    }
    If '..BeforeMatches(record.plan) {
        Set record.phase = "stale"
        Do ..Store(record)
        Return ..Error("409 Conflict","Approved before-state is stale. No change was made.")
    }
    Set after = record.plan.after
    TStart
    Set ^IsaiahChange("config") = $ListBuild(after.value,after.revision)
    Set record.approval.consumed = 1, record.phase = "committed"
    Set record.commit = {"id":(record.plan.id),"value":(after.value),"revision":(after.revision),"at":(##class(Isaiah.State).Now())}
    Do ..Store(record)
    TCommit
    Return record
}

ClassMethod Verify(record As %DynamicObject) As %DynamicObject
{
    If record.%IsDefined("verification") { Return record }
    If record.phase'="committed" {
        Return ..Error("409 Conflict","Verification cannot be repeated while its outcome is unknown or before commit.")
    }
    Set plan = record.plan, current = ..Current(), id = plan.id
    If (current.value'=plan.after.value) || (current.revision'=plan.after.revision) {
        Return ..Error("409 Conflict","The deployed revision changed before verification.")
    }
    Do ..FaultBarrier("before-claim",id)
    Set record.phase = "verifying"
    Set record.dispatch = {"id":(id),"revision":(current.revision),"value":(current.value)}
    TStart
    Do ..Store(record)
    Set ^IsaiahChange("checking",id)=current.revision
    TCommit
    Do ..FaultBarrier("after-claim",id)
    Try {
        Set status = ##class(Ens.Director).CreateBusinessService("Intake",.service)
        If $$$ISOK(status) {
            Set input = ##class(Isaiah.Request).%New(), basis = ..Basis()
            Set input.Incident="R17", input.RunId=id, input.Action="change-check"
            Set input.Priority=basis.incident.ingress.priority, input.Requested=basis.incident.ingress.requestedDestination
            Set input.ExpressAvailable=^IsaiahInput("R17","expressAvailable")
            Set status = service.ProcessInput(input,.output)
        }
    } Catch ex {
        Set status = ex.AsStatus()
    }
    If $$$ISOK(status) { Do ..FaultBarrier("after-receipt",id) }
    Return ..Reconcile(record)
}

ClassMethod Reconcile(record As %DynamicObject) As %DynamicObject
{
    If record.%IsDefined("verification") { Return record }
    If 'record.%IsDefined("commit") {
        Return ..Error("409 Conflict","An approved commit is required before verification.")
    }
    If 'record.%IsDefined("dispatch") { Return record }
    Set plan = record.plan, id = plan.id, dispatch = record.dispatch
    Set trace = ##class(Isaiah.State).Trace("change:"_id)
    If trace.%IsDefined("error") || (trace.receipts.%Size()=0) {
        Set record.phase = "verification_unknown"
        Do ..Store(record)
        Return record
    }
    Kill ^IsaiahChange("checking",id)
    Set intact = (..Digest(..Basis().%ToJSON())=plan.basisHash)
    Set actual = $Get(^IsaiahRoute("change:"_id,"revision"))
    Set captured = {"value":(dispatch.value),"revision":(dispatch.revision)}
    Set passed = intact && (actual=dispatch.revision) && ..Delivered(trace,dispatch.value,plan.expectedDestination)
    Set record.phase = $Select(passed:"verified",1:"verification_failed")
    Set record.verification = {"status":($Select(passed:"pass",1:"fail")),"traceId":("change:"_id),
        "current":(captured),"expectedDestination":(plan.expectedDestination),"originalEvidenceIntact":(intact),"trace":(trace)}
    Do ..Store(record)
    Return record
}

ClassMethod FaultBarrier(point As %String, id As %String) [ Private ]
{
    If $SYSTEM.Util.GetEnviron("ISAIAH_RECOVERY_TEST_HOOKS")'="1" { Quit }
    If $Get(^IsaiahChange("fault",id))'=point { Quit }
    Kill ^IsaiahChange("fault",id)
    Set ^IsaiahChange("fault-hit",id)=$Job
    Hang 45
}
}
