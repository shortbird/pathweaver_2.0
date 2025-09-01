# Stripe Webhook Testing Script for Local Development
param(
    [string]$BackendPort = "5001",
    [switch]$SkipLogin
)

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Stripe Webhook Local Testing Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Check if Stripe CLI is installed
$stripeInstalled = Get-Command stripe -ErrorAction SilentlyContinue

if (-not $stripeInstalled) {
    Write-Host "`nStripe CLI not found!" -ForegroundColor Red
    Write-Host "Please run: .\setup-stripe-cli.ps1" -ForegroundColor Yellow
    exit 1
}

# Login to Stripe (unless skipped)
if (-not $SkipLogin) {
    Write-Host "`nStep 1: Logging into Stripe..." -ForegroundColor Yellow
    Write-Host "This will open your browser to authenticate." -ForegroundColor Gray
    stripe login
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to login to Stripe!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Successfully logged into Stripe!" -ForegroundColor Green
} else {
    Write-Host "`nSkipping Stripe login (already authenticated)" -ForegroundColor Gray
}

# Start webhook forwarding
Write-Host "`nStep 2: Starting webhook forwarding to localhost:$BackendPort..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Gray
Write-Host "IMPORTANT: Keep this window open!" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Gray
Write-Host ""
Write-Host "The webhook signing secret will appear below." -ForegroundColor Green
Write-Host "Copy it and add to your backend .env file:" -ForegroundColor Green
Write-Host "STRIPE_WEBHOOK_SECRET=whsec_..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop forwarding when done testing." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Gray
Write-Host ""

# Forward webhooks to local backend
stripe listen --forward-to "localhost:${BackendPort}/api/subscriptions/webhook"