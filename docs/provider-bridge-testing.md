# Experimental account-provider bridge socket

ChatGPT/Codex remains the qualified account-based route. The `local-account-bridge.v1` extension socket lets another independently implemented, provider-authorized local bridge use the same native AI Hub gateway. It is not a completed Copilot, Gemini or Claude account integration. No additional provider SDK, login flow, subscription entitlement, or successful inference is established by this socket.

## Bridge responsibility

The bridge owns the provider's documented sign-in, consent, token storage, renewal and disconnect flow. Use a provider-supported integration; compatibility with HTTP syntax is not permission to reuse consumer tokens. Never extract another application's credentials or send account tokens to IRIS or the browser. Keep the bridge's local bearer secret separate from provider tokens, IRIS passwords, and ISAIAH's per-run gateway secret.

Expose these existing bounded gateway interfaces on one local port:

- `GET /`: the bridge's local account-management page, with explicit provider identity and experimental status. Protect account-changing operations against foreign origins and require explicit user action.
- `GET /v1/models`: authenticated model discovery. Return `data` entries with exact model `id` strings. Listing a model does not qualify it.
- `POST /v1/chat/completions`: authenticated, non-streaming Chat Completions transport. Preserve the supplied function-tool definitions, call IDs, names, arguments and tool-result association. Return complete assistant messages and usage counters, or a clear failure.

The bridge must act as model transport. Native AI Hub continues to own tool execution. Do not start an additional agent loop, execute tool calls inside the bridge, introduce built-in tools, or translate a dropped/interrupted response into success. Respect cancellation, request limits and provider policy. If the provider's official SDK cannot preserve that boundary, report the compatibility gap rather than bypassing it.

## Select a bridge

Prepare a new private profile, using the model ID advertised by the bridge:

```powershell
isaiah provider preset compatible --model YOUR-MODEL-ID --port 18879 --profile .local/test-provider.json --account-name "Your Provider" --account-origin http://127.0.0.1:18879
```

Use `--compose` when the app runs in Compose. That changes the model origin to `host.docker.internal`; the account-management link remains operator loopback. Both origins must use the same explicitly selected port. Public management URLs, embedded credentials, other URL paths, unsupported protocol identifiers and self-declared qualification are refused.

The equivalent optional profile extension is:

```json
{
  "id": "external-provider-test",
  "kind": "openai-compatible",
  "origin": "http://127.0.0.1:18879",
  "model": "YOUR-MODEL-ID",
  "account": {
    "protocol": "local-account-bridge.v1",
    "name": "Your Provider",
    "managementOrigin": "http://127.0.0.1:18879"
  }
}
```

Set `ISAIAH_PROVIDER_PROFILE_FILE` to this file and `ISAIAH_PROVIDER_CREDENTIAL_FILE` to the separate local bridge bearer-secret file. Start the bridge using its own instructions, then restart only the task-owned ISAIAH service. No profile switch changes a running service automatically. The workspace links to the bridge's management page and labels it experimental. Results retain `provider.qualification: "experimental-unqualified"`; model discovery does not remove that label. The static simulation contains no provider-management control.

## Tester qualification

Use your own authorized runtime and account, synthetic fixtures only, and a disposable local profile. Do not upload EAP images, model weights, account files, passwords or raw credentials.

1. Record OS, exact IRIS edition/build/architecture, ISAIAH source identity, bridge/SDK version, authentication method and model ID. Confirm that the provider permits this integration and that the account is eligible.
2. Connect through the bridge's own official sign-in and consent flow. Confirm that absent credentials and foreign-origin account requests are refused. Do not include account identity or tokens in the report.
3. Run the original R17 and R29 synthetic investigations. Each must execute native AI Hub, call the scoped evidence tool, produce the correct actual production branch, and pass the independent verifier. Keep the proposal, production receipt and verifier result separate.
4. Check wrong-run, wrong-model and missing-credential refusal; interruption and cancellation; and preservation of function-call identity through the tool-result turn. A response must finish completely before success is reported.
5. Confirm that profile selection and account connection do not accept a procedure, approve a change, or bypass apply/rollback protections. Stop only your own test processes afterward.
6. Return a sanitized receipt identifying the tested source, versions, synthetic run IDs, model/tool counts, branch and verifier outcomes, negative checks and unresolved issues. A catalog, login screenshot or fixed response alone is not a native compatibility pass.

Keep bridge protocol tests, fresh native execution and external tester reports distinguishable. Successful testing of one account/model/platform does not establish general compatibility. Retain failed attempts and do not silently change frozen expectations after observing the model's answer.
