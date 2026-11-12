import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { syntheticApplication, syntheticEmitterRevision } from './synthetic-app.mjs';
import { compileInterfaceSpec, interfaceEmitterRevision } from './interface-spec.mjs';

export async function exportProject(run, destination) {
  const interfacePlan = run?.kind === 'interface-plan' && run.verification?.claim === 'bounded-interface-spec';
  const developmentPlan = run?.kind === 'development-plan' && run.verification?.claim === 'bounded-plan-contract';
  if (run?.verification?.status !== 'pass' || !(interfacePlan || developmentPlan)) {
    throw new Error('Select a retained development plan that passed its bounded contract.');
  }
  const files = interfacePlan ? compileInterfaceSpec(run.decision).files : syntheticApplication(run.decision);
  const emitterRevision = interfacePlan ? interfaceEmitterRevision : syntheticEmitterRevision;
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('Choose a new output directory.');
  const root = resolve(destination);
  await mkdir(root, { recursive: false, mode: 0o700 });
  const manifest = [];
  // Regenerate only the controlled emitter's paths; saved/model-provided file paths have no authority.
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, content, { flag: 'wx', mode: 0o600 });
    manifest.push({ path, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
  }
  const receipt = { status: 'exported-source-only', sourceRun: run.id, emitterRevision,
    newDerivation: run.proposal?.emitterRevision !== emitterRevision, files: manifest, deployed: false, delivery: 'unverified' };
  await writeFile(join(root,'source-manifest.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return { ...receipt, directory: root };
}
