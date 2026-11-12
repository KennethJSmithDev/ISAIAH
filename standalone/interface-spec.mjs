import { syntheticDevelopmentContract } from './development-plan.mjs';
import { syntheticApplication } from './synthetic-app.mjs';
import { emitOrganizationTest } from './organization-test-emitter.mjs';

export const interfaceEmitterRevision = 'synthetic-interface.v3';

export function compileInterfaceSpec(spec) {
  if (!spec || Array.isArray(spec) || Object.keys(spec).length !== 2 ||
      spec.schema !== 'isaiah.synthetic-interface.v1' || !['sending','receiving'].includes(spec.facility)) {
    throw new Error('Expected a version 1 synthetic Organization interface spec with sending or receiving facility.');
  }
  const files = syntheticApplication(syntheticDevelopmentContract, spec.facility);
  const fixture = { sendingApplication:'ISAIAHDEVX',facility:'ISAIAH-SEND-A',controlId:'isaiah017-spec-001' };
  const test = emitOrganizationTest(fixture, spec.facility === 'receiving' ? 'ISAIAH-RECV-B' : undefined);
  files['tests/OrganizationMappingTest.cls'] = test.files[0].content;
  const field = spec.facility === 'sending' ? 'MSH:4' : 'MSH:6';
  files['README.md'] = `# Synthetic Organization interface

The \`${field}\` field supplies the Organization name and identifier. The \`MSH:10\` field supplies the control ID. The legacy R5 fixture also uses it as the resource ID. A conditional-create fixture assigns its own resource ID and retains the control ID as a separate identifier. Both HL7 fields are required.

The generated IPM module, production source and mapping test are for review in a disposable IRIS namespace. Run the test with \`##class(IsaiahDevx.OrganizationMappingTest).Check()\` after compiling it separately. Delivery requires a separately approved FHIR fixture. This export does not configure or start a production.
`;
  return { files, field, expected:test.expected };
}
