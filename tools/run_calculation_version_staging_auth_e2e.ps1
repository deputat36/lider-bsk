[CmdletBinding()]
param(
    [string]$FixtureManifestPath = 'artifacts/calculation-version-staging-fixture/fixture-manifest.json',

    [ValidateSet('allowed', 'forbidden', 'inactive')]
    [string]$Scenario = 'allowed',

    [string]$EvidencePath = ''
)

$ErrorActionPreference = 'Stop'
$StagingUrl = 'https://otulfnouybahfnsycxqn.supabase.co'
$Runner = 'tools/run_calculation_version_staging_auth_e2e.mjs'
$Validator = 'tools/validate-calculation-version-staging-auth-e2e-evidence.mjs'

function ConvertFrom-SecureValue {
    param([Security.SecureString]$Value)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

if (-not (Test-Path -LiteralPath $FixtureManifestPath)) {
    throw "Fixture manifest not found: $FixtureManifestPath"
}

$resolvedManifest = (Resolve-Path -LiteralPath $FixtureManifestPath).Path
if (-not $EvidencePath) {
    $EvidencePath = "artifacts/calculation-version-staging-auth-e2e-$Scenario-evidence.json"
}

$publishableKeySecure = Read-Host 'Staging publishable key' -AsSecureString
$email = Read-Host 'Temporary staging Auth email'
$passwordSecure = Read-Host 'Temporary staging Auth password' -AsSecureString
$publishableKey = ConvertFrom-SecureValue $publishableKeySecure
$password = ConvertFrom-SecureValue $passwordSecure

$managedVariables = @(
    'LIDER_STAGING_SUPABASE_URL',
    'LIDER_STAGING_PUBLISHABLE_KEY',
    'LIDER_STAGING_EMAIL',
    'LIDER_STAGING_PASSWORD',
    'LIDER_STAGING_SCENARIO',
    'LIDER_STAGING_FIXTURE_MANIFEST_PATH',
    'LIDER_STAGING_EVIDENCE_PATH',
    'LIDER_STAGING_SOURCE_CALCULATION_ID',
    'LIDER_STAGING_EXPECTED_UPDATED_AT',
    'LIDER_STAGING_NEED_ID',
    'LIDER_STAGING_IDEMPOTENCY_KEY',
    'LIDER_STAGING_TITLE'
)

try {
    foreach ($name in $managedVariables) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }

    $env:LIDER_STAGING_SUPABASE_URL = $StagingUrl
    $env:LIDER_STAGING_PUBLISHABLE_KEY = $publishableKey
    $env:LIDER_STAGING_EMAIL = $email
    $env:LIDER_STAGING_PASSWORD = $password
    $env:LIDER_STAGING_SCENARIO = $Scenario
    $env:LIDER_STAGING_FIXTURE_MANIFEST_PATH = $resolvedManifest
    $env:LIDER_STAGING_EVIDENCE_PATH = $EvidencePath

    node $Runner
    if ($LASTEXITCODE -ne 0) {
        throw "Authenticated staging calculation E2E failed with exit code $LASTEXITCODE"
    }

    node $Validator "--evidence=$EvidencePath" "--manifest=$resolvedManifest"
    if ($LASTEXITCODE -ne 0) {
        throw "Authenticated staging calculation evidence validation failed with exit code $LASTEXITCODE"
    }
}
finally {
    foreach ($name in $managedVariables) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    $publishableKey = $null
    $password = $null
    $email = $null
    $publishableKeySecure = $null
    $passwordSecure = $null
}
