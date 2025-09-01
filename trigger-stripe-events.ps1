# Stripe Event Trigger Script for Testing
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Stripe Test Event Trigger Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

function Show-Menu {
    Write-Host "`nSelect an event to trigger:" -ForegroundColor Yellow
    Write-Host "1. Successful checkout (new subscription)" -ForegroundColor White
    Write-Host "2. Subscription updated (tier change)" -ForegroundColor White
    Write-Host "3. Subscription deleted (cancellation)" -ForegroundColor White
    Write-Host "4. Payment succeeded" -ForegroundColor White
    Write-Host "5. Payment failed" -ForegroundColor White
    Write-Host "6. Run all tests in sequence" -ForegroundColor Green
    Write-Host "0. Exit" -ForegroundColor Gray
    Write-Host ""
}

function Trigger-Event {
    param([string]$EventType, [string]$Description)
    
    Write-Host "`nTriggering: $Description" -ForegroundColor Cyan
    Write-Host "Event: $EventType" -ForegroundColor Gray
    
    $result = stripe trigger $EventType 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Event triggered successfully!" -ForegroundColor Green
        Write-Host "Check your backend logs to verify webhook processing." -ForegroundColor Gray
    } else {
        Write-Host "✗ Failed to trigger event!" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 2
}

# Main loop
do {
    Show-Menu
    $choice = Read-Host "Enter your choice"
    
    switch ($choice) {
        "1" {
            Trigger-Event "checkout.session.completed" "Successful checkout session"
        }
        "2" {
            Trigger-Event "customer.subscription.updated" "Subscription update"
        }
        "3" {
            Trigger-Event "customer.subscription.deleted" "Subscription cancellation"
        }
        "4" {
            Trigger-Event "invoice.payment_succeeded" "Successful payment"
        }
        "5" {
            Trigger-Event "invoice.payment_failed" "Failed payment"
        }
        "6" {
            Write-Host "`nRunning all test events..." -ForegroundColor Yellow
            Trigger-Event "checkout.session.completed" "Successful checkout session"
            Trigger-Event "customer.subscription.updated" "Subscription update"
            Trigger-Event "invoice.payment_succeeded" "Successful payment"
            Trigger-Event "invoice.payment_failed" "Failed payment"
            Trigger-Event "customer.subscription.deleted" "Subscription cancellation"
            Write-Host "`nAll tests completed!" -ForegroundColor Green
        }
        "0" {
            Write-Host "`nExiting..." -ForegroundColor Gray
        }
        default {
            Write-Host "Invalid choice. Please try again." -ForegroundColor Red
        }
    }
} while ($choice -ne "0")

Write-Host "`nGoodbye!" -ForegroundColor Cyan