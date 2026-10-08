$sig = @"
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
"@
Add-Type -MemberDefinition $sig -Name NativeUtil -Namespace Native -ErrorAction SilentlyContinue

$procs = Get-Process -Name selfimpulse -ErrorAction SilentlyContinue
foreach ($p in $procs) {
    $targetPid = $p.Id
    Write-Host "Target PID: $targetPid"
    [Native.NativeUtil]::EnumWindows({
        param($hWnd, $lParam)
        $pidOut = 0
        [Native.NativeUtil]::GetWindowThreadProcessId($hWnd, [ref]$pidOut) | Out-Null
        if ($pidOut -eq $targetPid) {
            Write-Host "Activating Window handle $hWnd for PID $targetPid"
            [Native.NativeUtil]::ShowWindow($hWnd, 9) | Out-Null
            [Native.NativeUtil]::SetForegroundWindow($hWnd) | Out-Null
        }
        return $true
    }, [IntPtr]::Zero) | Out-Null
}
