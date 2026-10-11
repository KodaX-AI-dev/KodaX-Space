param(
  [string]$NodeScript,
  [string[]]$ScriptArguments = @(),
  [string]$LogPath,
  [string]$JobFile,
  [int]$OwnerPid
)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class SpaceTestDesktop {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct StartupInfo {
    public int cb;
    public string reserved, desktop, title;
    public int x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
    public short showWindow, reservedSize;
    public IntPtr reservedBytes, stdInput, stdOutput, stdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct ProcessInfo {
    public IntPtr process, thread;
    public int processId, threadId;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct BasicJobLimits {
    public long processTime, jobTime;
    public uint flags;
    public UIntPtr minimumWorkingSet, maximumWorkingSet;
    public uint activeProcesses;
    public UIntPtr affinity;
    public uint priorityClass, schedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct JobLimits {
    public BasicJobLimits basic;
    public ulong readOperations, writeOperations, otherOperations, readBytes, writeBytes, otherBytes;
    public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
  }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetInformationJobObject(IntPtr job, int infoClass,
    ref JobLimits info, uint length);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool TerminateProcess(IntPtr process, uint exitCode);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles,
    bool waitAll, uint milliseconds);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateDesktopW(string name, IntPtr device, IntPtr mode,
    int flags, uint access, IntPtr attributes);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CreateProcessW(string application, StringBuilder command,
    IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags,
    IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]
  public static extern IntPtr GetThreadDesktop(uint threadId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool GetUserObjectInformationW(IntPtr handle, int index,
    StringBuilder info, int length, out int required);

  public static string CurrentName() {
    var name = new StringBuilder(256);
    int required;
    if (!GetUserObjectInformationW(GetThreadDesktop(GetCurrentThreadId()), 2,
        name, name.Capacity * 2, out required)) throw new Win32Exception();
    return name.ToString();
  }

  public static IntPtr CreateOwnedJob() {
    var job = CreateJobObjectW(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw new Win32Exception();
    var limits = new JobLimits();
    limits.basic.flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) {
      var error = new Win32Exception();
      CloseHandle(job);
      throw error;
    }
    return job;
  }
}
'@

if ($JobFile) {
  $job = Get-Content -LiteralPath $JobFile -Raw | ConvertFrom-Json
  $actualDesktop = [SpaceTestDesktop]::CurrentName()
  if ($actualDesktop -ne $job.desktop) { throw "Test desktop mismatch: $actualDesktop" }
  Set-Location -LiteralPath $job.cwd
  "Isolated test desktop: $actualDesktop" | Set-Content -LiteralPath $job.log
  # Windows PowerShell 5 treats native stderr as ErrorRecords. Preserve the
  # native exit code without turning harmless Chromium warnings into failures.
  $ErrorActionPreference = 'Continue'
  & $job.node $job.script @($job.arguments) *>> $job.log
  exit $LASTEXITCODE
}

if (-not $NodeScript -or -not $LogPath) { throw 'NodeScript and LogPath are required.' }
$desktopName = 'KodaXSpaceE2E_' + [Guid]::NewGuid().ToString('N')
$desktopHandle = [SpaceTestDesktop]::CreateDesktopW($desktopName, [IntPtr]::Zero,
  [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero)
if ($desktopHandle -eq [IntPtr]::Zero) { throw [ComponentModel.Win32Exception]::new() }
$jobPath = Join-Path ([IO.Path]::GetTempPath()) ($desktopName + '.json')
$processInfo = [SpaceTestDesktop+ProcessInfo]::new()
$ownedJob = [IntPtr]::Zero
$ownerHandle = [IntPtr]::Zero
try {
  $ownedJob = [SpaceTestDesktop]::CreateOwnedJob()
  if ($OwnerPid -gt 0) {
    $ownerHandle = [SpaceTestDesktop]::OpenProcess(0x100000, $false, $OwnerPid)
    if ($ownerHandle -eq [IntPtr]::Zero) { throw [ComponentModel.Win32Exception]::new() }
  }
  $job = @{
    desktop = $desktopName
    cwd = (Get-Location).Path
    node = (Get-Command node.exe).Source
    script = (Resolve-Path -LiteralPath $NodeScript).Path
    arguments = $ScriptArguments
    log = [IO.Path]::GetFullPath($LogPath)
  }
  $job | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $jobPath
  $shellPath = (Get-Process -Id $PID).Path
  $startup = [SpaceTestDesktop+StartupInfo]::new()
  $startup.cb = [Runtime.InteropServices.Marshal]::SizeOf($startup)
  $startup.desktop = 'WinSta0\' + $desktopName
  $commandLine = [Text.StringBuilder]::new('"' + $shellPath + '" -NoProfile -File "' +
    $PSCommandPath + '" -JobFile "' + $jobPath + '"')
  if (-not [SpaceTestDesktop]::CreateProcessW($shellPath, $commandLine, [IntPtr]::Zero,
      [IntPtr]::Zero, $false, 0x08000004, [IntPtr]::Zero, $job.cwd,
      [ref]$startup, [ref]$processInfo)) { throw [ComponentModel.Win32Exception]::new() }
  # Attach before execution so even detached SDK children belong to this test.
  if (-not [SpaceTestDesktop]::AssignProcessToJobObject($ownedJob, $processInfo.process)) {
    $assignmentError = [ComponentModel.Win32Exception]::new()
    [void][SpaceTestDesktop]::TerminateProcess($processInfo.process, 1)
    throw $assignmentError
  }
  if ([SpaceTestDesktop]::ResumeThread($processInfo.thread) -eq [uint32]::MaxValue) {
    throw [ComponentModel.Win32Exception]::new()
  }
  Write-Output "Tests run on $desktopName; progress: $($job.log)"
  $waitResult = if ($ownerHandle -eq [IntPtr]::Zero) {
    [SpaceTestDesktop]::WaitForSingleObject($processInfo.process, [uint32]::MaxValue)
  } else {
    [SpaceTestDesktop]::WaitForMultipleObjects(2,
      [IntPtr[]]@($processInfo.process, $ownerHandle), $false, [uint32]::MaxValue)
  }
  if ($waitResult -eq 1) { exit 130 }
  if ($waitResult -ne 0) { throw [ComponentModel.Win32Exception]::new() }
  $resultCode = [uint32]0
  if (-not [SpaceTestDesktop]::GetExitCodeProcess($processInfo.process, [ref]$resultCode)) {
    throw [ComponentModel.Win32Exception]::new()
  }
} finally {
  if ($ownedJob -ne [IntPtr]::Zero) { [void][SpaceTestDesktop]::CloseHandle($ownedJob) }
  if ($ownerHandle -ne [IntPtr]::Zero) { [void][SpaceTestDesktop]::CloseHandle($ownerHandle) }
  if ($processInfo.thread -ne [IntPtr]::Zero) { [void][SpaceTestDesktop]::CloseHandle($processInfo.thread) }
  if ($processInfo.process -ne [IntPtr]::Zero) { [void][SpaceTestDesktop]::CloseHandle($processInfo.process) }
  [void][SpaceTestDesktop]::CloseDesktop($desktopHandle)
  if (Test-Path -LiteralPath $jobPath) { Remove-Item -LiteralPath $jobPath }
}
exit $resultCode
