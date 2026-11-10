import { isDeepStrictEqual } from 'node:util';

export const syntheticDevelopmentContract = Object.freeze({ resourceType: 'Organization', identifierPath: 'MSH:4', namePath: 'MSH:4', resourceIdPath: 'MSH:10', requiredPaths: Object.freeze(['MSH:10','MSH:4']) });

export function verifyDevelopmentPlan(plan) {
  if (!isDeepStrictEqual(plan,syntheticDevelopmentContract)) throw new Error('The native proposal does not match the approved synthetic HL7-to-FHIR contract.');
  return { status: 'pass', claim: 'bounded-plan-contract', codeCompilation: 'not-run', delivery: 'unverified' };
}

export function generateSyntheticMapping(plan) {
  verifyDevelopmentPlan(plan);
  // The model selects a checked mapping plan; it never supplies executable source to this emitter.
  return `Class IsaiahDevx.Mapping Extends %RegisteredObject
{
ClassMethod ValidId(control As %String) As %Boolean
{
    Return ($Length(control)>10)&&($Length(control)<65)&&($Extract(control,1,10)="isaiah017-")&&($Translate(control,"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.")="")
}
ClassMethod Build(input As EnsLib.HL7.Message) As %DynamicObject
{
    Set control=input.GetValueAt("MSH:10"), facility=input.GetValueAt("MSH:4")
    If '..ValidId(control) || (facility="") {
        Throw ##class(%Exception.General).%New("Synthetic control ID and facility are required")
    }
    Return {"resourceType":"Organization","id":(control),"active":true,"identifier":[{"system":"urn:isaiah:synthetic:facility","value":(facility)}],"name":(facility)}
}
}
`;
}
