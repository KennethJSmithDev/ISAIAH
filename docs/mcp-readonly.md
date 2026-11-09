# Scoped read-only MCP trace

This optional interface exposes one existing ISAIAH trace projection to an authenticated MCP client. It reads up to 40 message headers for one pre-authorized session. It does not start an investigation, call a model, verify delivery, approve a procedure, or apply a rule. A recorded hop is not a destination receipt.

The tool requires four strings: `instance`, `namespace`, `production`, and `session`. They must match the configured trace identity, the actual namespace and active production, and an existing `^IsaiahTrace("session",session)` first-header grant. The existing first-header consistency check and bounded SQL projection remain authoritative. Both the MCP policy and tool check scope against the authenticated IRIS principal.

## Operator setup

Installation of the IPM module only loads classes. A qualified IRIS administrator must separately configure an MCP application and a dedicated principal. Do this in the intended instance and namespace, after establishing a scoped trace target and authorized synthetic session; never copy another project's credentials or make the MCP principal a general application administrator.

1. Follow the existing standalone trace setup for `^IsaiahTrace("identity")`, `^IsaiahTrace("production")`, and the specific allowed `^IsaiahTrace("session",id)` first-header entry. A change to the session or production requires an authorized administrator. The MCP endpoint cannot change these grants.
2. Create a dedicated account and role with namespace database READ, SQL SELECT on `Ens.MessageHeader`, and the required runtime/library read privileges. Grant no namespace-database WRITE. Create a distinct application resource and grant the role USE. The database READ grant can cover more than the selected session at the database layer: prevent direct SQL, terminal, superserver or other ingress for this principal; the MCP policy is not a substitute for those controls.
3. Set `^IsaiahTrace("mcp","principal")` in the target namespace to that dedicated authenticated account. Register a password-authenticated MCP application with dispatch class `Isaiah.TraceMCP`, the chosen namespace and resource. Limit the application's role mapping; do not add a broad message-write role merely because a different application required one.
4. Configure and enable IRIS auditing and the user event `ISAIAH/MCP/TraceAccess`. The tool records allowed reads with the approved session and records refusals without copying untrusted scope strings. If the audit call fails, the tool does not return the trace. Verify event persistence and monitoring for the actual deployment; administrative audit reconfiguration is outside the MCP tool's authority.
5. Configure the vendor `iris-mcp-server` in a protected, operator-owned file with separate bridge and endpoint credentials. Use stdio or another explicitly secured transport, and initially allow only `ReadSessionTrace`. Do not put either credential in a browser, source repository, logs, or the other principal's configuration. Start it locally according to the vendor's AI Hub documentation.

For the Build 154 stdio bridge, the following illustrates the configuration shape. Replace every placeholder locally and keep the file private; the values are not interchangeable.

```toml
[mcp]
transport = "stdio"
[[iris]]
name = "isaiah"
server = {host="127.0.0.1",port=1972,username="<bridge-user>",password="<bridge-password>"}
pool = {min=1,max=2}
endpoints = [{path="/mcp/isaiah-trace",username="<dedicated-trace-user>",password="<trace-user-password>"}]
[logging]
output = "file"
file = "<protected-log-path>"
```

The application path must match the one the administrator actually registered. If IRIS runs in a separate container, run the bridge in that container or use an explicitly secured network path; the example does not publish an IRIS port. Treat endpoint setup and credential renewal as administrative actions, not as automatic package installation.

The native bridge's connection account and the MCP application's user are separate security identities. Container or local network isolation, TLS where applicable, credential lifecycle, access to the bridge configuration and denial of other ingress remain operator responsibilities.

## Contract and failure behavior

An authenticated, in-scope call returns `{target, session, hops}` from the same reader as the standalone REST trace. The target carries instance, namespace, active production, build and edition. Each hop has the recorded header ID, source, target, status, error flag and timestamp. No delivery verification is implied.

Wrong credentials, another principal, wrong target or production, an unapproved or malformed session, and unknown tools are denied. A missing/incomplete/over-limit projection or failed audit returns an error without trace data. The actual per-tool audit call requires auditing and the event to remain enabled; administrators should monitor audit health and independently check that the installation's security configuration has not drifted.

This local candidate was tested on a disposable IRIS for Health Community Build 154U instance, with a dedicated synthetic production and the vendor stdio bridge. Consult the private qualification record for exact source hashes, read-only role checks, negative cases and limitations. The optional module is not automatically enrolled on an existing instance and has not been qualified against other IRIS editions or builds.
