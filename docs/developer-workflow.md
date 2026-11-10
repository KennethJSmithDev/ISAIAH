# Scoped developer workflow — local prototype

This slice adds operator-selected source inspection, reviewed project context and a narrowly bounded patch workflow to the existing standalone service. It also demonstrates one native AI Hub mapping proposal assembled into a synthetic HL7-to-FHIR Organization application. It does not implement a general application generator, arbitrary procedure generation or unattended self-modification.

## Select the source boundary

Set `ISAIAH_PROJECT_PROFILE` before starting the standalone service. Keep this operator-owned file outside distributable source. No endpoint accepts a replacement root, shell command or additional tool permission.

```json
{
  "version": 1,
  "id": "synthetic-project",
  "root": "YOUR-ABSOLUTE-SYNTHETIC-PROJECT-DIRECTORY",
  "records": [{"key":"mapping","path":"Mapping.cls"}],
  "allowApply": false,
  "allowDesign": false,
  "target": {
    "instance": "00000000-0000-4000-8000-000000000001",
    "namespace": "ISAIAH",
    "production": "IsaiahDevx.Production"
  }
}
```

The target is configured scope, not live attestation. The source owner returns exact approved file identities; only separate native observations can establish what is installed or running. Selection is limited to 32 distinct approved records, regular UTF-8 files up to 64 KiB, and supported source/document extensions. Traversal, links, private/dependency directories and credential-like paths are refused. Other credentials remain in their existing separate stores.

```sh
isaiah project map
isaiah project read --record mapping
isaiah project context propose RETURNED-RUN-ID
isaiah project context accept PROPOSED-REVISION
```

Project context reuses the existing SQLite revision tables under its own scope. It stores the minimal file/permission/target map, not expanded source. Acceptance is explicit. Fresh operations include the selected revision only when its facts match. Identical accepted content reports unchanged while retaining the new evidence. `isaiah project context restore CURRENT-REVISION` restores its parent; changed facts still withhold applicability until they match. Project records never replace the main R17/R29 investigation selection.

## Review a local JavaScript patch

```sh
isaiah project patch propose --record APPROVED-JAVASCRIPT-KEY --replacement NEW-LOCAL-TEXT-FILE
isaiah project patch show PATCH-RUN-ID
isaiah project patch accept PATCH-RUN-ID REVISION
isaiah project patch apply PATCH-RUN-ID REVISION
isaiah project patch reconcile PATCH-RUN-ID REVISION
isaiah project patch reverse APPLIED-PATCH-RUN-ID
```

Review the original/replacement content and exact before/after hashes in the run before acceptance. Reversal creates a separate proposal that needs its own acceptance and apply. A no-change replacement retains evidence without a revision. Source drift, stale acceptance, a changed active approval and read-only profiles refuse writes. Duplicate apply recognizes the existing bytes; reconcile reads current bytes without repeating the action. Recording failures propagate; a lost reply is not an instruction to repeat apply.

`patch show` derives a full-file unified diff on demand; it is not stored as another copy of the procedure or source. The JSON output keeps control characters escaped. Replacement uses the reviewed content and hashes, not text parsed from the displayed diff.

**The built-in check is JavaScript syntax only. It never executes the proposed source or claims correct runtime behavior.** ObjectScript proposals require a separately qualified compiler boundary. Applying is disabled by default and requires `allowApply:true` in the private profile plus explicit acceptance of the exact revision. A final bounded replacement holds the existing ledger transaction while rechecking acceptance. File replacement is atomic, but filesystem changes and SQLite records are not one crash-atomic store. Reconciliation resolves the observed bytes or returns review.

Use exclusively controlled disposable working directories for this prototype. Its operator-local API inherits the existing localhost Host/Origin/header policy; it is not multiuser authentication, production-deployment authorization or protection against hostile external filesystem writers. It does not expose an approval/apply tool over native MCP. Do not enable against a live checkout merely because syntax passed.

## Read native method source

The existing authenticated native MCP ToolSet adds `ReadMethodSource(instance, namespace, production, className, methodName)`. An administrator must configure a separate exact method grant at `^IsaiahTrace("mcp","method",principal,"Application.Class:Method")`. A trace or queue grant does not supply source authority.

The implementation reads the declared method from the IRIS dictionary, with a 256-method lookup bound and 16,000-character source bound, then rechecks scope and requires successful auditing. It does not instantiate the application class, invoke the method, export dependencies or compile source. A source snapshot is not a compiler or runtime result. Existing three tools and their distinct grants remain intact. The grant has no REST/MCP acceptance route.

## Native constrained development demonstration

With an explicitly selected synthetic project containing a `mapping` record and `allowDesign:true`:

```sh
isaiah project design --objective "Build the synthetic header-only ADT to FHIR Organization example."
isaiah project export RETURNED-PLAN-RUN --output NEW-EMPTY-DIRECTORY
```

This uses the existing native AI Hub assistance endpoint and selected gateway/model; it does not start another agent loop. The local qualification used pinned Ollama `gpt-oss:20b`, not a new provider. Other already-supported provider routes have not been requalified for this new mode.

The frozen fixture contract requires MSH:4 as Organization name/identifier, MSH:10 as resource ID, and both fields present. An independent deterministic comparison rejects a different plan before emission. The emitter accepts no arbitrary executable model text. It produces the complete constrained IPM scaffold for review; export creates a new directory and refuses an existing one. It does not automatically apply or deploy it. Partial filesystem failures retain their incomplete output for inspection rather than deleting or silently retrying it.

Exports name their emitter revision and exact file hashes. Reusing an older retained mapping plan with the current emitter is labeled a new derivation; it is not a new model execution or unchanged executable source.

The synthetic application uses native `EnsLib.HL7.Message`, a service/process/operation production, an authenticated REST entry and a separately configured FHIR destination. Its generated IPM source requires Interoperability. Destination credentials are read from a protected native file, never the model or API body. Resource identifiers allow explicit read-only reconciliation after an uncertain response. The fixed destination path and configuration are qualification-fixture specifics, not a general FHIR deployment installer.

Resource IDs must use the reserved `isaiah017-` synthetic prefix. The destination independently checks that scope and matching Organization identity, refuses an existing resource without its own durable claim, and requests create-only HTTP semantics. It is not an API for updating arbitrary existing repository records.

Local qualification compiled/installed this artifact, sent known and held-out synthetic facility values, independently read FHIR IDs/versions and IRIS message-header hops, rejected missing required fields, checked duplicates and changed-source refusal, and injected loss after the destination write. Existing teaching projected the resulting actual resource receipt identically in all three modes. Reviewed project context survived fresh processes, withheld changed facts, reported unchanged without extra revisions and restored a preceding accepted revision.

These are separate evidence classes: one real native planning response; deterministic source emission; actual compiler/IPM/production/HTTP effects; independent readback; isolated approval tests; and context/teaching persistence. The held-out facility tests the fixed application mapping, not general model reasoning. No runtime model call is needed for the generated application. Main browser teaching promotion, standard IRIS/Health Connect, MLLP, clinical data and unrestricted application creation remain separate gates.
