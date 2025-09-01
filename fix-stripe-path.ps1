# Fix Stripe CLI PATH issue
Write-Host "Fixing Stripe CLI PATH..." -ForegroundColor Yellow

# Refresh Scoop shims
scoop reset stripe

# Get the Stripe path
$stripePath = "$env:USERPROFILE\scoop\shims"

# Add to current session PATH if not already there
if ($env:PATH -notlike "*$stripePath*") {
    $env:PATH = "$stripePath;$env:PATH"
    Write-Host "Added Stripe to current session PATH" -ForegroundColor Green
}

# Verify Stripe is now available
Write-Host "`nVerifying Stripe CLI..." -ForegroundColor Yellow
$stripeVersion = & "$stripePath\stripe.exe" version 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Stripe CLI is working!" -ForegroundColor Green
    Write-Host $stripeVersion -ForegroundColor Cyan
} else {
    Write-Host "Still having issues. Try closing and reopening PowerShell." -ForegroundColor Yellow
    Write-Host "Then run: stripe version" -ForegroundColor Yellow
}

Write-Host "`nYou can now run:" -ForegroundColor Green
Write-Host "  stripe login" -ForegroundColor Cyan
Write-Host "  .\test-stripe-webhooks.ps1 -BackendPort 5001" -ForegroundColor Cyan