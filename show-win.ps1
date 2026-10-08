Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinUtil {
    public delegate bool CallBackPtr(IntPtr hwnd, int lParam);
    [DllImport("user32.dll")]
    public static extern int EnumWindows(CallBackPtr callPtr, int lPar);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    public static void ShowAll(uint pid) {
        EnumWindows((hWnd, lPar) => {
            uint p;
            GetWindowThreadProcessId(hWnd, out p);
            if (p == pid) {
                var sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                Console.WriteLine("HWND: " + hWnd + " Vis: " + IsWindowVisible(hWnd) + " Title: " + sb.ToString());
                ShowWindow(hWnd, 9);
                SetForegroundWindow(hWnd);
            }
            return true;
        }, 0);
    }
}
"@

$procs = Get-Process -Name "selfimpulse" -ErrorAction SilentlyContinue
foreach ($p in $procs) {
    Write-Host "Process: $($p.Id)"
    [WinUtil]::ShowAll([uint32]$p.Id)
}
