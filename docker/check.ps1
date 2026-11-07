param([switch]$Standalone)
$ErrorActionPreference = 'Stop'
$origin = 'http://127.0.0.1:' + $(if ($Standalone) { 18757 } else { 18747 })
$headers = @{ Origin = $origin; 'X-Isaiah-Request' = 'browser' }
$objective = 'Investigate why the synthetic message reached the wrong destination. Use the trace and receipts and recommend the smallest justified correction or review.'
$expected = @(
    @{ incident = 'R17'; finding = 'rule_mismatch'; branch = 'diagnostic'; action = 'align_match_priority' },
    @{ incident = 'R29'; finding = 'downstream_fallback'; branch = 'review'; action = 'review_destination_availability' }
)

foreach ($case in $expected) {
    $state = Invoke-RestMethod "$origin/api/state" -TimeoutSec 6
    if (!$state.environment.ready -or $state.run.active) {
        throw 'The Compose app must be connected and idle.'
    }
    $body = @{ incident = $case.incident; objective = $objective } | ConvertTo-Json -Compress
    $accepted = Invoke-RestMethod "$origin/api/start" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 6
    $deadline = (Get-Date).AddSeconds(315)
    do {
        Start-Sleep -Seconds 2
        $run = (Invoke-RestMethod "$origin/api/state" -TimeoutSec 6).run
        if ($run.id -ne $accepted.id) { throw 'Run ownership changed during qualification.' }
    } while ($run.active -and (Get-Date) -lt $deadline)
    if ($run.active -or $run.verification.status -ne 'pass' -or $run.decision.finding -ne $case.finding -or
        $run.branchReceipt.mode -ne $case.branch -or $run.decision.proposal.action -ne $case.action -or
        $run.metrics.modelResponses -lt 2 -or $run.metrics.toolDispatches -lt 1) {
        throw "Compose qualification failed for $($case.incident), run $($run.id), status $($run.status). Inspect /api/state."
    }
    $run
}
