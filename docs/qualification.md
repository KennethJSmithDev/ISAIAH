# Qualification scope

This 0.1.1 source candidate targets **IRIS for Health Community AI Hub 2026.3.0AI Build 154U, Linux amd64** with synthetic data. Source availability, native qualification, registry availability and contest acknowledgment are separate states. This document summarizes retained qualification; it is not a new live execution.

| Capability | Evidence established | Boundary |
|---|---|---|
| Native R17 / R29 | Earlier fresh native AI Hub runs, scoped tool audits, actual Diagnostic / Review branches and independent verification; native owner preserved | Later fixed-agent and readback checks do not establish new reasoning |
| Ollama / local endpoint | Ollama 0.40.6 pinned `gpt-oss:20b`; compatible authenticated local gateway | Not every compatible provider |
| ChatGPT plan | Official account bridge, explicit consent; earlier `gpt-6.1-sol` and `gpt-6.1-terra` native R17/R29 passes; current installed selection and connected-plan status | Account eligibility and usage limits apply; other account providers have sockets, not qualified implementations |
| Read-only MCP | Authenticated scoped trace, queue and component tools, separate grants, audit requirements and refusal paths; independent queue/config comparison | Codex RPC access is not autonomous client tool selection; queue count is not health or delivery |
| HL7 | In-process synthetic production with correlated AA and AE, message/control IDs and destination records | No MLLP transport qualification |
| FHIR | Actual authenticated R5 direct repository, read/version/hash checks through installed service | No production-routed FHIR endpoint or general clinical integration |
| DICOMweb | Actual synthetic Orthanc 1.13.0 exact-UID QIDO/WADO and retrieved byte hash | No DIMSE or real PACS qualification |
| R17 contract/change/recovery | Immutable reviewed contract, administrative CAS, target/action/time scope, sealed generation, stale A/B/A refusal, explicit apply/rollback, interrupted and duplicate/lost-response recovery, Express/Standard receipts | Fixed synthetic decisions and real production dispatch; one predicate and local operator key. New apply requires explicit contract setup |
| R29 work item / adapter | Real Workflow work item and matching synthetic notice; permission, completion, retry/failure/timeout fixtures | Queued task is neither independent verification nor human approval; no portal-user or exactly-once external delivery claim |
| Learning/context | Explicit acceptance, unchanged procedure revision with new run evidence, scope/stale refusal, persistence and restoration; fresh-session selected-context consumption | One fixed trace procedure and exact target map; consumption test uses an explicit synthetic transport/model response |
| Teaching | Actual trace/queue/component/FHIR/DICOM receipt facts; identical authority in Coach/Focus/Companion, missing delivery remains unverified, reopen/restart retention | CLI/service; main browser teaching integration remains gated, educational benefit unmeasured |
| Hermes | Both isolated tests passed with v0.22.5 commit `bf0203a794a07aac3ff764972ab9087baa4e4f4e` | Separately acquired optional dependency; standalone context/restore also passed without Hermes |
| Packages | Current 26 native inputs passed clean offline IPM 0.1.1 install, requirement guard, R17/R29 fixture routes and discovery of all three native tools. Installed Node runtime passed 29 tests with no skips and scoped endpoint/restart checks | Declared vendor image reused; no fresh-machine acquisition claim. This GitHub export's documentation changes are checked separately |
| Browser / static simulation | Installed app headless Edge at 320/390/768/1440 and retained native evidence; existing mobile/recovery transport fixtures and separately authored simulation | No new inference or physical-device task-completion claim; simulation cannot create real approval or delivery evidence |

The final qualified private Node archive had 38 files and SHA-256 `d922ffe609a7ba3e9f837be77b9dcdf607a4481ee7b34016ab729e27cec12bae`. The final clean IPM archive SHA-256 was `ae4b873e698a2ecfe2fe44602ce3f0a288ae710a2d995824b7dfb83bdfe4c7b9`. Vendor runtimes, raw private receipts and credentials are not distributed in this repository. A source export or re-packed tarball need not have the same archive hash; qualification reuse requires matching relevant source inputs, not merely matching the version label.

## Reproduce appropriate checks

Use `npm ci --ignore-scripts`, then `npm test` from the source root. Use `npm ci --ignore-scripts --offline` only when dependencies are already cached. These tests use temporary synthetic profiles. The two Hermes tests skip unless `ISAIAH_HERMES_SOURCE` and `ISAIAH_HERMES_PYTHON` select the compatible environment; skipped is not passed.

Follow the README's Compose setup using an authorized separately obtained EAP image. `preflight.ps1 -Apply -Standalone` inspects the prepared runtime without repairing it. `docker/check.ps1 -Standalone` initiates fresh inference. `docker/check-apply.mjs` also requires the [explicit synthetic sender-contract setup](interop-connections.md#sender-contracts-and-consequential-changes), approvals and disposable write sandbox. Neither command is an offline source preflight.

Optional integration callers under `qualification/` and `test/interop-fixture/` require separately configured synthetic targets and permissioned local files. They are not automatic zero-configuration setup or part of `npm test`. Read their assumptions before use, especially the deliberately interrupted recovery fixture. Do not use it on a retained baseline or another workload. Browser callers require the existing Playwright module via `PLAYWRIGHT_MODULE`; the simulation uses authored examples, while the packaged browser caller consumes a retained regression receipt.

## Remaining gates

Fresh-machine dependency acquisition, standard IRIS and Health Connect, MLLP/DIMSE, production-routed FHIR, other account providers, browser teaching promotion, arbitrary application generation and production suitability remain separate. Public IPM 0.1.1 availability, Open Exchange review and contest acknowledgment require independent observations. No hosting is pursued. Genuine provisional video and the screenshot show the earlier interface with disclosed retained opening results and cuts; they are not new footage of this source revision.
