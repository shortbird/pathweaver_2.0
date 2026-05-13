try {
    $r = Invoke-WebRequest -Uri 'https://www.optioeducation.com/privacy' -UseBasicParsing -TimeoutSec 15
    Write-Output "STATUS: $($r.StatusCode)"
    Write-Output "BYTES: $($r.RawContentLength)"
    $content = $r.Content
    if ($content -match 'privacy|cookies|collect|coppa|children') {
        Write-Output "CONTENT: looks like a privacy policy"
    } else {
        Write-Output "CONTENT: page exists but may not be the privacy policy"
    }
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
