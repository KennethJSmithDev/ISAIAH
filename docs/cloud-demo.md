# InterSystems Developer Cloud integration

This integration is experimental. The Dockerfiles package ISAIAH 0.2.0's existing native IRIS module and Node workspace. A complete, authenticated Developer Cloud deployment has not been qualified. The supported local installation remains the existing Compose route.

## GitOps configuration

Use **Automatic (GitOps)** with this repository and the `cloud-demo` branch after the required packaging source is available there. Keep the IRIS initialization-method field empty: the image entrypoint invokes ISAIAH's existing provisioning script. That field executes an ObjectScript method after deployment; it does not install the image. No additional GitHub Actions deployment workflow or service-account key is required by these Dockerfiles.

Before configuring a public deployment, establish:

- An authorized Health AI Hub **2026.3.0AI Build 154U** base image accessible to the builder.
- Private connectivity between the IRIS and Node services, and authenticated HTTPS ingress for the workspace.
- Protected runtime configuration, persistent application records, and an approved reachable model endpoint.

Build 109 is not qualified by this integration. A stable IRIS image without the required AI Hub capabilities is not a substitute.

## Build the native image

The root Dockerfile builds the **IRIS service**, including the module, checksum-pinned IPM 0.10.10 installer, and existing provisioning script:

```sh
docker build --pull=false \
  --build-arg ISAIAH_IRIS_IMAGE='<approved Health AI Hub Build 154U image reference>' \
  -t isaiah-cloud-native:review .
```

The default base is the official short **local alias** `irishealth-community:2026.3.0AI.154.0`. The [contest instructions](https://community.intersystems.com/post/intersystems-programming-contest-ai-agents-interoperability-workflows) prescribe loading the authorized EAP archive and assigning this alias before using it in a Dockerfile:

```sh
docker image load -i irishealth-community-2026.3.0AI.154.0-docker.tar.gz
docker image inspect '<loaded image reference>' --format '{{.Id}} {{.Architecture}}'
docker tag '<loaded image reference>' irishealth-community:2026.3.0AI.154.0
docker build --pull=false -t isaiah-cloud-native:review .
```

Verify the acquired image identity and architecture before tagging it. The qualified local runtime is Linux amd64; an alias alone does not prove the image's contents or compatibility.

This alias is **not a public image-download endpoint**. The remote GitOps builder must have the authorized image preloaded under that name, or support an approved alternative through the build argument shown above. Loading it on a developer's computer does not configure the cloud builder. Availability of this image on Developer Cloud remains unverified; a builder without it will fail base-image resolution. The default removes the unconditional empty-ARG failure, not this acquisition requirement.

The published manual deployment workflow supplies no build arguments; automatic GitOps build-argument support is unverified. Setting a runtime variable does not supply a Docker build argument.

Share source and acquisition instructions, not EAP archives, model weights, or EAP-derived images in a public registry. The installer checksum must remain the one selected in `docker/ipm.psd1`.

## Startup and scoped credentials

The official `iris-app` charts 0.0.4 and 0.0.10 replace image CMD arguments. ISAIAH therefore validates configuration in its ENTRYPOINT and executes `/tini -- /iris-main` with a fixed `--after /opt/isaiah/provision.sh` hook. Unknown or conflicting arguments are refused; the supported arguments are defined in [entrypoint.py](../cloud/entrypoint.py). Recheck compatibility when the platform changes its chart or startup arguments.

The platform's administrator-password file and gateway configuration remain separate from ISAIAH's scoped REST and provider-gateway credentials. Prefer a protected JSON file at `/run/secrets/isaiah-credentials` containing the existing `password` and `providerToken` fields. When that file is absent, the native image accepts these runtime variables:

| Variable | Required value |
| --- | --- |
| `ISAIAH_ADAPTER_PASSWORD` | `Is!` followed by 28 uppercase hexadecimal characters |
| `ISAIAH_PROVIDER_TOKEN` | 64 uppercase hexadecimal characters |

Use fresh private values through protected platform configuration. Keep them out of Git, Dockerfiles, build arguments, screenshots, and logs. Confirm the platform's configuration-access policy and delivery mechanism; a variables form alone does not establish secure storage.

Missing, malformed, partial, or conflicting credentials stop startup. A malformed mounted file is not replaced. Environment fallback creates a new file exclusively under a directory owned by the image user, enforcing directory mode `0700` and file mode `0600`. It does not overwrite an existing file. The fallback variables are removed before `iris-main` starts, and their values are not printed or placed in its arguments. Mounted-secret permissions remain the platform's responsibility. See [credentials.py](../cloud/credentials.py).

The unchanged provisioning script checks Build 154U, creates the namespace, installs the module, configures scoped access, starts `Isaiah.Production`, and seeds the two synthetic incidents.

## Native readiness integration

Kubernetes does not execute the image's Docker HEALTHCHECK. The selected chart must require both ISAIAH's provisioning marker `/tmp/isaiah-private/ready` and its original IRIS readiness command. [The readiness renderer](../cloud/isaiah-readiness-render) and [guarded patch](../cloud/readiness.jsonpatch) implement that narrow change for release `isaiah`, StatefulSet `isaiah-iris-app`, and chart `iris-app` 0.0.4. They preserve IRIS startup arguments and startup/liveness probes, and refuse owner or probe drift.

These files take effect only when the deployment controller invokes the renderer as a Helm post-renderer, or provides an independently verified equivalent readiness override. The official reusable workflow has no post-renderer input; support in portal GitOps remains unverified. Do not activate competing portal and Actions controllers or replace native probes with the static NGINX demo's probes. Publishing the helper files alone does not qualify readiness.

## Workspace, storage, and model routing

`cloud/app.Dockerfile` packages the unchanged Node workspace and locked dependencies. Its pinned Node OCI index is `sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f`, publicly resolvable from the official `node` repository. The selected Linux amd64 image reports Node 24.22.0. Earlier host-CLI archive qualification used Node 24.21.0; it is a separate runtime record, not a claim that this container uses that version. No new provider or model route is introduced.

```sh
docker build --pull=false -f cloud/app.Dockerfile -t isaiah-cloud-app:review .
```

Verify the selected image identity and architecture before use. A local image-name lookup can fail after moving Docker stores even when the pinned upstream index remains valid. The root IRIS image does not include this separate Node service or a model server.

```text
browser -> Node workspace :18747
Node -> authenticated IRIS /isaiah on iris:52773
IRIS native AI Hub -> per-run Node gateway on app:18745
Node gateway -> selected local inference endpoint
```

Both services need matching scoped credentials. A file generated inside the IRIS container is not automatically shared with the Node container. Preserve Node's `/home/node` records; qualify IRIS durable storage separately, or use an explicitly disposable synthetic lifecycle. Follow the existing-installation backup warnings before container recreation.

The official chart includes persistence and sidecar options, but their availability through automatic GitOps configuration is unverified. The default public IRIS web port is 52773; publishing it does not publish the Node workspace. Its HTTP health check can pass while disconnected. Native readiness additionally requires the authorized IRIS connection and selected model route.

The workspace retains its localhost Host/Origin checks and has no general public-user login/session layer. A public hostname is refused. TLS ingress or a signed-in cloud control panel does not authenticate application visitors. Establish authenticated ingress before adapting public routing; an unauthenticated proxy that rewrites requests to localhost is unsafe. Keep the provider callback, management interfaces, approval material, and account credentials private.

Generic provider profiles deliberately select local HTTP endpoints. The existing ChatGPT account bridge reaches OpenAI over HTTPS, but its saved account store requires Windows DPAPI and loopback consent; it is not a qualified Linux-cloud sign-in route. Model availability, provider eligibility, credentials, and request budgets must be established separately. These Dockerfiles do not enable apply/rollback or promote browser teaching.

## Qualification status

Local native and Node image builds passed. Fourteen Linux bootstrap checks passed for non-root ownership, private file modes, no-follow creation, conflict refusal and launch ordering; the real default entrypoint also refused missing scoped credentials before IRIS startup. The selected Node image reported version 24.22.0. These isolated fixtures used synthetic values, no network and no running IRIS instance or model. They do not qualify a native Cloud workflow.

The native readiness renderer passed fourteen offline chart and shell checks. Earlier local R17/R29 evidence remains separate. Startup/install of the combined Cloud topology, authenticated routing, durable recovery, model compatibility, and actual hosted R17/R29 execution and receipts still require qualification. Source approval, publication, platform configuration and deployment remain separate gates.

## References

- [Official contest and Developer Cloud clarification](https://community.intersystems.com/post/intersystems-programming-contest-ai-agents-interoperability-workflows)
- [AI Hub template and EAP acquisition](https://github.com/intersystems-community/ai-hub-dev-template)
- [InterSystems container entrypoints and durable state](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ADOCK)
- [Cloud deployment workflow reference](https://github.com/intersystems-community/cloud-deployment)
- [Official chart index](https://charts.demo.community.intersystems.com/index.yaml)
