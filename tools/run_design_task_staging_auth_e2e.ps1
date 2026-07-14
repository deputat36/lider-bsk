[CmdletBinding()]
param(
    [ValidateSet('plan', 'create_replay_conflicts', 'forbidden_role', 'inactive_profile', 'unknown_role')]
    [string]$Mode = 'plan',

    [string]$OrderId,
    [string]$NeedId,
    [string]$ExpectedUpdatedAt,
    [string]$IdempotencyKey,
    [string]$TaskTitle = 'Synthetic staging design E2E',
    [string]$EvidencePath = 'artifacts/design-task-staging-auth-e2e-evidence.json'
)

$ErrorActionPreference = 'Stop'
$StagingUrl = 'https://otulfnouybahfnsycxqn.supabase.co'
$ProductionRef = 'ofewxuqfjhamgerwzull'

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

if ($Mode -eq 'plan') {
    node tools/design-task-staging-auth-e2e.mjs --mode=plan
    exit $LASTEXITCODE
}

foreach ($required in @('OrderId', 'NeedId', 'ExpectedUpdatedAt', 'IdempotencyKey')) {
    if ([string]::IsNullOrWhiteSpace((Get-Variable -Name $required -ValueOnly))) {
        throw "Missing required parameter: $required"
    }
}

if ($StagingUrl.Contains($ProductionRef)) {
    throw 'Production endpoint is forbidden.'
}

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
    $env:STAGING_ORDER_ID = $OrderId
    $env:STAGING_NEED_ID = $NeedId
    $env:STAGING_EXPECTED_UPDATED_AT = $ExpectedUpdatedAt
    $env:STAGING_IDEMPOTENCY_KEY = $IdempotencyKey
    $env:STAGING_TASK_TITLE = $TaskTitle
    $env:STAGING_EVIDENCE_PATH = $EvidencePath

    node tools/design-task-staging-auth-e2e.mjs "--mode=$Mode"
    if ($LASTEXITCODE -ne 0) {
        throw "Authenticated staging E2E runner failed with exit code $LASTEXITCODE"
    }
}
finally {
    foreach ($name in @(
        'STAGING_SUPABASE_URL',
        'STAGING_SUPABASE_PUBLISHABLE_KEY',
        'STAGING_TEST_EMAIL',
        'STAGING_TEST_PASSWORD',
        'STAGING_ORDER_ID',
        'STAGING_NEED_ID',
        'STAGING_EXPECTED_UPDATED_AT',
        'STAGING_IDEMPOTENCY_KEY',
        'STAGING_TASK_TITLE',
        'STAGING_EVIDENCE_PATH'
    )) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    $publishableKey = $null
    $testPassword = $null
}
