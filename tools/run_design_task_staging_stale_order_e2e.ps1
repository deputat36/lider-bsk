[CmdletBinding()]
param(
    [ValidateSet('plan', 'stale_order')]
    [string]$Mode = 'plan',

    [string]$FixtureManifestPath = 'artifacts/design-task-staging-fixture-manifest.json',
    [string]$EvidencePath = 'artifacts/design-task-staging-stale-order-evidence.json'
)

$ErrorActionPreference = 'Stop'
$StagingUrl = 'https://otulfnouybahfnsycxqn.supabase.co'
$ProductionRef = 'ofewxuqfjhamgerwzull'
$Runner = 'tools/design-task-staging-stale-order-e2e-v1.mjs'
$Validator = 'tools/validate-design-task-staging-stale-order-evidence.mjs'

function ConvertFrom-SecureValue {
    param([Security.SecureString]$Value)
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if ($StagingUrl.Contains($ProductionRef)) {
    throw 'Production endpoint is forbidden.'
}

if ($Mode -eq 'plan') {
    try {
        if (Test-Path -LiteralPath $FixtureManifestPath) {
            $env:STAGING_FIXTURE_MANIFEST_PATH = (Resolve-Path -LiteralPath $FixtureManifestPath).Path
        }
        node $Runner --mode=plan
        exit $LASTEXITCODE
    }
    finally {
        Remove-Item 'Env:STAGING_FIXTURE_MANIFEST_PATH' -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path -LiteralPath $FixtureManifestPath)) {
    throw "Fixture manifest not found: $FixtureManifestPath"
}

$resolvedManifest = (Resolve-Path -LiteralPath $FixtureManifestPath).Path
$publishableKeySecure = Read-Host 'Staging publishable key' -AsSecureString
$testEmail = Read-Host 'Temporary staging Auth email'
$testPasswordSecure = Read-Host 'Temporary staging Auth password' -AsSecureString

$publishableKey = ConvertFrom-SecureValue $publishableKeySecure
$testPassword = ConvertFrom-SecureValue $testPasswordSecure

try {
    $env:STAGING_SUPABASE_URL = $StagingUrl
    $env:STAGING_SUPABASE_PUBLISHABLE_KEY = $publishableKey
    $env:STAGING_TEST_EMAIL = $testEmail
    $env:STAGING_TEST_PASSWORD = $testPassword
    $env:STAGING_FIXTURE_MANIFEST_PATH = $resolvedManifest
    $env:STAGING_EVIDENCE_PATH = $EvidencePath

    node $Runner "--mode=$Mode"
    if ($LASTEXITCODE -ne 0) {
        throw "Authenticated staging stale-order runner failed with exit code $LASTEXITCODE"
    }

    node $Validator "--evidence=$EvidencePath" "--manifest=$resolvedManifest"
    if ($LASTEXITCODE -ne 0) {
        throw "Authenticated staging stale-order evidence validation failed with exit code $LASTEXITCODE"
    }
}
finally {
    foreach ($name in @(
        'STAGING_SUPABASE_URL',
        'STAGING_SUPABASE_PUBLISHABLE_KEY',
        'STAGING_TEST_EMAIL',
        'STAGING_TEST_PASSWORD',
        'STAGING_FIXTURE_MANIFEST_PATH',
        'STAGING_EVIDENCE_PATH'
    )) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    $publishableKey = $null
    $testPassword = $null
    $testEmail = $null
}
