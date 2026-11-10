import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

export function openLedger(directory) {
  const db = new DatabaseSync(join(directory, 'standalone.sqlite'), { timeout: 1500 });
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS skill (id TEXT PRIMARY KEY, scope TEXT NOT NULL, parent TEXT,
      evidence TEXT NOT NULL, guidance TEXT NOT NULL, state TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS active_skill (scope TEXT PRIMARY KEY, id TEXT NOT NULL REFERENCES skill(id)) STRICT;
    CREATE TABLE IF NOT EXISTS teaching_pref (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE VIRTUAL TABLE IF NOT EXISTS source_text USING fts5(id UNINDEXED, title, content, metadata UNINDEXED);`);
  const active = scope => db.prepare('SELECT id FROM active_skill WHERE scope=?').get(scope)?.id ?? null;
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = action(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function use(scope) {
    return db.prepare(`SELECT skill.id, guidance, evidence FROM skill JOIN active_skill
      ON active_skill.id=skill.id AND active_skill.scope=skill.scope
      WHERE skill.scope=? AND skill.state='accepted'`).get(scope) ?? null;
  }
  function propose(run) {
    if (run?.kind !== 'trace' || run.verification?.status !== 'pass') throw new Error('A verified session trace is required.');
    const scope = run.compatibility;
    const guidance = 'Compare the message header ID, source, target, and recorded status in that order. Require a separate receiving-system receipt for a delivery claim.';
    return proposeContent(scope, run.id, guidance);
  }
  function proposeContent(scope, evidence, guidance) {
    return transaction(() => {
      const current = use(scope);
      if (current?.guidance === guidance) return { status: 'unchanged', revision: current.id };
      const parent = active(scope);
      const id = createHash('sha256').update(JSON.stringify([scope, parent, evidence, guidance])).digest('hex').slice(0, 24);
      db.prepare('INSERT OR IGNORE INTO skill VALUES (?,?,?,?,?,?)').run(id, scope, parent, evidence, guidance, 'proposed');
      return { status: 'proposed', revision: id, proposal: db.prepare('SELECT * FROM skill WHERE id=?').get(id) };
    });
  }
  function proposeContext(run) {
    if (run?.kind !== 'trace' || run.verification?.status !== 'pass' || !run.compatibility || !run.verification.independent?.target) {
      throw new Error('A retained verified trace is required for a context proposal.');
    }
    return proposeContent('context-v1/' + run.compatibility, run.id, JSON.stringify(targetContext(run.verification.independent.target)));
  }
  function proposeProject(run) {
    if (run?.kind !== 'project-read' || run.verification?.claim !== 'approved-file-bytes' || run.verification.status !== 'pass' ||
        !run.compatibility?.startsWith('project-v1/') || run.project?.kind !== 'project-map.v1') throw new Error('An inspected approved project map is required.');
    const { selected, ...facts } = run.project;
    return proposeContent('context-v1/' + run.compatibility, run.id, JSON.stringify(facts));
  }
  function proposePatch(run) {
    if (run?.kind !== 'project-patch' || !run.compatibility?.startsWith('project-v1/') || run.patch?.checks?.kind !== 'syntax-only' ||
        run.patch.checks.status !== 'pass') throw new Error('A scoped syntax-checked patch proposal is required.');
    return proposeContent('patch-v1/' + run.compatibility, run.id, patchIdentity(run.patch));
  }
  function withAcceptedPatch(scope, id, guidance, action) {
    return transaction(() => {
      const accepted = use(scope);
      if (!scope.startsWith('patch-v1/project-v1/') || accepted?.id !== id || accepted.guidance !== guidance) {
        throw new Error('The accepted patch changed before application.');
      }
      return action();
    });
  }
  function review(scope, id, action) {
    return transaction(() => {
      const row = db.prepare('SELECT * FROM skill WHERE id=? AND scope=?').get(id, scope);
      if (!row) throw new Error('Skill revision is outside the approved profile.');
      const previous = active(scope);
      if (action === 'accept' && row.state === 'proposed' && previous === row.parent) {
        db.prepare('UPDATE skill SET state=? WHERE id=?').run('accepted', id);
        db.prepare('INSERT INTO active_skill VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET id=excluded.id').run(scope, id);
      } else if (action === 'restore' && previous === id) {
        db.prepare('UPDATE skill SET state=? WHERE id=?').run('restored', id);
        if (row.parent) db.prepare('UPDATE active_skill SET id=? WHERE scope=?').run(row.parent, scope);
        else db.prepare('DELETE FROM active_skill WHERE scope=?').run(scope);
      } else throw new Error('The reviewed prior revision or action is stale.');
      return { id, action, active: active(scope) };
    });
  }
  function putSource(source) {
    const { id, title, content, ...metadata } = source;
    db.prepare('DELETE FROM source_text WHERE id=?').run(id);
    db.prepare('INSERT INTO source_text VALUES (?,?,?,?)').run(id, title, content, JSON.stringify(metadata));
  }
  function findSources(query) {
    const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 16);
    if (!terms.length) return [];
    return db.prepare('SELECT id,title,content,metadata FROM source_text WHERE source_text MATCH ? ORDER BY rank LIMIT 32')
      .all(terms.map(term => `"${term}"`).join(' OR ')).map(({ metadata, ...source }) => ({ ...source, ...JSON.parse(metadata) }));
  }
  return { use, propose, proposeContext, proposeProject, proposePatch, withAcceptedPatch, review, findSources, importSources: sources => transaction(() => sources.forEach(putSource)),
    preference: key => db.prepare('SELECT value FROM teaching_pref WHERE key=?').get(key)?.value,
    remember: (key, value) => db.prepare('INSERT INTO teaching_pref VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value),
    close: () => db.close() };
}

export function patchIdentity(patch) {
  const { content, original, ...identity } = patch;
  return JSON.stringify(identity);
}

// Stable target facts only. Session IDs and model prose are not reusable environment context.
export function targetContext(target) {
  const fields = ['instance','namespace','production','build','edition','nativeHub'];
  if (!target || fields.some(field => target[field] === undefined)) throw new Error('Target context is incomplete.');
  return Object.fromEntries(fields.map(field => [field,target[field]]));
}
