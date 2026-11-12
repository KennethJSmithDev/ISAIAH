# Export OpenAPI from a FHIR CapabilityStatement

ISAIAH 0.2.0 implements the read and search part of [Community Opportunity DPI-I-804](https://ideas.intersystems.com/ideas/DPI-I-804). The standalone CLI turns a locally approved FHIR R4 (4.0.1), R4B (4.3.0), or R5 (5.0.0) CapabilityStatement into an OpenAPI 3.1 JSON document. The export records the input identity and the interactions it left out.

## Try it with synthetic inputs

From the ISAIAH 0.2.0 checkout, install the pinned Node dependency using the [offline checks setup](../README.md#offline-checks). Use PowerShell 7 and Node 24.21.0. The example creates three tiny local statements. It requires no IRIS connection, credentials, or model. Use a free port and set the same value in both terminals.

In the first terminal, from the checkout root:

```powershell
$work = Join-Path (Get-Location) ('.local/fhir-openapi-' + [guid]::NewGuid().ToString('N'))
$inputs = Join-Path $work 'inputs'
New-Item -ItemType Directory -Path $inputs -Force | Out-Null

foreach ($release in @{r4='4.0.1'; r4b='4.3.0'; r5='5.0.0'}.GetEnumerator()) {
    @{
        resourceType='CapabilityStatement'
        fhirVersion=$release.Value
        rest=@(@{mode='server'; resource=@(@{
            type='Organization'
            interaction=@(@{code='read'}, @{code='search-type'}, @{code='update'})
        })})
    } | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $inputs ($release.Key + '.json'))
}

$env:ISAIAH_PROJECT_PROFILE = Join-Path $work 'project.json'
$env:ISAIAH_HOME = Join-Path $work 'home'
$env:ISAIAH_LOOPBACK_PORT = '18791'
@{
    version=1
    id='fhir-openapi-example'
    root=$inputs
    allowApply=$false
    allowDesign=$false
    records=@(
        @{key='r4'; path='r4.json'; kind='fhir-capability'}
        @{key='r4b'; path='r4b.json'; kind='fhir-capability'}
        @{key='r5'; path='r5.json'; kind='fhir-capability'}
    )
} | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $env:ISAIAH_PROJECT_PROFILE
node standalone/cli.mjs serve
```

In the second terminal, from the checkout root:

```powershell
$env:ISAIAH_LOOPBACK_PORT = '18791'
$output = Join-Path (Get-Location) ('.local/fhir-openapi-output-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
foreach ($key in @('r4','r4b','r5')) {
    $run = node standalone/cli.mjs project fhir-openapi --record $key | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Export failed for $key" }
    $run.document | ConvertTo-Json -Depth 100 |
        Set-Content -Encoding utf8 (Join-Path $output ($key + '-openapi.json'))
    $run.document.info.title
    $run.document.paths.PSObject.Properties.Name
    $run.omitted
    $run.verification.liveBehavior
}
```

Each file contains `GET /Organization` and `GET /Organization/{id}`. The CLI lists `Organization: update` as omitted and shows live behavior as `unverified`. The files contain the OpenAPI document. The CLI run separately retains the omission list, source hash, and verification scope.

Try an unapproved record:

```powershell
node standalone/cli.mjs project fhir-openapi --record unapproved
```

The CLI refuses the record. Stop the standalone service in the first terminal with Ctrl+C.

## Use an approved endpoint statement

Obtain the CapabilityStatement from an endpoint you are authorized to inspect, using its FHIR `GET /metadata` endpoint and the approved client for that environment. Save the JSON to your selected project directory and register that file in the private profile. ISAIAH reads the selected local file. The exporter does not connect to the endpoint or receive its credentials. An explicitly marked `fhir-capability` record may be up to 8 MiB. This bound applies to the approved metadata file. Ordinary source reads remain capped at 64 KiB.

[HAPI's public test server](https://hapi.fhir.org/) lists R4, R4B, and R5 endpoints. Public test endpoints are shared and their metadata size can change. If a statement exceeds 8 MiB, use a smaller approved endpoint statement. Keep credentials and private records local.

## Qualification and limits

| Input | Observed result |
| --- | --- |
| Approved synthetic R4 fixture | The installed 0.2.0 CLI reproduced the accepted three-path export. Live R4 endpoint behavior was outside this check. |
| Authored R4B fixture and a public test-server statement | The installed CLI recognized 4.3.0 as R4B. The authored fixture produced the two advertised GET paths and listed update as omitted. The installed CLI also exported the captured R4B test-server statement. Separate direct resource reads are described below. |
| Approved R5 statement captured from synthetic IRIS for Health Build 154U | The installed CLI generated 314 paths and reported 942 omitted interactions. An independent comparison matched every generated path to its advertised read or search interaction. Repeating the export produced the same document. |
| Controlled local FHIR server, all three releases | The installed ISAIAH reader verified an approved synthetic Organization in each version. Independent endpoint read and search returned HTTP 200. This checks the direct read path and endpoint search, outside an IRIS production. |
| Public R5 test-server statement above the former 2 MiB limit | The installed CLI exported the approved statement through the larger metadata-file allowance. Ordinary source reads still refused the same file. |
| Separate native R5 Organization check | Authenticated instance read and search returned HTTP 200. This covers the tested Organization operations only. The export itself leaves live behavior unverified. |

The export leaves write operations, search parameters, server URLs, authentication, full profiles and custom operations outside its scope. See the [exporter source](../standalone/fhir-openapi.mjs), [profile and evidence boundaries](developer-workflow.md#inspect-interoperability-contracts), and [OpenAPI 3.1 specification](https://spec.openapis.org/oas/v3.1.0).
