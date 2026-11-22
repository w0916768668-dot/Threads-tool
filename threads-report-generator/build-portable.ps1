$ErrorActionPreference = "Stop"

$project = $PSScriptRoot
$release = Join-Path $project "release"
$runtimeRoot = Split-Path (Split-Path (Get-Command node -ErrorAction Stop).Source -Parent) -Parent
$nodeExe = Join-Path $runtimeRoot "bin\node.exe"
$playwright = Join-Path $runtimeRoot "node_modules\playwright"
$playwrightCore = Join-Path $runtimeRoot "node_modules\playwright-core"

foreach ($required in @($nodeExe, $playwright, $playwrightCore)) {
    if (-not (Test-Path $required)) { throw "找不到可攜執行所需檔案：$required" }
}

$modulesDir = Join-Path $release "node_modules"
$releaseFull = [IO.Path]::GetFullPath($release)
$modulesFull = [IO.Path]::GetFullPath($modulesDir)
if (-not $modulesFull.StartsWith($releaseFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "拒絕清理發佈資料夾以外的路徑：$modulesFull" }
if (Test-Path $modulesDir) { Remove-Item -LiteralPath $modulesDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $release, $modulesDir | Out-Null
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $release "node.exe") -Force
Copy-Item -LiteralPath (Join-Path $project "server.js") -Destination $release -Force
Copy-Item -LiteralPath (Join-Path $project "public") -Destination $release -Recurse -Force
Copy-Item -LiteralPath $playwright -Destination (Join-Path $release "node_modules\playwright") -Recurse -Force
Copy-Item -LiteralPath $playwrightCore -Destination (Join-Path $release "node_modules\playwright-core") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $project ".env.example") -Destination $release -Force

$launcherSource = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

static class ThreadsLauncher
{
    static Process server;
    static string url;
    static string root;

    [STAThread]
    static void Main()
    {
        root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "node.exe");
        if (!File.Exists(node) || !File.Exists(Path.Combine(root, "server.js")))
        {
            MessageBox.Show("程式檔案不完整。請解壓縮後，在完整資料夾中執行 Threads報告工具.exe。", "Threads 帳號報告工具");
            return;
        }

        int port;
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        url = "http://127.0.0.1:" + port;

        var start = new ProcessStartInfo
        {
            FileName = node,
            Arguments = "\"" + Path.Combine(root, "server.js") + "\"",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.EnvironmentVariables["PORT"] = port.ToString();
        server = Process.Start(start);
        string log = Path.Combine(root, "threads-report.log");
        server.OutputDataReceived += (s, e) => { if (e.Data != null) try { File.AppendAllText(log, e.Data + Environment.NewLine); } catch { } };
        server.ErrorDataReceived += (s, e) => { if (e.Data != null) try { File.AppendAllText(log, e.Data + Environment.NewLine); } catch { } };
        server.BeginOutputReadLine();
        server.BeginErrorReadLine();

        bool ready = false;
        for (int i = 0; i < 80 && !server.HasExited; i++)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 500;
                using (request.GetResponse()) { ready = true; break; }
            }
            catch { Thread.Sleep(250); }
        }
        if (!ready)
        {
            StopServer();
            MessageBox.Show("本機報告服務無法啟動。請查看 threads-report.log。", "Threads 帳號報告工具");
            return;
        }

        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var form = new Form { Text = "Threads 帳號報告工具", Width = 430, Height = 190, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, StartPosition = FormStartPosition.CenterScreen };
        var label = new Label { Left = 20, Top = 20, Width = 375, Height = 42, Text = "報告服務已啟動。可在瀏覽器輸入帳號並產生分析報告。" };
        var link = new LinkLabel { Left = 20, Top = 68, Width = 375, Height = 24, Text = url };
        link.LinkClicked += (s, e) => { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { } };
        var open = new Button { Left = 20, Top = 105, Width = 150, Height = 30, Text = "開啟報告頁" };
        open.Click += (s, e) => { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { } };
        var close = new Button { Left = 245, Top = 105, Width = 150, Height = 30, Text = "結束工具" };
        close.Click += (s, e) => form.Close();
        form.Controls.Add(label); form.Controls.Add(link); form.Controls.Add(open); form.Controls.Add(close);
        form.FormClosing += (s, e) => StopServer();
        Application.Run(form);
    }

    static void StopServer()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(url + "/api/shutdown");
            request.Method = "POST";
            request.ContentLength = 0;
            request.Timeout = 1200;
            using (request.GetResponse()) { }
        }
        catch { }
        try { if (server != null && !server.HasExited && !server.WaitForExit(2500)) server.Kill(); } catch { }
    }
}
'@

$launcherPath = Join-Path $release "Threads報告工具.exe"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition $launcherSource -OutputAssembly $launcherPath -OutputType WindowsApplication -ReferencedAssemblies @("System.dll", "System.Core.dll", "System.Windows.Forms.dll", "System.Drawing.dll")

$readme = @(
    "Threads 帳號報告工具（免安裝版）",
    "",
    "使用方式：解壓縮完整資料夾後，雙擊 Threads報告工具.exe。",
    "工具會在瀏覽器開啟本機報告頁；關閉啟動視窗中的「結束工具」即可停止服務。",
    "第一次選擇「登入瀏覽器讀取」時，請在另開的 Microsoft Edge 手動登入 Threads，再回報告頁分析。",
    "登入資料保存在此資料夾的 .local\threads-browser-profile。",
    "",
    "請勿只移動 exe；node.exe、node_modules、server.js 與 public 都是執行所需檔案。",
    "若啟動失敗，請查看 threads-report.log。"
) -join [Environment]::NewLine
Set-Content -LiteralPath (Join-Path $release "使用說明.txt") -Value $readme -Encoding UTF8
Compress-Archive -Path $release -DestinationPath (Join-Path $project "Threads報告工具_免安裝版.zip") -Force
Write-Host "免安裝版已建立：$release"






