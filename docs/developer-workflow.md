# Scoped developer workflow

This slice adds operator-selected source inspection, reviewed project context and a narrowly bounded patch workflow to the existing standalone service. It also demonstrates one native AI Hub mapping proposal assembled into a synthetic HL7-to-FHIR Organization application. It does not implement a general application generator, arbitrary procedure generation or unattended self-modification.

## Select the source boundary

For a source checkout, replace `isaiah` in the examples with `node standalone/cli.mjs` from the repository root. Start the standalone service with the same CLI's `serve` command after setting the project profile. [Source dependencies and checks](../README.md#offline-checks)

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

Use disposable working directories that only you can write to. ISAIAH checks the resolved path before opening a file. That check does not fully bind the opened file to the approved path if another writer replaces it concurrently. Shared or untrusted writable workspaces are unsupported. Its operator-local API inherits the existing localhost Host/Origin/header policy; it is not multiuser authentication, production-deployment authorization or protection against hostile external filesystem writers. It does not expose an approval/apply tool over native MCP. Do not enable against a live checkout merely because syntax passed.

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

The synthetic application uses native `EnsLib.HL7.Message`, a service/process/operation production, an authenticated REST entry and a separately configured FHIR destination. Its generated IPM source requires Interoperability. The model and API request have no authority to select or change the destination. The HL7 control ID must use the reserved `isaiah017-` prefix.

### Configure a disposable FHIR destination

The existing R5 fixture configuration continues to use the fixed native R5 path and the HL7 control ID as the Organization ID. A separate configuration opts into a synthetic R4, R4B, or R5 server with FHIR conditional create. In a disposable IRIS namespace, an administrator can put the following in the protected fixture file `/tmp/isaiah-devx017/fhir.json` using an atomic replacement. Keep optional `username` and `password` values in that protected file.

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "mode": "conditional-create",
  "fhirVersion": "4.3.0",
  "targetId": "synthetic-r4b-01"
}
```

Use a dedicated loopback fixture serving `/fhir/` inside the IRIS process's network namespace. The accepted version strings are `4.0.1`, `4.3.0`, and `5.0.0`. Assign a new `targetId` if the repository is replaced, even if it retains its port. Confirm the server implements conditional Organization creation with the search token in `If-None-Exist`. The prototype was exercised against HAPI FHIR JPA 8.8.0. This setup assumes exclusive control of the synthetic identifier space and requires a server that supports uncached identifier searches.

The operation checks `/metadata` and rejects an existing record before the first dispatch. The conditional-create route uses `POST` with the scoped control identifier. The server assigns the Organization ID, returned as `id` in a verified receipt. The receipt separately returns the HL7 `controlId`, target ID and FHIR release. A durable claim binds the source and destination. Reconciliation uses an uncached search and an exact resource readback, and does not repeat the write. An explicit refusal remains unverified even if a matching resource later appears. A historical unbound R5 receipt remains readable in legacy mode. An unresolved claim from before target binding remains in review.

This route is limited to the generated synthetic Organization application. A server that advertises FHIR or accepts a `PUT` can still fail to enforce create-only writes. Do not direct this fixture at a shared or clinical endpoint.

Local qualification compiled/installed this artifact, sent known and held-out synthetic facility values, independently read FHIR IDs/versions and IRIS message-header hops, rejected missing required fields, checked duplicates and changed-source refusal, and injected loss after the destination write. Existing teaching projected the resulting actual resource receipt identically in all three modes. Reviewed project context survived fresh processes, withheld changed facts, reported unchanged without extra revisions and restored a preceding accepted revision.

These are separate evidence classes: one real native planning response; deterministic source emission; actual compiler/IPM/production/HTTP effects; independent readback; isolated approval tests; and context/teaching persistence. The held-out facility tests the fixed application mapping, not general model reasoning. No runtime model call is needed for the generated application. Main browser teaching promotion, standard IRIS/Health Connect, MLLP, clinical data and unrestricted application creation remain separate gates.

## Propose a synthetic mapping test

```sh
isaiah project test-propose --objective "Distinguish the sending application and facility in the Organization mapping."
```

Use the synthetic project profile with an approved `mapping` record and `allowDesign:true`. Native AI Hub proposes distinct synthetic input values. The bounded emitter sets the HL7 document type and derives the expected Organization fields from the fixture contract. Review the returned test source and source hash before compiling it in a disposable namespace. The CLI reports input validation and retains the proposal. Test execution requires a separate action.

## Inspect interoperability contracts

```sh
isaiah project fhir-openapi --record APPROVED-CAPABILITY-KEY
isaiah project component-types --record APPROVED-CLASS-KEY --trace-record APPROVED-TRACE-KEY --component Standard
```

The OpenAPI preview reads an approved local FHIR R4 (4.0.1), R4B (4.3.0), or R5 (5.0.0) JSON CapabilityStatement and returns an OpenAPI 3.1 document for advertised resource read and search operations. The document names the source FHIR release. The preview identifies skipped resource interactions and leaves search parameters, full profiles, authentication and server URLs outside the export.

For a server statement larger than 64 KiB, the operator can set `"kind":"fhir-capability"` on its approved JSON record in the private project profile. This permits up to 8 MiB for the export. Project maps can list the marked record's identity and size. Ordinary source reads still have the 64 KiB limit.

The component inspector compares a simple ObjectScript MessageMap and method signature with body class names from an approved trace record. The native trace projection supplies the class name without exposing the body. Missing and multiple types remain visible. When a unique declared request/response pair agrees with the trace, the inspector offers a candidate source/target pair for review. The inspected source and trace remain independently identified by their hashes.

The CLI includes an evidence-linked explanation for these inspections. Coach shows the lesson, Focus keeps it on demand, and Companion adds a short reaction. Reopen the result with `isaiah run show RUN-ID`. The explanation keeps the declared and observed types separate. A CapabilityStatement export establishes which operations were advertised; a separately authorized endpoint read is needed to verify a response.

## Export a versioned synthetic interface

Approve a local JSON record with schema `isaiah.synthetic-interface.v1` and facility `sending` or `receiving`. Both variants use MSH:10 for the control ID. The legacy R5 route also uses it as the Organization ID. They use MSH:4 and MSH:6 respectively for the Organization name and identifier.

```sh
isaiah project interface-plan --record APPROVED-INTERFACE-SPEC-KEY
isaiah project export RETURNED-PLAN-RUN --output NEW-EMPTY-DIRECTORY
```

The reviewed spec yields the existing synthetic production scaffold, a mapping test, documentation and a file hash manifest. Each export is source-only. Compile and test in a disposable namespace. Configure and qualify destination delivery separately.
