$list = Get-Process -Name selfimpulse -ErrorAction SilentlyContinue
foreach ($p in $list) {
    Write-Host "PID: $($p.Id)  Responding: $($p.Responding)  Handle: $($p.MainWindowHandle)  Title: '$($p.MainWindowTitle)'"
    $ws = New-Object -ComObject WScript.Shell
    $res = $ws.AppActivate($p.Id)
    Write-Host "AppActivate result: $res"
}
