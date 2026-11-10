import { generateSyntheticMapping } from './development-plan.mjs';

export const syntheticEmitterRevision = 'synthetic-hl7-fhir.v2';

// One fixed synthetic application scaffold. Model output can select only the verified mapping contract.
export function syntheticApplication(plan) {
  return {
    'module.xml': `<Export generator="Cache" version="25"><Document name="isaiah-devx-fixture.ZPM"><Module><Name>isaiah-devx-fixture</Name><Version>0.0.1</Version><Packaging>module</Packaging><SourcesRoot>src</SourcesRoot><SystemRequirements Version=">=2026.3" Interoperability="enabled"/><Resource Name="IsaiahDevx.PKG"/></Module></Document></Export>\n`,
    'src/cls/IsaiahDevx/Mapping.cls': generateSyntheticMapping(plan),
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
ClassMethod HTTP() As %Net.HttpRequest
{
    Set file=##class(%Stream.FileCharacter).%New()
    Set sc=file.LinkToFile("/tmp/isaiah-devx017/fhir.json")
    If $$$ISERR(sc) { Throw ##class(%Exception.General).%New("Private fixture destination configuration unavailable") }
    Set endpoint={}.%FromJSON(file.Read(4096)),http=##class(%Net.HttpRequest).%New()
    Set http.Server=endpoint.host,http.Port=endpoint.port,http.Username=endpoint.username,http.Password=endpoint.password,http.Timeout=5
    Set http.ContentType="application/fhir+json"
    Return http
}
ClassMethod Base() As %String
{
    Return "/isaiah-proof/fhir/r5/Organization/"
}
ClassMethod Readback(control As %String, expected As %DynamicObject) As %DynamicObject
{
    Set http=..HTTP(),sc=http.Get(..Base()_control)
    If $$$ISERR(sc) || '$IsObject(http.HttpResponse) || (http.HttpResponse.StatusCode'=200) { Return {"phase":"review","delivery":"unverified"} }
    Set value={}.%FromJSON(http.HttpResponse.Data)
    If (value.resourceType'="Organization") || (value.id'=control) || (value.name'=expected.name) || 'value.active ||
        '$IsObject(value.identifier) || (value.identifier.%Size()'=1) { Return {"phase":"review","delivery":"unverified"} }
    Set identifier=value.identifier.%Get(0)
    If (identifier.system'="urn:isaiah:synthetic:facility") || (identifier.value'=expected.name) || (value.meta.versionId="") { Return {"phase":"review","delivery":"unverified"} }
    Return {"phase":"delivered","delivery":"verified-resource-readback","resourceType":"Organization","id":(value.id),"versionId":(value.meta.versionId),"facility":(value.name),"observedAt":($ZTIMESTAMP_"")}
}
ClassMethod Reconcile(control As %String) As %DynamicObject
{
    If '$Data(^IsaiahDevx("claim",control,"resource")) { Return {"phase":"review","delivery":"unverified"} }
    Lock +^IsaiahDevx("claim",control):2 Else  Return {"phase":"review","delivery":"unverified"}
    Try {
        Set expected={}.%FromJSON(^IsaiahDevx("claim",control,"resource")),result=..Readback(control,expected)
        If result.phase="delivered" {
            Set result.controlId=control,result.incomingBodyId=$Get(^IsaiahDevx("claim",control,"body")),result.dispatches=+$Get(^IsaiahDevx("dispatches",control))
            Set ^IsaiahDevx("receipt",control)=result.%ToJSON()
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
        If $Data(^IsaiahDevx("claim",control,"digest")) {
            If ^IsaiahDevx("claim",control,"digest")'=digest { Throw ##class(%Exception.General).%New("Control ID reused with different source") }
            Set result=$Select($Data(^IsaiahDevx("receipt",control)):{}.%FromJSON(^IsaiahDevx("receipt",control)),1:{"phase":"review","delivery":"unverified"})
        } Else {
            Set probe=..HTTP(),probeStatus=probe.Get(..Base()_control)
            If $$$ISERR(probeStatus) || '$IsObject(probe.HttpResponse) || (probe.HttpResponse.StatusCode'=404) { Throw ##class(%Exception.General).%New("New synthetic resource must not already exist") }
            Set ^IsaiahDevx("claim",control,"digest")=digest,^IsaiahDevx("claim",control,"resource")=input.ResourceJSON,^IsaiahDevx("claim",control,"body")=input.IncomingBodyId
            Set ^IsaiahDevx("dispatches",control)=1
            Set http=..HTTP()
            Do http.SetHeader("If-None-Match","*")
            Do http.EntityBody.Write(input.ResourceJSON)
            Set sc=http.Put(..Base()_control)
            Set result={"phase":"review","delivery":"unverified"}
            If $$$ISOK(sc),$IsObject(http.HttpResponse),((http.HttpResponse.StatusCode=200)||(http.HttpResponse.StatusCode=201)) {
                If '$Get(^IsaiahDevx("test","lost-response",control)) {
                    Set result=..Readback(control,{}.%FromJSON(input.ResourceJSON))
                    If result.phase="delivered" {
                        Set result.controlId=control,result.incomingBodyId=input.IncomingBodyId,result.dispatches=1
                        Set ^IsaiahDevx("receipt",control)=result.%ToJSON()
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
    If '$Data(^IsaiahDevx("receipt",id)) { Return ..Reply({"phase":"review","delivery":"unverified"}) }
    Return ..Reply({}.%FromJSON(^IsaiahDevx("receipt",id)))
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
