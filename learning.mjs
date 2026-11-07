import { execFile, spawn } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const bridgeFile = fileURLToPath(new URL('./learning/hermes_bridge.py', import.meta.url));
const hermesRevision = 'bf0203a794a07aac3ff764972ab9087baa4e4f4e';
const reviewPolicy = 'skills:\n  write_approval: true\n  ledger: true\nmemory:\n  write_approval: true\n';
const emptyContext = { guidance: '', revisions: {}, applicability: 'unavailable', bytes: 0 };
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function bridge(python, source, profile, scratch, compatibility, payload) {
  const system = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(SystemRoot|WINDIR|ComSpec|SystemDrive|PATH|PATHEXT)$/i.test(key)
  ));
  const env = {
    ...system, HERMES_HOME: profile, HERMES_SESSION_PLATFORM: 'api_server',
    USERPROFILE: scratch, APPDATA: scratch, LOCALAPPDATA: scratch,
    TEMP: scratch, TMP: scratch
  };
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-I', '-B', '-X', 'utf8', bridgeFile, source, profile, compatibility], {
      cwd: profile, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
    });
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Learning storage timed out. Re-read its state before another review action.'));
    }, 12_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
      output += data;
      if (output.length > 64_000) child.kill();
    });
    child.stdin.on('error', () => {});
    child.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('Configured Hermes Python could not start.'));
    });
    child.on('close', code => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(output.trim());
        if (result.error) return reject(new Error(result.error));
        if (code === 0) return resolve(result);
      } catch { /* Unexpected bridge output is not useful operator evidence. */ }
      reject(new Error('Hermes learning bridge could not complete the operation.'));
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function createLearning({
  dataDir,
  compatibility,
  hermesSource = process.env.ISAIAH_HERMES_SOURCE,
  hermesPython = process.env.ISAIAH_HERMES_PYTHON
}) {
  let view = { summary: 'Learning unavailable. Configure the pinned Hermes source and Python runtime.', reviews: [] };
  const unavailable = {
    snapshot: () => view,
    context: async () => emptyContext,
    propose: async () => false,
    proposeRepair: async () => false,
    change: async () => { throw new Error(view.summary); }
  };
  if (!hermesSource || !hermesPython) return unavailable;
  try {
    if (!isAbsolute(hermesSource) || !isAbsolute(hermesPython) ||
        typeof compatibility !== 'string' || !/^[\w./:-]{1,160}$/.test(compatibility)) {
      throw new Error('Hermes paths must be absolute and the routing compatibility identity must be configured.');
    }
    const source = await realpath(hermesSource);
    const python = await realpath(hermesPython);
    const gitArgs = ['--no-replace-objects', '-C', source];
    const gitOptions = { windowsHide: true, timeout: 5000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } };
    const { stdout } = await exec('git', [...gitArgs, 'rev-parse', 'HEAD'], gitOptions);
    if (stdout.trim() !== hermesRevision) throw new Error('Hermes source revision does not match the qualified revision.');
    try { await exec('git', [...gitArgs, 'diff', '--quiet', '--no-ext-diff', 'HEAD', '--'], gitOptions); }
    catch { throw new Error('Hermes source has tracked changes or could not be verified.'); }
    await mkdir(dataDir, { recursive: true });
    const profile = join(await realpath(dataDir), 'hermes-learning');
    const scratch = join(profile, 'home');
    await mkdir(scratch, { recursive: true });
    if (await realpath(profile) !== profile || await realpath(scratch) !== scratch) {
      throw new Error('Hermes learning profile must be an ISAIAH-owned directory.');
    }
    try { await writeFile(join(profile, 'config.yaml'), reviewPolicy, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw new Error('Could not initialize the local review policy.'); }
    const perform = async payload => {
      const result = await bridge(python, source, profile, scratch, compatibility, payload);
      view = result.snapshot;
      return result;
    };
    const readContext = async () => {
      try { return (await perform({ op: 'read' })).context; }
      catch (error) {
        view = { summary: 'Learning temporarily unavailable. ' + error.message, reviews: [] };
        return emptyContext;
      }
    };
    await perform({ op: 'read' });
    return {
      snapshot: () => view,
      context: readContext,
      propose: async run => {
        if (run.incident !== 'R17' || run.verification?.status !== 'pass' ||
            run.contract?.compatibility !== compatibility ||
            !uuid.test(run.id)) return false;
        const result = await perform({ op: 'propose', run: run.id });
        return result.changed;
      },
      proposeRepair: async (run, repair) => {
        if (run.incident !== 'R17' || run.contract?.compatibility !== compatibility || !uuid.test(run.id) ||
            repair.sourceRun !== run.id || repair.status !== 'pass' || !repair.correctedFrom ||
            !uuid.test(repair.id) || !run.repairs?.includes(repair)) return false;
        return (await perform({ op: 'propose-repair', run: run.id, repair: repair.id })).changed;
      },
      change: async ({ action, id }) => {
        if (!['accept', 'reject', 'restore'].includes(action) || !/^[\da-f]{8}$/.test(id)) {
          throw new Error('Invalid learning review action.');
        }
        try { return (await perform({ op: action, id })).snapshot; }
        catch (error) { await readContext(); throw error; }
      }
    };
  } catch (error) {
    view = { summary: 'Learning unavailable. ' + (error.code ? 'Check the configured Hermes source and runtime.' : error.message), reviews: [] };
    return unavailable;
  }
}
