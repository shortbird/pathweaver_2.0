# Direct Stripe Webhook Forwarding Script
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Starting Stripe Webhook Forwarding" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Set the Stripe executable path directly
$stripePath = "$env:USERPROFILE\scoop\shims\stripe.exe"

# Check if Stripe exists at this path
if (Test-Path $stripePath) {
    Write-Host "✓ Found Stripe CLI at: $stripePath" -ForegroundColor Green
    
    # Login first (if needed)
    Write-Host "`nLogging into Stripe..." -ForegroundColor Yellow
    & $stripePath login
    
    # Start forwarding
    Write-Host "`n=====================================" -ForegroundColor Cyan
    Write-Host "Starting webhook forwarding to localhost:5001" -ForegroundColor Yellow
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "IMPORTANT: Copy the webhook secret below and add to backend/.env" -ForegroundColor Green
    Write-Host "STRIPE_WEBHOOK_SECRET=whsec_..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Keep this window open while testing!" -ForegroundColor Red
    Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Forward webhooks to your backend on port 5001
    & $stripePath listen --forward-to localhost:5001/api/subscriptions/webhook
} else {
    Write-Host "✗ Stripe CLI not found at expected location" -ForegroundColor Red
    Write-Host "Please ensure Stripe CLI is installed via Scoop" -ForegroundColor Yellow
    Write-Host "Run: scoop install stripe" -ForegroundColor Cyan
}