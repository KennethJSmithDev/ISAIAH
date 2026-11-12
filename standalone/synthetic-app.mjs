import { generateSyntheticMapping } from './development-plan.mjs';

export const syntheticEmitterRevision = 'synthetic-hl7-fhir.v4';

// One fixed synthetic application scaffold. Model output can select only the verified mapping contract.
export function syntheticApplication(plan, facilitySide) {
  return {
    'module.xml': `<Export generator="Cache" version="25"><Document name="isaiah-devx-fixture.ZPM"><Module><Name>isaiah-devx-fixture</Name><Version>0.0.1</Version><Packaging>module</Packaging><SourcesRoot>src</SourcesRoot><SystemRequirements Version=">=2026.3" Interoperability="enabled"/><Resource Name="IsaiahDevx.PKG"/></Module></Document></Export>\n`,
    'src/cls/IsaiahDevx/Mapping.cls': generateSyntheticMapping(plan, facilitySide),
    'src/cls/IsaiahDevx/ResourceRequest.cls': `Class IsaiahDevx.ResourceRequest Extends Ens.Request
{
Property ControlId As %String(MAXLEN=64);
Property ResourceJSON As %String(MAXLEN=12000);
Property IncomingBodyId As %String;
}
`,
    'src/cls/IsaiahDevx/Response.cls': `Class IsaiahDevx.Response Extends Ens.Response
{
Property Payload As %String(MAXLEN=16000);
}
`,
    'src/cls/IsaiahDevx/Intake.cls': `Class IsaiahDevx.Intake Extends Ens.BusinessService
{
Method OnProcessInput(input As %RegisteredObject, Output output As %RegisteredObject) As %Status
{
    Return ..SendRequestSync("Devx Transform",input,.output,20)
}
}
`,
    'src/cls/IsaiahDevx/Transform.cls': `Include %occStatus
Class IsaiahDevx.Transform Extends Ens.BusinessProcess
{
Method OnRequest(input As EnsLib.HL7.Message, Output output As IsaiahDevx.Response) As %Status
{
    Try {
        If input.GetValueAt("MSH:3")'="ISAIAHDEVX" { Throw ##class(%Exception.General).%New("Synthetic sender required") }
        Set resource=##class(IsaiahDevx.Mapping).Build(input)
        If $Extract(resource.name,1,7)'="ISAIAH-" { Throw ##class(%Exception.General).%New("Synthetic facility required") }
        Set request=##class(IsaiahDevx.ResourceRequest).%New()
        Set request.ControlId=resource.id,request.ResourceJSON=resource.%ToJSON(),request.IncomingBodyId=input.%Id()
        Return ..SendRequestSync("FHIR Destination",request,.output,20)
    } Catch ex { Return $$$ERROR($$$GeneralError,"Synthetic HL7 contract validation failed") }
}
}
`,
    'src/cls/IsaiahDevx/Destination.cls': `Include %occStatus
Class IsaiahDevx.Destination Extends Ens.BusinessOperation
{
Parameter INVOCATION="Queue";
ClassMethod SafeId(value As %String) As %Boolean
{
    Return ($Length(value)>0) && ($Length(value)<=64) && (value'=".") && (value'="..") && ($Translate(value,"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.")="")
}
ClassMethod Endpoint() As %DynamicObject
{
    Set file=##class(%Stream.FileCharacter).%New()
    Set sc=file.LinkToFile("/tmp/isaiah-devx017/fhir.json")
    If $$$ISERR(sc) || (file.Size>4096) { Throw ##class(%Exception.General).%New("Private fixture destination configuration unavailable") }
    Set endpoint={}.%FromJSON(file.Read(4096))
    If (endpoint.port'?1.5N) || (endpoint.port<1) || (endpoint.port>65535) { Throw ##class(%Exception.General).%New("Invalid fixture port") }
    If endpoint.%IsDefined("mode") || endpoint.%IsDefined("fhirVersion") || endpoint.%IsDefined("targetId") {
        If (endpoint.mode'="conditional-create") || (endpoint.host'="127.0.0.1") || ('..SafeId(endpoint.targetId)) ||
            ('$ListFind($ListBuild("4.0.1","4.3.0","5.0.0"),endpoint.fhirVersion)) {
            Throw ##class(%Exception.General).%New("Invalid conditional-create fixture configuration")
        }
        Set endpoint.base="/fhir/"
    } Else {
        Set endpoint.mode="legacy",endpoint.fhirVersion="5.0.0",endpoint.targetId="legacy-r5",endpoint.base="/isaiah-proof/fhir/r5/"
    }
    Set scope=[($ZCONVERT(endpoint.host,"L")),(+endpoint.port),(endpoint.base),(endpoint.fhirVersion),(endpoint.mode),(endpoint.targetId)]
    Set endpoint.identity=##class(Isaiah.Change).Digest(scope.%ToJSON())
    Return endpoint
}
ClassMethod HTTP(endpoint As %DynamicObject) As %Net.HttpRequest
{
    Set http=##class(%Net.HttpRequest).%New()
    Set http.Server=endpoint.host,http.Port=endpoint.port,http.Username=endpoint.username,http.Password=endpoint.password,http.Timeout=5
    Set http.ContentType="application/fhir+json",http.FollowRedirect=0,http.ProxyServer="",http.WriteTimeout=5
    Do http.SetHeader("Accept","application/fhir+json")
    Do http.SetHeader("Cache-Control","no-cache")
    Return http
}
ClassMethod ReadJSON(endpoint As %DynamicObject, path As %String, limit As %Integer) As %DynamicObject
{
    Set http=..HTTP(endpoint),sc=http.Get(path)
    If $$$ISERR(sc) || '$IsObject(http.HttpResponse) || (http.HttpResponse.StatusCode'=200) ||
        ('$IsObject(http.HttpResponse.Data)) || (http.HttpResponse.Data.Size>limit) {
        Throw ##class(%Exception.General).%New("Fixture read failed")
    }
    Return {}.%FromJSON(http.HttpResponse.Data)
}
ClassMethod CheckVersion(endpoint As %DynamicObject)
{
    Set statement=..ReadJSON(endpoint,endpoint.base_"metadata",8388608)
    If (statement.resourceType'="CapabilityStatement") || (statement.fhirVersion'=endpoint.fhirVersion) {
        Throw ##class(%Exception.General).%New("Fixture FHIR version mismatch")
    }
    If endpoint.mode="legacy" { Quit }
    Set matches=0,allowed=0
    For i=0:1:statement.rest.%Size()-1 {
        Set rest=statement.rest.%Get(i)
        If rest.mode="server" {
            For j=0:1:rest.resource.%Size()-1 {
                Set item=rest.resource.%Get(j)
                If item.type="Organization" { Set matches=matches+1,allowed=(item.%GetTypeOf("conditionalCreate")="boolean") && (item.conditionalCreate=1) }
            }
        }
    }
    If (matches'=1) || 'allowed { Throw ##class(%Exception.General).%New("Organization conditional create unavailable") }
}
ClassMethod Query(control As %String) As %String
{
    Return "identifier=urn%3Aisaiah%3Asynthetic%3Acontrol-id%7C"_control
}
ClassMethod Find(endpoint As %DynamicObject, control As %String) As %String
{
    Set bundle=..ReadJSON(endpoint,endpoint.base_"Organization?"_..Query(control)_"&_count=2",65536)
    If (bundle.resourceType'="Bundle") || (bundle.type'="searchset") {
        Throw ##class(%Exception.General).%New("Fixture search evidence invalid")
    }
    If bundle.%IsDefined("link") {
        For i=0:1:bundle.link.%Size()-1 {
            If bundle.link.%Get(i).relation="next" { Throw ##class(%Exception.General).%New("Fixture search is ambiguous") }
        }
    }
    Set count=0 If bundle.%IsDefined("entry") { Set count=bundle.entry.%Size() }
    If (count>1) || (bundle.%IsDefined("total") && (bundle.total'=count)) {
        Throw ##class(%Exception.General).%New("Fixture search is ambiguous")
    }
    If count=0 { Return "" }
    Set value=bundle.entry.%Get(0).resource
    If (value.resourceType'="Organization") || '..SafeId(value.id) || (..Identifier(value,"urn:isaiah:synthetic:control-id")'=control) {
        Throw ##class(%Exception.General).%New("Fixture search identity mismatch")
    }
    Return value.id
}
ClassMethod Identifier(value As %DynamicObject, system As %String) As %String
{
    Set found="",count=0
    If '$IsObject(value.identifier) { Return "" }
    For i=0:1:value.identifier.%Size()-1 {
        Set item=value.identifier.%Get(i)
        If item.system=system { Set count=count+1,found=item.value }
    }
    Return $Select(count=1:found,1:"")
}
ClassMethod Readback(endpoint As %DynamicObject, control As %String, expected As %DynamicObject) As %DynamicObject
{
    Set result={"phase":"review","delivery":"unverified"},id=control,count=1
    If endpoint.mode="conditional-create" { Set id=..Find(endpoint,control),count=2 }
    If id="" { Return result }
    Set value=..ReadJSON(endpoint,endpoint.base_"Organization/"_id,65536)
    If (value.resourceType'="Organization") || (value.id'=id) || (value.name'=expected.name) || (value.%GetTypeOf("active")'="boolean") || (value.active'=1) ||
        ('$IsObject(value.identifier)) || (value.identifier.%Size()'=count) || (value.meta.%GetTypeOf("versionId")'="string") || ('..SafeId(value.meta.versionId)) ||
        (..Identifier(value,"urn:isaiah:synthetic:facility")'=expected.name) { Return result }
    If (count=2) && (..Identifier(value,"urn:isaiah:synthetic:control-id")'=control) { Return result }
    Return {"phase":"delivered","delivery":"verified-resource-readback","resourceType":"Organization","id":(value.id),"versionId":(value.meta.versionId),"facility":(value.name),"observedAt":($ZTIMESTAMP_"")}
}
ClassMethod ScopedClaim(endpoint As %DynamicObject, control As %String) As %Boolean
{
    Return $Get(^IsaiahDevx("claim",control,"target"))=endpoint.identity
}
ClassMethod Receipt(control As %String, endpoint As %DynamicObject = "") As %DynamicObject
{
    Set result={"phase":"review","delivery":"unverified"}
    Try {
        If '$IsObject(endpoint) { Set endpoint=..Endpoint() }
        Set historical=(endpoint.mode="legacy")&&('$Data(^IsaiahDevx("claim",control,"target")))
        If (historical || ..ScopedClaim(endpoint,control)) && $Data(^IsaiahDevx("receipt",control)) {
            Set result={}.%FromJSON(^IsaiahDevx("receipt",control))
        }
    } Catch ex { Set result={"phase":"review","delivery":"unverified"} }
    Return result
}
ClassMethod Retain(endpoint As %DynamicObject, control As %String, result As %DynamicObject)
{
    Set result.controlId=control,result.incomingBodyId=$Get(^IsaiahDevx("claim",control,"body"))
    Set result.dispatches=+$Get(^IsaiahDevx("dispatches",control)),result.fhirVersion=endpoint.fhirVersion,result.targetId=endpoint.targetId
    Set ^IsaiahDevx("receipt",control)=result.%ToJSON()
}
ClassMethod CanReconcile(endpoint As %DynamicObject, control As %String) As %Boolean
{
    If $Get(^IsaiahDevx("claim",control,"existing")) { Return 0 }
    Set code=+$Get(^IsaiahDevx("claim",control,"httpStatus"))
    // An explicit refusal cannot later become proof that this request created a matching resource.
    Return (code=0) || (code=408) || ((code>=500)&&(code<600)) || (code=201) || ((code=200)&&(endpoint.mode="legacy"))
}
ClassMethod Reconcile(control As %String) As %DynamicObject
{
    Set result={"phase":"review","delivery":"unverified"}
    If '$Data(^IsaiahDevx("claim",control,"resource")) { Return result }
    Lock +^IsaiahDevx("claim",control):2 Else  Return result
    Try {
        Set endpoint=..Endpoint()
        If ..ScopedClaim(endpoint,control) && ..CanReconcile(endpoint,control) {
            Do ..CheckVersion(endpoint)
            Set expected={}.%FromJSON(^IsaiahDevx("claim",control,"resource")),result=..Readback(endpoint,control,expected)
            If result.phase="delivered" { Do ..Retain(endpoint,control,result) }
        }
    } Catch ex { Set result={"phase":"review","delivery":"unverified"} }
    Lock -^IsaiahDevx("claim",control)
    Return result
}
Method OnMessage(input As IsaiahDevx.ResourceRequest, Output output As IsaiahDevx.Response) As %Status
{
    Set output=##class(IsaiahDevx.Response).%New(),control=input.ControlId,digest=##class(Isaiah.Change).Digest(input.ResourceJSON)
    Lock +^IsaiahDevx("claim",control):2 Else  Return $$$ERROR($$$GeneralError,"Synthetic destination busy")
    Try {
        If '##class(IsaiahDevx.Mapping).ValidId(control) { Throw ##class(%Exception.General).%New("Synthetic ID namespace required") }
        Set resource={}.%FromJSON(input.ResourceJSON)
        If (resource.resourceType'="Organization") || (resource.id'=control) || ($Extract(resource.name,1,7)'="ISAIAH-") { Throw ##class(%Exception.General).%New("Synthetic resource identity required") }
        Set endpoint=..Endpoint(),result={"phase":"review","delivery":"unverified"}
        Do ..CheckVersion(endpoint)
        If $Data(^IsaiahDevx("claim",control,"digest")) {
            If ^IsaiahDevx("claim",control,"digest")'=digest { Throw ##class(%Exception.General).%New("Control ID reused with different source") }
            Set result=..Receipt(control,endpoint)
        } Else {
            Set path=endpoint.base_"Organization",http=..HTTP(endpoint),conditional=(endpoint.mode="conditional-create")
            If conditional {
                If ..Find(endpoint,control)'="" { Throw ##class(%Exception.General).%New("New synthetic resource must not already exist") }
                Do resource.%Remove("id")
                Do resource.identifier.%Push({"system":"urn:isaiah:synthetic:control-id","value":(control)})
                Do http.SetHeader("If-None-Exist",..Query(control))
            } Else {
                Set path=path_"/"_control,probe=..HTTP(endpoint),probeStatus=probe.Get(path)
                If $$$ISERR(probeStatus) || '$IsObject(probe.HttpResponse) || (probe.HttpResponse.StatusCode'=404) { Throw ##class(%Exception.General).%New("New synthetic resource must not already exist") }
                Do http.SetHeader("If-None-Match","*")
            }
            Do http.EntityBody.Write(resource.%ToJSON())
            Set ^IsaiahDevx("claim",control,"target")=endpoint.identity,^IsaiahDevx("claim",control,"resource")=input.ResourceJSON,^IsaiahDevx("claim",control,"body")=input.IncomingBodyId
            Set ^IsaiahDevx("dispatches",control)=1,^IsaiahDevx("claim",control,"digest")=digest
            If conditional { Set sc=http.Post(path) } Else { Set sc=http.Put(path) }
            If $IsObject(http.HttpResponse) {
                Set code=+http.HttpResponse.StatusCode
                If code { Set ^IsaiahDevx("claim",control,"httpStatus")=code }
                If $$$ISOK(sc),((code=201)||((code=200)&&'conditional)) {
                    If '$Get(^IsaiahDevx("test","lost-response",control)) {
                        Try { Set result=..Readback(endpoint,control,{}.%FromJSON(input.ResourceJSON)) }
                        Catch ex { Set result={"phase":"review","delivery":"unverified"} }
                        If result.phase="delivered" { Do ..Retain(endpoint,control,result) }
                    }
                }
            }
        }
        Set output.Payload=result.%ToJSON(),status=$$$OK
    } Catch ex { Set status=$$$ERROR($$$GeneralError,"Synthetic FHIR dispatch requires review") }
    Lock -^IsaiahDevx("claim",control)
    Return status
}
XData MessageMap
{
<MapItems><MapItem MessageType="IsaiahDevx.ResourceRequest"><Method>OnMessage</Method></MapItem></MapItems>
}
}
`,
    'src/cls/IsaiahDevx/Production.cls': `Class IsaiahDevx.Production Extends Ens.Production
{
XData ProductionDefinition
{
<Production Name="IsaiahDevx.Production" TestingEnabled="true" LogGeneralTraceEvents="true">
<Item Name="Devx Intake" ClassName="IsaiahDevx.Intake" PoolSize="0" Enabled="true"/>
<Item Name="Devx Transform" ClassName="IsaiahDevx.Transform" PoolSize="1" Enabled="true"/>
<Item Name="FHIR Destination" ClassName="IsaiahDevx.Destination" PoolSize="1" Enabled="true"/>
</Production>
}
}
`,
    'src/cls/IsaiahDevx/Api.cls': `Include %occStatus
Class IsaiahDevx.Api Extends %CSP.REST
{
Parameter UseSession=0;
Parameter CONTENTTYPE="application/json";
XData UrlMap
{
<Routes><Route Url="/ingest" Method="POST" Call="Ingest"/><Route Url="/receipt/:id" Method="GET" Call="Receipt"/><Route Url="/reconcile/:id" Method="POST" Call="Reconcile"/></Routes>
}
ClassMethod ValidId(id As %String) As %Boolean
{
    Return ##class(IsaiahDevx.Mapping).ValidId(id)
}
ClassMethod Reply(value As %DynamicObject, code As %String="200 OK") As %Status
{
    Set %response.Status=code Write value.%ToJSON() Return $$$OK
}
ClassMethod Ingest() As %Status
{
    Try {
        Set data={}.%FromJSON(%request.Content),raw=data.raw
        If ($Length(raw)>8192) || (raw="") || (raw["PID|") { Return ..Reply({"error":"Synthetic header-only HL7 required"},"400 Bad Request") }
        Set message=##class(EnsLib.HL7.Message).ImportFromString(raw,.sc)
        If $$$ISERR(sc) { Return ..Reply({"error":"Invalid HL7"},"400 Bad Request") }
        Set message.DocType="2.5:ADT_A01"
        Set sc=##class(Ens.Director).CreateBusinessService("Devx Intake",.service)
        If $$$ISOK(sc) { Set sc=service.ProcessInput(message,.output) }
        If $$$ISERR(sc) { Return ..Reply({"error":"Synthetic contract rejected or destination requires review"},"422 Unprocessable Entity") }
        Return ..Reply({}.%FromJSON(output.Payload))
    } Catch ex { Return ..Reply({"error":"Synthetic request unavailable"},"422 Unprocessable Entity") }
}
ClassMethod Receipt(id As %String) As %Status
{
    If '..ValidId(id) { Return ..Reply({"error":"Invalid synthetic ID"},"400 Bad Request") }
    Return ..Reply(##class(IsaiahDevx.Destination).Receipt(id))
}
ClassMethod Reconcile(id As %String) As %Status
{
    If '..ValidId(id) { Return ..Reply({"error":"Invalid synthetic ID"},"400 Bad Request") }
    Return ..Reply(##class(IsaiahDevx.Destination).Reconcile(id))
}
}
`
  };
}
