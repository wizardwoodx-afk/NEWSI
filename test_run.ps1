$p = Start-Process -FilePath "D:\selfimpulse\src-tauri\target\release\selfimpulse.exe" -PassThru
$p.WaitForExit(3000)
Write-Host "PID: $($p.Id)"
Write-Host "HasExited: $($p.HasExited)"
Write-Host "ExitCode: $($p.ExitCode)"
