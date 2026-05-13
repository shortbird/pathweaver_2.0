try {
    $r = Invoke-WebRequest -Uri 'http://localhost:8081' -TimeoutSec 60 -UseBasicParsing
    Write-Output "STATUS: $($r.StatusCode)"
    Write-Output "BYTES: $($r.RawContentLength)"
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
Start-Sleep -Seconds 5
$tail = Get-Content 'C:\Users\tanne\Desktop\pw_v2\frontend_v2_stdout.log' -Tail 15
$tail | ForEach-Object { Write-Output $_ }
