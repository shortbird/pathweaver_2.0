# Stripe CLI Setup Script for Windows
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Stripe CLI Setup for Windows" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Check if Scoop is installed
$scoopInstalled = Get-Command scoop -ErrorAction SilentlyContinue

if (-not $scoopInstalled) {
    Write-Host "`nScoop package manager not found. Installing Scoop..." -ForegroundColor Yellow
    
    # Install Scoop
    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://get.scoop.sh')
    
    Write-Host "Scoop installed successfully!" -ForegroundColor Green
} else {
    Write-Host "Scoop is already installed." -ForegroundColor Green
}

# Install Stripe CLI via Scoop
Write-Host "`nInstalling Stripe CLI..." -ForegroundColor Yellow
scoop install stripe

Write-Host "`nStripe CLI installed successfully!" -ForegroundColor Green

# Verify installation
Write-Host "`nVerifying Stripe CLI installation..." -ForegroundColor Yellow
stripe version

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Run 'stripe login' to authenticate with your Stripe account"
Write-Host "2. Run the test script: .\test-stripe-webhooks.ps1"