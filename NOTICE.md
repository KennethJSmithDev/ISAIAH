# ISAIAH notices and upstream components

ISAIAH source is licensed under Apache-2.0. See LICENSE. The following separately acquired dependencies retain their original licenses and notices.

ISAIAH uses locally installed or operator-acquired components. Their original distributions carry their own license and notice files. Preserve those when acquiring or packaging any dependency.

- InterSystems IRIS for Health Community AI Hub EAP, Build 154U. The runtime and image are subject to InterSystems terms and are acquired separately. The native adapter uses the installed `%AI.Agent`, `%AI.Provider` and `%AI.Tool` APIs. The API examples consulted were the InterSystems AI Hub EAP source at commit `a61a72ce43a31e7f31c0ba6006dbe2c78acde935`. [InterSystems AI Hub EAP](https://github.com/intersystems-community/ai-hub-eap/tree/a61a72ce43a31e7f31c0ba6006dbe2c78acde935)
- Hermes Agent v0.22.5, commit `bf0203a794a07aac3ff764972ab9087baa4e4f4e`. The isolated learning bridge imports the installed skill manager, skill reader, write approval, revision ledger, memory reader and lock helpers. Hermes is MIT-licensed by Nous Research. [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- Ollama 0.40.6 serves the local OpenAI-compatible endpoint. [Ollama license](https://github.com/ollama/ollama/blob/main/LICENSE)
- OpenAI gpt-oss-20b is available under Apache 2.0. The qualified Ollama model artifact is identified by its digest in the runtime adapter. [OpenAI model card](https://huggingface.co/openai/gpt-oss-20b)
- Node.js 24.21.0 and Python 3.12.3 in the IRIS image provide the app and local transport standard libraries. The Hermes learning bridge runs under the operator's pinned isolated Python environment.
- Docker Compose uses the Docker Official Node.js 24.22.0 Alpine image pinned by digest. IPM 0.10.10 is obtained from the official release and verified before import. Neither dependency is bundled in the ISAIAH source or IPM archive. [Docker Official Node image](https://hub.docker.com/_/node) · [InterSystems IPM](https://github.com/intersystems/ipm/releases/tag/v0.10.10)

The project's Apache-2.0 license applies to ISAIAH source. Separately acquired software remains subject to its own terms.
