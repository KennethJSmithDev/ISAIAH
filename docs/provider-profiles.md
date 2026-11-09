# Local model provider profiles

The standalone CLI can prepare the existing profile representation without copying credentials:

```powershell
isaiah provider preset chatgpt --model YOUR-ACCOUNT-MODEL-ID --profile .local/new-provider-profile.json
isaiah provider preset ollama --profile .local/new-ollama-profile.json
isaiah provider show
isaiah account status
```

Use `--compose` when preparing a profile for the containerized app. Presets create a new file exclusively; they refuse to overwrite an existing selection. Set `ISAIAH_PROVIDER_PROFILE_FILE` to the selected file and restart the task-owned app using the existing startup route. Preset creation does not change a running service, sign in, or prove model compatibility. `isaiah account login`, `models` and `disconnect` delegate to the existing Windows ChatGPT account implementation and its explicit consent flow. Other providers' consumer subscriptions are not enabled by these presets.

Other provider authors can implement the optional [experimental account bridge socket and tester contract](provider-bridge-testing.md). It reuses this transport and requires separate credentials. Only provider-specific live qualification can establish compatibility.

ISAIAH keeps native AI Hub as the agent and routes model requests through its existing per-run gateway. With no provider-profile file, it uses the original pinned Ollama 0.40.6 / `gpt-oss:20b` route and digest. An explicit profile chooses a local model endpoint at service startup; selecting a profile requires restarting the task-owned service. A failed explicit profile does not silently fall back to another provider.

The selected profile ID, kind and model are retained with investigation and standalone-trace results. They do not contain credentials. A model name returned by a generic endpoint does not prove the underlying weights, model capabilities or reasoning quality.

## OpenAI-compatible local endpoint

Create a private JSON file:

```json
{
  "id": "local-compatible",
  "kind": "openai-compatible",
  "origin": "http://127.0.0.1:1234",
  "model": "YOUR-LOCAL-MODEL-ID"
}
```

For the containerized Node service, use `http://host.docker.internal:1234` as the origin to reach the operator's host-local endpoint. The service requires `GET /v1/models` to list the exact configured model ID, and forwards non-streaming requests to `POST /v1/chat/completions`. Endpoint availability and model listing are readiness checks, not proof that the model handles ISAIAH's tool calls or returns correct decisions. Test each model and endpoint explicitly.

When running Node locally, set `ISAIAH_PROVIDER_PROFILE_FILE` to the absolute path of that JSON. For the existing Compose route, place it at `.local/provider-profile.json` and append `-f docker/compose.provider.yaml` to every matching Compose command. Use the same base and standalone/apply overlays as the chosen sandbox route.

The generic profile does not perform Ollama-specific version/digest checks. It is intended for local services implementing the selected OpenAI-compatible endpoints, not for hosted APIs. An endpoint or model is supported only to the extent its own qualification establishes.

## Explicit Ollama profile

An optional `ollama` profile has the same fields plus `version` and `digest`:

```json
{
  "id": "ollama-pinned",
  "kind": "ollama",
  "origin": "http://127.0.0.1:18758",
  "model": "gpt-oss:20b",
  "version": "0.40.6",
  "digest": "9ba9cc2b4e02463b933096090530aef679d534dd91ecc9afadfb2dbfdc59f3c5"
}
```

ISAIAH checks Ollama's version and exact model digest before it reports this profile ready. For Compose, replace the host with `host.docker.internal` and retain the same port.

## Credentials and boundaries

If the selected local endpoint requires a bearer credential, put that credential alone in a separate protected file and set `ISAIAH_PROVIDER_CREDENTIAL_FILE` to its absolute path. With Compose, put it at `.local/provider-credential.txt` and additionally append `-f docker/compose.provider-auth.yaml`. Do not put the credential in the profile, URL, command line, browser, run records or source control. The app refuses to reuse an IRIS, trace, or gateway credential as the upstream credential.

The explicit profile accepts only a local HTTP origin with an explicit port and no URL path, user information, query or fragment. Local Node permits loopback; Compose permits `host.docker.internal`. Redirects are rejected. The gateway retains its bearer credential, exact active run, request budget, cancellation, model allowlist and input-size checks. The upstream endpoint is a separate trust boundary: its host process can observe the synthetic prompts and tool results forwarded to it.

The matching preflight accepts `-ProviderProfile` and, when needed, `-ProviderAuth`; it checks that the private inputs exist and reports the selected route as deferred until the application performs its readiness check. It makes no inference request. Existing `-Standalone` and `-Apply` arguments still apply.

## Example Compose commands

```powershell
docker compose -p isaiah-local -f compose.yaml -f docker/compose.standalone.yaml -f docker/compose.provider.yaml up -d
.\preflight.ps1 -Project isaiah-local -Standalone -ProviderProfile
docker compose -p isaiah-local -f compose.yaml -f docker/compose.standalone.yaml -f docker/compose.provider.yaml stop
```

When using a provider credential, append `-f docker/compose.provider-auth.yaml` to each Compose command and `-ProviderAuth` to preflight. Follow the main README for separately acquired IRIS, IPM, secrets and synthetic fixture setup. Do not expose the gateway or credential-bearing configuration publicly.

## Run retention and existing installations

This candidate gives the Compose app a named volume at `/home/node`, so its run records and standalone ledger survive an app-container recreation. Preserve that volume; `docker compose down -v` removes it. A prior installation that kept records only in its app container needs its existing `/home/node/.isaiah` copied into the new volume before recreating the app. Back up and verify the old records first; an empty new volume does not migrate them automatically. The isolated qualification explicitly copied and checked its own old records. A general migration procedure for other installations has not been qualified, so do not promote this volume change to an existing installation without a verified migration.

## Local qualification boundary

The candidate was exercised with native AI Hub, the pinned local Ollama model and both synthetic investigation cases. The generic profile was also exercised against that same Ollama server's OpenAI-compatible endpoint. This does not qualify a different model, LM Studio, a remote provider, or every implementation of the compatible API. The optional upstream credential boundary was tested with a local synthetic endpoint, not with a credentialed production service.
