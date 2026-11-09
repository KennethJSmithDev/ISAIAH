# Scoped interoperability inspection

The standalone CLI and service can inspect individually approved synthetic FHIR resources and DICOMweb instances. These are **direct, read-only endpoint requests**, with no inference. They are separate from the native AI Hub R17/R29 investigation workflow. Receiving a resource through these endpoints does not establish an IRIS production hop, clinical correctness, human approval, or a repair.

## Configure exact targets and records

Set `ISAIAH_INTEROP_PROFILE` to a private JSON file containing up to eight target profiles. Set `ISAIAH_INTEROP_CREDENTIALS` to a different private JSON file. Start the normal standalone service with `isaiah serve`. A configured inference provider is not required for these inspection commands; investigation controls remain unavailable when the native model connection is unavailable.

The current inspector accepts loopback HTTP origins with explicit ports. It refuses redirects, arbitrary caller URLs, unknown targets or records, overlapping inspections, responses larger than 2 MB, and individual requests exceeding 6.5 seconds. An inspection makes at most two endpoint requests. This local synthetic slice does not establish remote-target security or clinical-data suitability.

Example profile structure (replace every placeholder using independently approved synthetic evidence):

```json
[
  {
    "id": "synthetic-fhir", "kind": "fhir", "instance": "YOUR-CONFIGURED-TARGET-IDENTITY",
    "origin": "http://127.0.0.1:18874", "base": "/isaiah-proof/fhir/r5/", "version": "5.0.0",
    "records": [{"key": "organization", "type": "Organization", "id": "YOUR-ID", "version": "YOUR-VERSION-ID", "sha256": "YOUR-64-CHARACTER-SHA256"}]
  },
  {
    "id": "synthetic-pacs", "kind": "dicomweb", "instance": "YOUR-CONFIGURED-AE-IDENTITY",
    "origin": "http://127.0.0.1:18873", "base": "/dicom-web/", "version": "YOUR-PACS-VERSION",
    "records": [{"key": "ct", "study": "YOUR-STUDY-UID", "series": "YOUR-SERIES-UID", "instance": "YOUR-SOP-INSTANCE-UID", "sha256": "YOUR-64-CHARACTER-SHA256"}]
  }
]
```

The separate credential file maps the same target IDs to `username` and `password` properties. Protect that file with the operator's filesystem permissions. Credentials never appear in inspection results. This inspector does not accept an IRIS or provider credential through an API request.

```powershell
isaiah inspect --target synthetic-fhir --record organization
isaiah inspect --target synthetic-pacs --record ct
isaiah run show RETURNED-RUN-ID
```

FHIR inspection checks the server's CapabilityStatement version, then the resource type, ID, version ID and exact approved response-byte hash. A serialization or content change requires review and an updated profile; the inspector does not silently normalize it. A configured instance name is a local scope label, not a server-attested identity. DICOMweb inspection performs an exact-UID QIDO query and a single-instance WADO retrieval. It accepts one bounded DICOM multipart part only when its bytes match the approved synthetic instance hash. PACS software version is labeled as configured, rather than inferred from the transfer.

Each successful read retains its own run and receipt summary. It does not retain the complete resource body or image in the run ledger. A failed recording does not return a durable-success claim. Reopening a run derives its lesson from the saved receipt. Coach, Focus and Companion change presentation only; authoritative facts and limits remain the same. Inspection does not propose or accept procedures, grant permissions, or become the main investigation selection.

## Native MCP monitoring

The existing authenticated IRIS MCP ToolSet also exposes `ReadQueueSnapshot` and `ReadComponentSnapshot`. Each requires the exact instance, namespace, active production, authenticated principal, and a separately configured grant for that queue or component. Queue permission does not grant component permission or session access. Administrators configure these grants in the existing target policy; model arguments cannot create them.

Queue reads use `Ens.Queue.GetCount`. Component reads use the existing production configuration owner, `Ens.Config.Production.FindItemByConfigName`, without granting the MCP principal unrestricted SQL table access. Results include target identity, snapshot time and successful audit status. An enabled component configuration does not prove that its worker is running or healthy. A queue count is neither a diagnosis nor a delivery receipt. Auditing disabled or unavailable, an absent queue, an unapproved item, or a stopped/different target withholds data. These tools expose no approval, contract acceptance, apply or rollback action.

For the locally qualified Docker route, set `ISAIAH_MONITOR_PROFILE` to a private file identifying one exact ISAIAH-owned container ID, image ID, container name and owner label, the instance/namespace/production, and the native MCP TOML configuration path inside that container. Select exact records with `key`, `kind` (`queue` or `component`) and `name`. Profile field names are `id`, `container`, `image`, `containerName`, `owner`, `instance`, `namespace`, `production`, `config`, and `records`. Choose a target ID distinct from the FHIR/DICOMweb profiles. The container must already be running; the inspector never starts it.

The native client reuses the existing `iris-mcp-server` as its restricted local OS user. Credentials remain in the separately permissioned native MCP configuration; this profile accepts no password, model, shell command, or mutation tool. The host requires existing Docker access. Inspection validates the exact container/image/owner before invoking a fixed executable, limits the MCP session to 20 seconds and 256 KiB of output, and calls one of the two allowed read tools. Existing native principal, scope grants and audit enforcement remain authoritative.

`isaiah inspect --target YOUR-MONITOR-ID --record YOUR-QUEUE-KEY` retains the resulting audited snapshot and a short explanation of its actual count, component configuration and observation time. Coach, Focus and Companion retain identical facts. An accepted snapshot means that the scoped audited response was validated; it is explicitly **not an independent worker-health diagnosis**, an external delivery receipt, or approval. This host-Docker adapter is qualified locally on the Health Build 154U fixture; it is not a remote MCP transport or a standard-edition qualification.

## Reviewed target context and grounded lessons

`isaiah context propose VERIFIED-TRACE-RUN-ID` proposes a minimal target map derived from that retained trace's independently read target facts. It reuses the existing SQLite revision ledger under a separate `context-v1` compatibility scope. It excludes session IDs, message bodies and model prose.

```powershell
isaiah context accept PROPOSED-REVISION-ID
isaiah context restore CURRENT-REVISION-ID
isaiah explain --run VERIFIED-TRACE-RUN-ID --topic delivery
```

Acceptance is explicit and uses the existing parent/CAS checks. Identical accepted content returns `unchanged`; new run evidence remains separate. Fresh traces include accepted context only when the complete target map still matches, recording the revision actually selected. Restoration selects the preceding revision. This is reviewed environment context, not arbitrary memory generation or automatic modification of ISAIAH's code.

Trace explanations reuse the previously qualified deterministic `trace-teaching.v1` grounding implementation. They connect the exact retained session, headers and selected last hop with the versioned starter lesson. Missing destination receipts remain explicitly unverified. Generating a lesson retains a separate explanation record and does not change a procedure. The main browser teaching-promotion gate remains in force; these CLI/service capabilities do not promote that UI.

## Sender contracts and consequential changes

New R17 apply plans require an applicable, administratively reviewed sender contract. `Isaiah.SenderContract.Accept` has no REST or MCP route. It requires `%Admin_Secure` use permission, the existing disposable sandbox identity, explicit prior-selection CAS and the existing change mutex/transaction. Accepted revision bytes are immutable. Contract identity, revision, digest and selection generation are sealed into the plan fingerprint and checked again before approval/execution. Selecting B and restoring A does not revive an old approval for A.

The bounded contract schema covers only `R17.synthetic`, `routing-v1`, the incoming `priority` field and `predicate-correction` action in the selected `ISAIAH/Isaiah.Production` sandbox. Effective times are integer seconds in the same IRIS clock representation as `Isaiah.State.Now()`. Missing, malformed, expired or inapplicable authority requires review. A contract indicating an incorrect incoming priority refuses the predicate repair. The factual verifier remains independent; semantic eligibility does not grant operator approval. Apply and rollback each retain their existing explicit approval and delivery-verification protections. Rollback restores the sealed previous state and does not acquire authority to make a new repair.

For the original synthetic fixture only, an administrator can inspect and explicitly accept the following Contract A in the disposable `ISAIAH` namespace. Do this after verifying that the fixture's sender really defines `P1` as the incoming priority and required predicate. The initial expected selection is empty; later reviews must supply the exact prior `id:revision` selection. Inspect the returned status and stop on an error.

```objectscript
Set sandbox=##class(Isaiah.Change).Identity(.key), now=##class(Isaiah.State).Now()
Set scope={"instance":(sandbox),"namespace":"ISAIAH","production":"Isaiah.Production","sender":"R17.synthetic","schema":"routing-v1","field":"priority","action":"predicate-correction"}
Set contract={"id":"synthetic-sender","revision":"1","scope":(scope),"effectiveFrom":(now-30),"effectiveUntil":(now+3600),"expectedIncoming":"P1","expectedPredicate":"P1","destination":"Express"}
Set status=##class(Isaiah.SenderContract).Accept(contract,"")
Write $SYSTEM.Status.GetErrorText(status),!
```

This is an original synthetic fixture definition, not a reproduction of an external tester's private sender contracts. Do not use it to authorize repairs in another application.

## Qualified scope

Local synthetic tests exercised Health Community AI Hub 2026.3.0AI Build 154U (Linux amd64), an HL7 2.5 in-process production fixture with correlated AA/AE and destination records, an authenticated R5 direct resource repository, and Orthanc 1.13.0 QIDO/WADO. The HL7 fixture does not qualify MLLP transport; the FHIR proof does not qualify a production-routed FHIR endpoint; the DICOMweb proof does not qualify DIMSE or real PACS installations. Standard IRIS and Health Connect require independent qualification when suitable authorized environments are available.

The R17/R29 native-model qualifications are retained separately from fixed-agent regression tests and static simulation. No new native inference is implied by package installation, receipt readback, a fixed decision, or browser rendering.
