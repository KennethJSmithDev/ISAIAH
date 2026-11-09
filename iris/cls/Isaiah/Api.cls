Include %occStatus

Class Isaiah.Api Extends %CSP.REST
{
Parameter UseSession = 0;
Parameter CONTENTTYPE = "application/json";
Parameter CHARSET = "utf-8";

XData UrlMap
{
<Routes>
  <Route Url="/health" Method="GET" Call="Health"/>
  <Route Url="/run" Method="POST" Call="Run"/>
  <Route Url="/state/:id" Method="GET" Call="State"/>
  <Route Url="/cancel/:id" Method="POST" Call="Cancel"/>
  <Route Url="/verify/:id" Method="GET" Call="Verification"/>
  <Route Url="/repair" Method="POST" Call="Replay"/>
  <Route Url="/repair/:id" Method="GET" Call="ReplayEvidence"/>
  <Route Url="/change" Method="POST" Call="Change"/>
  <Route Url="/change/:id" Method="GET" Call="ChangeReceipt"/>
  <Route Url="/developer/assist" Method="POST" Call="DeveloperAssist"/>
</Routes>
}

ClassMethod Reply(body As %DynamicObject, status As %String = "200 OK") As %Status
{
    Set %response.Status = status
    Write body.%ToJSON()
    Return $$$OK
}

ClassMethod Health() As %Status
{
    Set status = ##class(Ens.Director).GetProductionStatus(.name,.state)
    Set ready = $$$ISOK(status)&&(state=1)&&(name="Isaiah.Production")&&$Data(^IsaiahReceipt("R17"))&&$Data(^IsaiahReceipt("R29"))
    Set applyEnabled = ##class(Isaiah.Change).Identity(.key)'=""
    Set edition=$Select($ListFind($SYSTEM.Version.GetISCComponents(),"Health"):"iris-for-health",1:"iris")
    Return ..Reply({"namespace":($Namespace),"build":($ZVersion),"production":(name),"ready":(ready),"applyEnabled":(applyEnabled),"edition":(edition)})
}

ClassMethod Run() As %Status
{
    Try {
        Set data = {}.%FromJSON(%request.Content)
        Set run = data.runId, incident = data.incident, model = data.%Get("model","gpt-oss:20b")
        If '##class(Isaiah.State).RunId(run) || '##class(Isaiah.State).Incident(incident) || ($Length(data.objective)<1) || ($Length(data.objective)>1500) || ($Length(data.guidance)>3000) {
            Return ..Reply({"error":"Invalid investigation contract."},"400 Bad Request")
        }
        If '##class(Isaiah.NativeAgent).ValidModel(model) { Return ..Reply({"error":"Invalid selected model."},"400 Bad Request") }
        Lock +^IsaiahRun(run):2 Else  Return ..Reply({"error":"Investigation state is busy."},"409 Conflict")
        If $Data(^IsaiahRun(run)) {
            Lock -^IsaiahRun(run)
            Return ..Reply({"error":"Run ID has already been used."},"409 Conflict")
        }
        Set ^IsaiahRun(run,"incident")=incident, ^IsaiahRun(run,"deadline")=##class(Isaiah.State).Now()+300
        Set ^IsaiahRun(run,"stage")="Request received by ISAIAH Interoperability"
        Lock -^IsaiahRun(run)
        Set status = ##class(Ens.Director).CreateBusinessService("Intake",.service)
        If $$$ISOK(status) {
            Set input = ##class(Isaiah.Request).%New()
            Set input.Incident=incident, input.RunId=run, input.Action="investigate"
            Set input.Payload={"objective":(data.objective),"guidance":(data.guidance),"model":(model)}.%ToJSON()
            Set status = service.ProcessInput(input,.output)
        }
        If $$$ISERR(status) {
            Return ..Reply({"error":"IRIS production did not return a usable decision.","stage":($Get(^IsaiahRun(run,"stage")))},"502 Bad Gateway")
        }
        Set result = {}.%FromJSON(output.Payload)
        Set result.audit = ##class(Isaiah.State).Status(run).tools
        Return ..Reply(result)
    } Catch ex {
        Return ..Reply({"error":"IRIS request failed at the scoped REST application."},"500 Internal Server Error")
    }
}

ClassMethod State(id As %String) As %Status
{
    If '##class(Isaiah.State).RunId(id) { Return ..Reply({"error":"Invalid run ID."},"400 Bad Request") }
    Return ..Reply(##class(Isaiah.State).Status(id))
}

ClassMethod Cancel(id As %String) As %Status
{
    If '##class(Isaiah.State).RunId(id) { Return ..Reply({"error":"Invalid run ID."},"400 Bad Request") }
    Lock +^IsaiahRun(id):2 Else  Return ..Reply({"error":"Investigation state is busy."},"409 Conflict")
    Set ^IsaiahRun(id,"cancelled")=1
    Set already = $Data(^IsaiahRun(id,"branch"))>0
    Lock -^IsaiahRun(id)
    Return ..Reply({"cancelled":true,"branchAlreadyRecorded":(already)})
}

ClassMethod Verification(id As %String) As %Status
{
    If '##class(Isaiah.State).RunId(id) { Return ..Reply({"error":"Invalid run ID."},"400 Bad Request") }
    Set incident = $Get(^IsaiahRun(id,"incident"))
    If '##class(Isaiah.State).Incident(incident) {
        Return ..Reply({"error":"Verification state unavailable."},"404 Not Found")
    }
    Set raw = [], seq = ""
    For {
        Set seq = $Order(^IsaiahReceipt(incident,seq))
        Quit:seq=""
        Do raw.%Push({}.%FromJSON(^IsaiahReceipt(incident,seq)))
    }
    Set receipt = {}.%FromJSON($Get(^IsaiahRun(id,"branch"),"{}"))
    Return ..Reply({"incident":(incident),"incomingPriority":($Get(^IsaiahInput(incident,"priority"))),"requested":($Get(^IsaiahInput(incident,"requested"))),"predicate":($Get(^IsaiahRoute(incident,"predicate"))),"selected":($Get(^IsaiahRoute(incident,"selected"))),"receipts":(raw),"branch":(receipt),"reviewNotification":($Get(^IsaiahRun(id,"notification"),"not-requested"))})
}

ClassMethod Replay() As %Status
{
    Try {
        Set data = {}.%FromJSON(%request.Content), id = data.id, source = data.sourceRun, to = data.to
        If '##class(Isaiah.State).RunId(id) || '##class(Isaiah.State).RunId(source) ||
            ($Length(to)<1) || ($Length(to)>16) || ($Translate(to,"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")'="") {
            Return ..Reply({"error":"Invalid repair replay contract."},"400 Bad Request")
        }
        Set incident = $Get(^IsaiahRun(source,"incident"))
        Set baseline = ##class(Isaiah.State).Fixture("R17"), control = ##class(Isaiah.State).Fixture("R29")
        Set branch = {}.%FromJSON($Get(^IsaiahRun(source,"branch"),"{}"))
        If (incident'="R17") || $Get(^IsaiahRun(source,"cancelled")) ||
            ($Get(^IsaiahRun(source,"stage"))'="Production decision and branch receipt returned") ||
            (branch.mode'="diagnostic") || baseline.%IsDefined("error") || control.%IsDefined("error") ||
            (data.from'=baseline.router.matchPriority) || (data.from'=branch.observedMatchPriority) ||
            ('$Data(^IsaiahInput(incident,"expressAvailable"))) {
            Return ..Reply({"error":"The source incident or baseline does not permit replay."},"409 Conflict")
        }
        Lock +^IsaiahRepair(id):2 Else  Return ..Reply({"error":"Repair state is busy."},"409 Conflict")
        If $Data(^IsaiahRepair(id)) {
            Lock -^IsaiahRepair(id)
            Return ..Reply({"error":"Replay ID has already been used."},"409 Conflict")
        }
        Set ^IsaiahRepair(id,"phase")="running", ^IsaiahRepair(id,"incident")=incident, ^IsaiahRepair(id,"source")=source
        Set ^IsaiahRepair(id,"before")={"incident":(baseline),"control":(control)}.%ToJSON()
        Set created=1
        Lock -^IsaiahRepair(id)
        Set status = ##class(Ens.Director).CreateBusinessService("Intake",.service)
        If $$$ISOK(status) {
            Set input = ##class(Isaiah.Request).%New()
            Set input.Incident=incident, input.RunId=id, input.Action="replay"
            Set input.Priority=baseline.ingress.priority, input.Requested=baseline.ingress.requestedDestination
            Set input.Predicate=to, input.ExpressAvailable=^IsaiahInput(incident,"expressAvailable")
            Set status = service.ProcessInput(input,.output)
        }
        If $$$ISERR(status) {
            Set ^IsaiahRepair(id,"phase")="failed"
            Return ..Reply({"error":"The synthetic replay did not complete."},"502 Bad Gateway")
        }
        Set ^IsaiahRepair(id,"phase")="complete"
        Return ..Reply({"id":(id)})
    } Catch ex {
        If $Get(created) { Set ^IsaiahRepair(id,"phase")="failed" }
        Return ..Reply({"error":"The synthetic replay could not be recorded."},"500 Internal Server Error")
    }
}

ClassMethod ReplayEvidence(id As %String) As %Status
{
    If '##class(Isaiah.State).RunId(id) || ($Get(^IsaiahRepair(id,"phase"))'="complete") {
        Return ..Reply({"error":"Completed replay evidence is unavailable."},"404 Not Found")
    }
    Set before = {}.%FromJSON(^IsaiahRepair(id,"before"))
    Set after = {"incident":(##class(Isaiah.State).Fixture("R17")),"control":(##class(Isaiah.State).Fixture("R29"))}
    Set replay = ##class(Isaiah.State).Trace(id)
    Return ..Reply({"id":(id),"sourceRun":(^IsaiahRepair(id,"source")),"before":(before),"after":(after),"replay":(replay)})
}

ClassMethod Change() As %Status
{
    Try {
        Set data = {}.%FromJSON(%request.Content)
    } Catch ex {
        Return ..Reply({"error":"Invalid change request."},"400 Bad Request")
    }
    Return ..ChangeReply(##class(Isaiah.Change).Process(data))
}

ClassMethod ChangeReceipt(id As %String) As %Status
{
    Return ..ChangeReply(##class(Isaiah.Change).Read(id))
}

ClassMethod ChangeReply(result As %DynamicObject) As %Status
{
    If result.%IsDefined("error") { Return ..Reply({"error":(result.error)},result.httpStatus) }
    Return ..Reply(result)
}

ClassMethod DeveloperAssist() As %Status
{
    Try {
        Set data={}.%FromJSON(%request.Content)
        If '##class(Isaiah.State).RunId(data.runId) || ((data.kind'="trace") && (data.kind'="explain")) ||
            ($Length(data.context)<1) || ($Length(data.context)>20000) || ($Length(data.guidance)>2000) {
            Return ..Reply({"error":"Invalid developer assistance request."},"400 Bad Request")
        }
        If '##class(Isaiah.NativeAgent).ValidModel(data.%Get("model","gpt-oss:20b")) { Return ..Reply({"error":"Invalid selected model."},"400 Bad Request") }
        Set result=##class(Isaiah.NativeAgent).DeveloperAssist(data)
        Return ..Reply(result)
    } Catch ex {
        Return ..Reply({"error":"Native AI Hub could not complete developer assistance."},"502 Bad Gateway")
    }
}
}
