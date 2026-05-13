$buildId = '871d8d65-8491-4b9a-9e8f-a0d7f2044e7d'
$max = 20  # max 20 iterations of 60s = up to 20 min
$i = 0
while ($i -lt $max) {
    $i++
    Set-Location 'C:\Users\tanne\Desktop\pw_v2\frontend-v2'
    $out = & eas build:view $buildId 2>$null | Out-String
    $statusLine = ($out -split "`n") | Where-Object { $_ -match '^Status\s+' } | Select-Object -First 1
    Write-Output "[poll $i] $statusLine"
    if ($out -match 'Status\s+finished') {
        Write-Output '---BUILD FINISHED---'
        $archive = ($out -split "`n") | Where-Object { $_ -match 'Application Archive URL' } | Select-Object -First 1
        Write-Output $archive
        break
    }
    if ($out -match 'Status\s+errored' -or $out -match 'Status\s+canceled') {
        Write-Output '---BUILD FAILED---'
        Write-Output $out
        break
    }
    Start-Sleep -Seconds 45
}
if ($i -ge $max) {
    Write-Output '---TIMED OUT after polling---'
}
