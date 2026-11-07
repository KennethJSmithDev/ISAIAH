# ISAIAH 0.1.0

ISAIAH is the InterSystems Artificial Intelligence Agentic Harness. This developer candidate investigates two synthetic delivery incidents inside an IRIS Interoperability production. A native AI Hub agent reads scoped evidence and selects a diagnostic or human-review branch. A separate deterministic verifier checks its decision against production and destination records.

It also provides an approved-session trace CLI, reviewed standalone learning, short InterSystems lessons, and a narrowly scoped R17 apply/rollback workflow. The browser shows investigations, evidence, replay and approvals. The CLI uses the same harness service.

## Supported environment

The tested host route uses Windows x64, PowerShell 7, Docker Desktop with Linux containers, Node.js 24.21.0 for CLI/tests, and Ollama 0.40.6. Compose 5.5.1 was tested. The application container uses the digest-pinned Node 24.22.0 Alpine image. The harness has no npm runtime dependencies.

The required image is **IRIS for Health Community AI Hub 2026.3.0AI, Build 154U, Linux amd64**, pinned to local image ID SHA-256 bbea4364ab6fbd7810219780fa76730fc2977d8cf76f3e01b92c5d4291a2feae. The module requires Interoperability and IRIS 2026.3 or later. This application route specifically checks Build 154U.

Allow for about 13.8 GB of model artifacts, local inference and two IRIS containers. The qualified host has 64 GB RAM and a 20 GB GPU. A 32 GB RAM host with a GPU capable of holding the model is a practical starting target. Throughput depends on hardware, and each investigation must complete within its five-minute deadline.

## Acquire the dependencies

Obtain the authorized **irishealth-community-2026.3.0AI.154.0-docker.tar.gz** archive through the [InterSystems AI Hub EAP program](https://evaluation.intersystems.com/Eval/early-access/AIHub). The [official announcement](https://community.intersystems.com/post/intersystems-programming-contest-ai-agents-interoperability-workflows) identifies this Community archive. Access uses the operator's InterSystems account and applicable terms. The portal may offer newer builds. If Build 154 is unavailable, obtain an authorized archived copy or request access from InterSystems before using this candidate.

~~~powershell
docker image load -i irishealth-community-2026.3.0AI.154.0-docker.tar.gz
$env:ISAIAH_IRIS_IMAGE = 'sha256:bbea4364ab6fbd7810219780fa76730fc2977d8cf76f3e01b92c5d4291a2feae'
docker image inspect $env:ISAIAH_IRIS_IMAGE --format '{{.Id}} {{.Architecture}}'
~~~

Install [Ollama 0.40.6](https://github.com/ollama/ollama/releases/tag/v0.40.6) and acquire gpt-oss:20b using its normal model setup. The [model card](https://huggingface.co/openai/gpt-oss-20b) describes its license and memory needs. If acquiring the model for the first time, start installed Ollama normally and run ollama pull gpt-oss:20b, then stop that setup server before the dedicated server below. Set OLLAMA_MODELS if using a nondefault operator-owned store.

ISAIAH expects model digest **9ba9cc2b4e02463b933096090530aef679d534dd91ecc9afadfb2dbfdc59f3c5**. Tags can change, so preflight checks the actual digest. This repository supplies source and acquisition instructions for separately distributed software.

## Start

Clone the repository and work from its root. In a dedicated model terminal:

~~~powershell
# Set OLLAMA_MODELS here if your model store needs an explicit path.
# The qualified AMD host enabled the selected Vulkan backend.
$env:OLLAMA_VULKAN = '1'
.\start-model.ps1 -Standalone
~~~

The launcher binds its model server to 127.0.0.1:18758, disables cloud access and pruning, and selects one loaded model, one inference slot and a 4,096-token context.

In a second PowerShell terminal at the repository root:

~~~powershell
$env:ISAIAH_IRIS_IMAGE = 'sha256:bbea4364ab6fbd7810219780fa76730fc2977d8cf76f3e01b92c5d4291a2feae'
.\docker\prepare.ps1 -Apply -Standalone
docker compose -p isaiah-public-v010 -f compose.yaml -f docker/compose.apply.yaml -f docker/compose.standalone.yaml up -d --wait --wait-timeout 280 --pull never
.\preflight.ps1 -Project isaiah-public-v010 -Apply -Standalone
~~~

Preparation downloads the SHA-256-checked IPM 0.10.10 installer from its official release and generates private local credentials. If Docker reports the pinned Node image missing, run the following acquisition command and repeat startup.

~~~powershell
docker pull node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
~~~

Open **http://127.0.0.1:18757/**. The iris service hosts Isaiah.Production in namespace ISAIAH. The separate trace service hosts DevTrace.Production in ISAIAHDEV with its own read-only account and approved session. Each Community instance runs one production.

Generated credentials and operator keys remain under ignored .local/. Application records, reviewed skills, preferences and the documentation index live in /home/node/.isaiah inside the app container. Compose stop/start preserves the current containers. Back up needed state before removing or recreating them.

## Demonstrate the native workflow

Select R17 or R29 in the browser and start the supplied investigation. Expand its audit and verification evidence.

| Case | Production evidence | Expected result |
|---|---|---|
| R17 | Incoming P1, comparison PRIORITY, Standard selected and delivered | Diagnostic branch, rule_mismatch, proposal PRIORITY to P1 |
| R29 | P1 comparison matches, Express selected, Express unavailable, Standard delivered | Review branch, downstream_fallback, review destination availability |

The automated demonstration submits fresh local model calls for both cases.

~~~powershell
.\docker\check.ps1 -Standalone
~~~

The path is browser → server.mjs → Isaiah.Api → Intake → Investigation → NativeAgent. Isaiah.NativeAgent creates a native %AI.Provider and %AI.Agent, registers Isaiah.EvidenceTool, creates a session and calls Chat. ReadIncident checks the active run, exact incident, deadline and budget before reading the synthetic fixture. It writes its own run audit.

The serialized model decision drives the Diagnostic or Review production operation. Diagnostic reads the deployed predicate. Review records a human-review recommendation. Afterward, the harness separately reads ingress, routing, destination and branch records. verifier.mjs checks the model's evidence, finding, proposal and actual branch. It can reject a wrong proposal even when the model called the tool.

The per-investigation ceilings are 12 model requests, 24 tool dispatches and 300 seconds, plus native iteration and input-size limits. Cancellation ends further permitted dispatch and reports IRIS acknowledgement. Model completion and deterministic verification remain distinct.

## Approved trace and truthful learning

Run CLI commands inside the prepared app:

~~~powershell
docker compose -p isaiah-public-v010 -f compose.yaml -f docker/compose.apply.yaml -f docker/compose.standalone.yaml exec -T app node standalone/cli.mjs doctor
docker compose -p isaiah-public-v010 -f compose.yaml -f docker/compose.apply.yaml -f docker/compose.standalone.yaml exec -T app node standalone/cli.mjs trace --session 2
~~~

The clean fixture approves session 2 and refuses the separate synthetic session 4. Its endpoint binds instance, namespace, production, session and first header. A second independent read must match the model's cited last hop. A passing trace result explicitly means recorded-hop-only. A destination receipt is required to establish delivery.

A first verified trace can return `skillProposal`. Accept its ID explicitly with `isaiah skill accept <revision>`, using the same container command. A later identical procedure returns `learningReview.status` as `unchanged`, keeps the accepted revision, and records the new run evidence. `skillProposal` is absent for that outcome. `learning.revision` identifies what the run actually selected, even if accepted state changed during execution. Use `isaiah run show <run-id>` to inspect its retained outcome and `isaiah skill restore <revision>` to restore the prior revision.

The standalone procedure currently contains the fixed, qualified trace lesson. The Compose route runs without Hermes. The original optional Hermes bridge is retained as source and needs its separately acquired pinned environment if configured.

isaiah explain --topic delivery serves an original offline lesson. Topics also include production, session, status, replay and recovery. isaiah teach coach, focus or companion sets the presentation preference. isaiah explain --topic session --live explicitly retrieves the registered official documentation page and explains bounded excerpts through the native model. These commands use the same service. The main browser retains its investigation layout, and measured human learning remains unqualified.

## Synthetic R17 apply and rollback

From the current completed R17 run, replay candidate P1. A passing replay uses a separate synthetic trace, requires Express delivery, and preserves original R17/R29 evidence. Plan apply from that replay, inspect the exact before/after state, and approve it using the generated local operator key.

To copy the key for the browser's masked field:

~~~powershell
Set-Clipboard -Value ((Get-Content .local/apply-operator.txt)[1])
~~~

Approval binds the sealed plan, sandbox, evidence hash and current revision, expires after five minutes, and is consumed once. Execution changes only this synthetic R17 predicate. Verification requires Express delivery. Rollback requires its own plan and approval and verifies Standard delivery. After a lost reply, read the receipt. Interrupted verification reconciles its durable dispatch claim and destination record, with missing evidence sent to review.

The existing regression submits a fresh R17 investigation, tests approval refusal, stale state, duplicates, dropped replies and restoration, then retains a private receipt.

~~~powershell
$env:ISAIAH_STANDALONE = '1'
node docker/check-apply.mjs
~~~

This mutation capability covers one synthetic setting and one local operator key.

## IPM

Root module.xml packages Isaiah.PKG from iris/ as isaiah version 0.1.0, with SystemRequirements Version=">=2026.3" Interoperability="enabled". Required classes are under iris/cls/Isaiah. Compose loads the module into a clean synthetic namespace through IPM.

An administrator can load the source using IPM 0.10.10 in an authorized Interoperability-enabled namespace.

~~~objectscript
zpm "load /path/to/ISAIAH -nodev"
~~~

Module loading installs classes. Permissions, accounts, provider credentials and production startup remain separate administrator responsibilities. Compose provisions its disposable targets. Successful local loading and checked-in source do not establish public registry availability.

## Offline checks

~~~powershell
npm ci --ignore-scripts --offline
node --test test/standalone.test.mjs test/verifier.test.mjs
~~~

These focused tests use temporary SQLite profiles and clearly synthetic trace/model fixtures. They cover unchanged row counts, persisted outcomes, exact scope, stale acceptance, legacy restoration, execution-time revision changes, recording failures, documentation filtering and verifier disagreement. They make no live model or IRIS calls. Optional Hermes tests require its separately configured pinned environment.

## Shutdown

~~~powershell
docker compose -p isaiah-public-v010 -f compose.yaml -f docker/compose.apply.yaml -f docker/compose.standalone.yaml stop
~~~

Use Ctrl+C in the dedicated model terminal. Start the same prepared containers again with the matching Compose arguments followed by start. Preserve needed data before replacing containers.

## Limits

The qualified scope is the local synthetic Health Build154 workflow. Standard-edition qualification, broad Memory/Context/Skills improvement, arbitrary procedure generation, redesigned browser teaching, companion integration and production use have separate future gates. No measured claim of time saved, improved accuracy or educational benefit is made.

## License and dependencies

ISAIAH source is licensed under Apache-2.0. See [LICENSE](LICENSE). Dependency licenses and separate runtime acquisition terms are listed in [NOTICE.md](NOTICE.md).
