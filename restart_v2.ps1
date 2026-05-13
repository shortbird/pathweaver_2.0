$conns = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Write-Output "Stopped processes on port 8081"
} else {
    Write-Output "Port 8081 was not bound"
}
Start-Sleep -Seconds 2
Set-Location 'C:\Users\tanne\Desktop\pw_v2\frontend-v2'
Start-Process cmd.exe -ArgumentList '/c npx expo start --web --clear > C:\Users\tanne\Desktop\pw_v2\frontend_v2_stdout.log 2>&1' -WindowStyle Hidden
Write-Output "Restarted dev server"
