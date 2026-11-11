# Qualification scope

The foundation table and archive hashes below describe published source commit `9e63278bb901ad8dffc122a5ad1973949f56ed07`. The separate [developer preview](developer-workflow.md) changes native and Node sources and has its own qualification boundary. Do not apply the foundation archive qualification to those changed classes. Its one generated synthetic application's production-routed FHIR proof does not establish a general FHIR connector or retroactively expand the older read-only fixture qualification.

This 0.1.1 source candidate targets **IRIS for Health Community AI Hub 2026.3.0AI Build 154U, Linux amd64** with synthetic data. Source availability, native qualification, registry availability and contest acknowledgment are separate states. This document summarizes retained qualification; it is not a new live execution.

| Capability | Evidence established | Boundary |
|---|---|---|
| Native R17 / R29 | Earlier fresh native AI Hub runs, scoped tool audits, actual Diagnostic / Review branches and independent verification; native owner preserved | Later fixed-agent and readback checks do not establish new reasoning |
| Ollama / local endpoint | Ollama 0.40.6 pinned `gpt-oss:20b`; compatible authenticated local gateway | Not every compatible provider |
| ChatGPT plan | ISAIAH's account bridge uses the official Sign in with ChatGPT flow and explicit consent. Both `gpt-6.1-sol` and `gpt-6.1-terra` passed native R17/R29 in the retained qualification. | Account eligibility and usage limits apply. Other account providers require separate implementation and qualification. |
| Read-only MCP | Authenticated scoped trace, queue and component tools, separate grants, audit requirements and refusal paths; independent queue/config comparison | Codex RPC access is not autonomous client tool selection; queue count is not health or delivery |
| HL7 | In-process synthetic production with correlated AA and AE, message/control IDs and destination records | No MLLP transport qualification |
| FHIR | Actual authenticated R5 direct repository, read/version/hash checks through installed service | No production-routed FHIR endpoint or general clinical integration |
| DICOMweb | Actual synthetic Orthanc 1.13.0 exact-UID QIDO/WADO and retrieved byte hash | No DIMSE or real PACS qualification |
| R17 contract/change/recovery | Immutable reviewed contract, administrative CAS, target/action/time scope, sealed generation, stale A/B/A refusal, explicit apply/rollback, interrupted and duplicate/lost-response recovery, Express/Standard receipts | Fixed synthetic decisions and real production dispatch; one predicate and local operator key. New apply requires explicit contract setup |
| R29 work item / adapter | Real Workflow work item and matching synthetic notice; permission, completion, retry/failure/timeout fixtures | Queued task is neither independent verification nor human approval; no portal-user or exactly-once external delivery claim |
| Learning/context | Explicit acceptance, unchanged procedure revision with new run evidence, scope/stale refusal, persistence and restoration; fresh-session selected-context consumption | One fixed trace procedure and exact target map; consumption test uses an explicit synthetic transport/model response |
| Teaching | Actual trace/queue/component/FHIR/DICOM receipt facts; identical authority in Coach/Focus/Companion, missing delivery remains unverified, reopen/restart retention | CLI/service; main browser teaching integration remains gated, educational benefit unmeasured |
| Hermes | Both isolated tests passed with v0.22.5 commit `bf0203a794a07aac3ff764972ab9087baa4e4f4e` | Separately acquired optional dependency; standalone context/restore also passed without Hermes |
| Foundation packages | The 26 foundation native inputs passed clean offline IPM 0.1.1 installation, requirement-guard and R17/R29 fixture checks, and discovery of the foundation's three native tools. The installed Node runtime passed 29 tests with no skips and scoped endpoint/restart checks. | The installer reused a separately acquired vendor image. The combined developer preview and fresh-machine acquisition have separate qualification boundaries. |
| Browser / static simulation | Installed app headless Edge at 320/390/768/1440 and retained native evidence; existing mobile/recovery transport fixtures and separately authored simulation | No new inference or physical-device task-completion claim; simulation cannot create real approval or delivery evidence |

The final qualified private Node archive had 38 files and SHA-256 `d922ffe609a7ba3e9f837be77b9dcdf607a4481ee7b34016ab729e27cec12bae`. The final clean IPM archive SHA-256 was `ae4b873e698a2ecfe2fe44602ce3f0a288ae710a2d995824b7dfb83bdfe4c7b9`. Vendor runtimes, raw private receipts and credentials are not distributed in this repository. A source export or re-packed tarball need not have the same archive hash; qualification reuse requires matching relevant source inputs, not merely matching the version label.

## Qualification history

These are successive, differently scoped checkpoints, not conflicting test results or counts to add together.

| Stage | Retained qualification | Source boundary |
|---|---|---|
| Earlier 18-test milestone | Source tests passed with no skips; the earlier source-publication rehearsal also passed 18 tests | Earlier interoperability/presentation checkpoint, before the later monitoring/package completion |
| Later 29-test milestone | Source and installed Node suites each passed 29 tests with no skips; installed endpoint, restart and context checks also passed | Completed Health foundation subsequently exported to published commit `9e63278bb901ad8dffc122a5ad1973949f56ed07`; export runtime/native inputs preserved |
| Clean offline IPM 0.1.1 | Archive SHA-256 `ae4b873e698a2ecfe2fe44602ce3f0a288ae710a2d995824b7dfb83bdfe4c7b9`, 23,001 bytes; fresh installer container, Interoperability guard, R17/R29 deterministic fixture routes, three native tool definitions | 26 input hashes (23 ISAIAH classes, module.xml, LICENSE, NOTICE) match that published foundation. IPM exports may add generated storage/formatting; input identity and retained producer/installer receipts bind qualification |
| Developer-preview 40-test milestone | Source suite passed 40 tests, including both configured Hermes tests; the isolated publication copy also passed 40, with no skips | New project/context/patch/export owners. Later documentation-only reconciliation preserves those executable inputs; this is not an additional native IPM installation |
| Fresh-machine installation | Not qualified | Clean native installation reused separately obtained vendor software; fresh acquisition/configuration on another machine is distinct |
| Existing-installation migration | One stopped synthetic home backed up, independently restored, recreated and read by the actual app; corrupt backup refused | Nine investigations and existing ledger rows retained. No general upgrade guarantee, active-production migration or interruption during a partially written restore was established |
| Registry distribution | November 10, 2026: metadata lists only 0.1.0; its 75,257-byte source archive SHA-256 is `91d3b86c6aa2225997639abe2710ac7a32e6cb8123c5d3f5577b956791480912`. A fresh Health Build154U / IPM 0.10.10 namespace installed it through `zpm "install isaiah"` and passed both deterministic fixture routes; 0.1.1 download returns 404 | Community registry was explicitly enabled in this disposable namespace. No model calls, existing-installation upgrade or 0.1.1 registry qualification. Its source bundle differs from IPM-built archives with generated storage/metadata |

The clean-installed 0.1.1 IPM archive contains the ISAIAH native package and license/notices, not the Node service, CLI, browser, Compose bootstrap, model weights or EAP runtime. Those application inputs have their separate source/installed-package evidence. Native fixture routes and tool discovery do not imply fresh model reasoning.

## Developer-preview qualification

The source additions described in [Developer workflow](developer-workflow.md) are separate from the foundation table and archive identities above. Version metadata remains 0.1.1 for this source review; the new source and private Node archive are not a newly published IPM or npm package. The preview passed 40 offline tests, including both Hermes tests when the pinned optional environment was explicitly configured. Without that environment those two tests skip.

| Added boundary | Evidence established | Limit |
|---|---|---|
| Selected project/source context | Exact approved file identities, explicit acceptance, fresh-process applicability, unchanged outcome with new evidence, and restoration of an earlier nonempty revision | Configured target is not native attestation; context records are not arbitrary reusable procedures |
| Reviewed JavaScript patch | Actual installed CLI diff, refusal before acceptance, bounded replacement, duplicate detection, reconciliation and separately accepted reversal using a synthetic file | Syntax only; no executed proposed code, general self-improvement or production authorization |
| Native method source | Actual authenticated `ReadMethodSource`, separate exact grant, scope refusals and audit | No invocation, compile, deployment or expanded existing grants |
| Native development plan | One genuine AI Hub response through pinned local Ollama, independently checked against the fixed synthetic mapping contract | No arbitrary model-authored executable source; other provider routes not requalified for this added mode |
| Emitted application | Initial clean disposable IPM install; final scoped inputs reloaded/recompiled; actual service/process/operation delivery to authenticated FHIR, independent header/resource readback, held-out facility, duplicate/conflict/refusal and explicit recovery checks | Header-only synthetic Organization mapping; loss injected after the write, not an actual network-drop experiment. No general FHIR installer or fresh clean install of the whole updated ISAIAH module |
| Installed Node inputs | Controlled export of a retained real plan matches the nine compiled application inputs, three teaching modes share actual receipt facts, fresh process/context restoration passes | Current emitter export is labeled a new derivation where appropriate; main browser teaching remains gated |

Existing-installation backup/recreation was also exercised against one retained old application home, preserving its nine run records in a named home and independent recovery. The retained snapshot had three skill rows, no active skill selection and one teaching preference. Corrupt-backup refusal and restoration into another empty volume passed; interruption during a partially completed restore was not tested. This is specific evidence, not a general migration guarantee; the [backup warning](../README.md#start) still applies and an existing-installation upgrade remains on hold pending installation-specific backup, preservation and recovery evidence. `docker compose down -v` must not be used as a migration step: it removes named volumes.

Four native classes differ from the foundation for the assistance mode and source tool: `Isaiah.Api`, `Isaiah.NativeAgent`, `Isaiah.TraceMCPPolicy` and `Isaiah.TraceMCPTools`. The other 22 native/package inputs match the clean-qualified foundation. The browser assets, investigation verifier, R17 change and sender-contract owners, and provider/account bridge retain their foundation source identities. The R17/R29 model results are retained foundation evidence. A combined clean IPM installation of the developer preview remains unqualified.

Project scope and syntax refusals return explicit errors before a proposal is created; they are not recorded as successful or accepted learning. The prototype does not provide a durable denial ledger for every pre-proposal refusal. Apply records its intent before replacement; a recording failure remains an error and explicit reconciliation checks bytes without repeating the write. This is a local reviewed-development boundary, not a general security audit or multiuser deployment authority.

## Reproduce appropriate checks

Use `npm ci --ignore-scripts`, then `npm test` from the source root. Use `npm ci --ignore-scripts --offline` only when dependencies are already cached. These tests use temporary synthetic profiles. The two Hermes tests skip unless `ISAIAH_HERMES_SOURCE` and `ISAIAH_HERMES_PYTHON` select the compatible environment; skipped is not passed.

Follow the README's Compose setup using an authorized separately obtained EAP image. `preflight.ps1 -Apply -Standalone` inspects the prepared runtime without repairing it. `docker/check.ps1 -Standalone` initiates fresh inference. `docker/check-apply.mjs` also requires the [explicit synthetic sender-contract setup](interop-connections.md#sender-contracts-and-consequential-changes), approvals and disposable write sandbox. Neither command is an offline source preflight.

Optional integration callers under `qualification/` and `test/interop-fixture/` require separately configured synthetic targets and permissioned local files. They are not automatic zero-configuration setup or part of `npm test`. Read their assumptions before use, especially the deliberately interrupted recovery fixture. Do not use it on a retained baseline or another workload. Browser callers require the existing Playwright module via `PLAYWRIGHT_MODULE`; the simulation uses authored examples, while the packaged browser caller consumes a retained regression receipt.

## Remaining gates

Fresh-machine dependency acquisition, standard IRIS and Health Connect, MLLP/DIMSE, general production-routed FHIR integration, other account providers, main browser teaching, arbitrary application generation and production suitability remain unqualified. Public IPM 0.1.1 availability, Open Exchange review and contest acknowledgment have separate evidence requirements. The provisional recording and screenshot show the earlier interface. The recording discloses the retained opening result and editorial cuts.
