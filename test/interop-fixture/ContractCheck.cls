Include %occStatus
Class InteropProof.ContractCheck
{
ClassMethod Require(ok As %Boolean, message As %String)
{
    If 'ok { Throw ##class(%Exception.General).%New(message) }
}

/// Test-only administration in a fresh disposable namespace. No model execution.
ClassMethod Run() As %DynamicObject
{
    Set sandbox=##class(Isaiah.Change).Identity(.key)
    Do ..Require(sandbox'="","Disposable apply sandbox required")
    Set original=##class(Isaiah.Change).Basis().%ToJSON()
    Set source=$SYSTEM.Util.CreateGUID(), replay=$SYSTEM.Util.CreateGUID()
    Set source=$ZConvert(source,"L"),replay=$ZConvert(replay,"L")
    Set ^IsaiahRun(source,"incident")="R17"
    Set ^IsaiahRepair(replay,"incident")="R17",^IsaiahRepair(replay,"source")=source,^IsaiahRepair(replay,"before")=original
    Set ^IsaiahRepair(replay,"phase")="running"
    Set sc=##class(Ens.Director).CreateBusinessService("Intake",.service) $$$ThrowOnError(sc)
    Set input=##class(Isaiah.Request).%New(),input.Action="replay",input.Incident="R17",input.RunId=replay
    Set input.Priority="P1",input.Predicate="P1",input.Requested="Express",input.ExpressAvailable=1
    Set sc=service.ProcessInput(input,.output) $$$ThrowOnError(sc)
    Set ^IsaiahRepair(replay,"phase")="complete"
    Set data={"id":($ZConvert($SYSTEM.Util.CreateGUID(),"L")),"operation":"plan-apply","sourceRun":(source),"replayId":(replay),"appliedId":""}
    Set missing=##class(Isaiah.Change).Process(data)
    Do ..Require(missing.%IsDefined("error"),"Missing contract permitted a plan")
    Set now=##class(Isaiah.State).Now()
    Set scope={"instance":(sandbox),"namespace":"ISAIAH","production":"Isaiah.Production","sender":"R17.synthetic","schema":"routing-v1","field":"priority","action":"predicate-correction"}
    Set a={"id":"synthetic-sender","revision":"1","scope":(scope),"effectiveFrom":(now-30),"effectiveUntil":(now+3600),"expectedIncoming":"P1","expectedPredicate":"P1","destination":"Express"}
    Set sc=##class(Isaiah.SenderContract).Accept(a,"") $$$ThrowOnError(sc)
    Set sc=##class(Isaiah.SenderContract).Accept(a,"")
    Do ..Require($SYSTEM.Status.IsError(sc),"Stale contract review accepted")
    Set first=##class(Isaiah.Change).Process(data)
    Do ..Require('first.%IsDefined("error"),"Contract A plan refused")
    Set request={"id":(first.plan.id),"operation":"execute","fingerprint":(first.fingerprint)}
    Do ..Require(##class(Isaiah.Change).Process(request).%IsDefined("error"),"Unapproved execution accepted")
    Set request.operation="approve",request.operatorKey="wrong"
    Do ..Require(##class(Isaiah.Change).Process(request).%IsDefined("error"),"Wrong operator key accepted")
    Set request.operatorKey=key,approved=##class(Isaiah.Change).Process(request)
    Do ..Require(approved.phase="approved","Approval failed")
    Set b={}.%FromJSON(a.%ToJSON()),b.revision="2",b.expectedIncoming="PRIORITY",b.expectedPredicate="PRIORITY"
    Set sc=##class(Isaiah.SenderContract).Accept(b,"synthetic-sender:1") $$$ThrowOnError(sc)
    Set request.operation="execute",stale=##class(Isaiah.Change).Process(request)
    Do ..Require(stale.%IsDefined("error"),"Changed contract did not invalidate approval")
    Set data.id=$ZConvert($SYSTEM.Util.CreateGUID(),"L"),rejected=##class(Isaiah.Change).Process(data)
    Do ..Require(rejected.%IsDefined("error") && (rejected.error["Incoming priority"),"Contract B did not identify incoming discrepancy")
    Set altered={}.%FromJSON(b.%ToJSON()),altered.expectedIncoming="P1"
    Set sc=##class(Isaiah.SenderContract).Accept(altered,"synthetic-sender:2")
    Do ..Require($SYSTEM.Status.IsError(sc),"Accepted revision was mutable")
    Set sc=##class(Isaiah.SenderContract).Accept(a,"synthetic-sender:2") $$$ThrowOnError(sc)
    Set oldRequest={"id":(first.plan.id),"fingerprint":(first.fingerprint),"operation":"execute"}
    Do ..Require(##class(Isaiah.Change).Process(oldRequest).%IsDefined("error"),"Contract restoration revived old approval")
    Set plan=##class(Isaiah.Change).Process(data)
    Do ..Require('plan.%IsDefined("error"),"Restored contract A plan refused")
    Set request={"id":(plan.plan.id),"fingerprint":(plan.fingerprint),"operation":"approve","operatorKey":(key)}
    Set approved=##class(Isaiah.Change).Process(request)
    Set request.operation="execute",applied=##class(Isaiah.Change).Process(request),duplicate=##class(Isaiah.Change).Process(request)
    Do ..Require(applied.commit.%ToJSON()=duplicate.commit.%ToJSON(),"Duplicate commit differs")
    Set request.operation="verify",verified=##class(Isaiah.Change).Process(request),again=##class(Isaiah.Change).Process(request)
    Do ..Require((verified.phase="verified") && (verified.verification.trace.receipts.%Size()=1),"Express delivery not verified")
    Do ..Require(again.verification.%ToJSON()=verified.verification.%ToJSON(),"Duplicate verification differs")
    Set rollback={"id":($ZConvert($SYSTEM.Util.CreateGUID(),"L")),"operation":"plan-rollback","sourceRun":"","replayId":"","appliedId":(applied.plan.id)}
    Set restored=##class(Isaiah.Change).Process(rollback)
    Do ..Require('restored.%IsDefined("error"),"Rollback plan refused")
    Set request={"id":(restored.plan.id),"fingerprint":(restored.fingerprint),"operation":"execute"}
    Do ..Require(##class(Isaiah.Change).Process(request).%IsDefined("error"),"Rollback reused apply approval")
    Set request.operation="approve",request.operatorKey=key,approved=##class(Isaiah.Change).Process(request)
    Set request.operation="execute",committed=##class(Isaiah.Change).Process(request)
    Set request.operation="verify",restored=##class(Isaiah.Change).Process(request)
    Do ..Require((restored.phase="verified") && (restored.current.value="PRIORITY") && (restored.verification.trace.receipts.%Size()=1),"Standard restoration not verified")
    Do ..Require(original=##class(Isaiah.Change).Basis().%ToJSON(),"Original fixtures changed")
    Return {"status":"pass","kind":"fixed-source-real-production-replay-and-change","nativeInference":false,
        "checks":["missing contract refused","explicit reviewed A","stale contract CAS refused","unapproved execution refused","wrong key refused","B discrepancy rejected","changed contract invalidated approval","immutable revisions","restoration did not revive old approval","restored A","duplicate apply and verification","one Express receipt","separate rollback approval","one Standard receipt","original fixtures intact"],
        "apply":(verified),"rollback":(restored)}
}
}
