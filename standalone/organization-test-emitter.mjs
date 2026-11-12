export function emitOrganizationTest(input, receivingFacility) {
  if (!input || Array.isArray(input) || Object.keys(input).length !== 3 ||
      typeof input.sendingApplication !== 'string' || !/^[A-Z0-9-]{1,32}$/.test(input.sendingApplication) ||
      typeof input.facility !== 'string' || !/^[A-Z0-9-]{1,32}$/.test(input.facility) ||
      input.sendingApplication === input.facility ||
      typeof input.controlId !== 'string' || !/^isaiah017-[A-Za-z0-9-]{1,54}$/.test(input.controlId)) {
    throw new Error('Expected distinct bounded synthetic HL7 fields and a reserved control ID.');
  }
  if (receivingFacility !== undefined && (typeof receivingFacility !== 'string' || !/^[A-Z0-9-]{1,32}$/.test(receivingFacility) ||
      receivingFacility === input.facility)) throw new Error('Expected a distinct synthetic receiving facility.');

  // Expected values come from the fixed mapping contract. The model supplies only input.
  const { sendingApplication, facility, controlId } = input;
  const expectedFacility = receivingFacility ?? facility;
  const expected = { resourceType:'Organization', id:controlId, name:expectedFacility, identifier:expectedFacility };
  const content = `Include %occStatus

Class IsaiahDevx.OrganizationMappingTest Extends %RegisteredObject
{
ClassMethod Check() As %Status
{
    Set raw="MSH|^~\\&|${sendingApplication}|${facility}|FHIR|${receivingFacility ?? 'SYNTHETIC'}|202611111200||ADT^A01|${controlId}|P|2.5"_$Char(13)_"EVN|A01|202611111200"_$Char(13)
    Set message=##class(EnsLib.HL7.Message).ImportFromString(raw,.sc)
    If $$$ISERR(sc) Quit sc
    Set message.DocType="2.5:ADT_A01"
    Set result=##class(IsaiahDevx.Mapping).Build(message)
    If result.resourceType'="Organization" Quit $$$ERROR($$$GeneralError,"Unexpected resourceType")
    If result.id'="${controlId}" Quit $$$ERROR($$$GeneralError,"Unexpected Organization.id")
    If result.name'="${expectedFacility}" Quit $$$ERROR($$$GeneralError,"Unexpected Organization.name")
    If result.identifier.%Get(0).value'="${expectedFacility}" Quit $$$ERROR($$$GeneralError,"Unexpected Organization.identifier")
    Quit $$$OK
}
}
`;
  return { expected, files:[{path:'OrganizationMappingTest.cls',content}] };
}
