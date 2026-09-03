/**
 * @name Go Live De Queijo
 * @author Pão de Queijo
 * @authorId 416992570846085121
 * @description Plugin BetterDiscord para dar bypass na granja
 * @version 1.7.4
 * @source https://github.com/paodequeijo616/GoLiveBypass_BetterDiscord
 * @updateUrl https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/GoLiveDeQueijo.plugin.js
 * @downloadUrl https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/GoLiveDeQueijo.plugin.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = (() => {
    if (typeof process?.getBuiltinModule === "function") {
        return process.getBuiltinModule("child_process");
    }

    // Fallback for older Electron/Node builds. Using node: avoids
    // BetterDiscord treating "child_process" as a relative file path.
    return require("node:child_process");
})();

const VIDEO_GUARD = "2026-08-video-guard";
const PLUGIN_NAME = "Go Live De Queijo";
const PLUGIN_VERSION = "1.7.4";
const PLUGIN_AUTHOR_ID = "416992570846085121";
const GITHUB_REPO = "paodequeijo616/GoLiveBypass_BetterDiscord";
const UPDATE_FILE_NAME = "GoLiveDeQueijo.plugin.js";
const UPDATE_BRANCH = "main";
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const HOOK_BEGIN = "/* GoLiveBypassBD:NATIVE-HOOK:BEGIN */";
const HOOK_END = "/* GoLiveBypassBD:NATIVE-HOOK:END */";
const WG_MANAGER_PS1_SOURCE = "$ErrorActionPreference = \"Stop\"\n\n$Base = Join-Path $env:LOCALAPPDATA \"GoLiveBypassBD\"\n$Config = Join-Path $Base \"GLQVPN.conf\"\n$TargetsFile = Join-Path $Base \"route-targets.json\"\n$StatusFile = Join-Path $Base \"wg-route-status.json\"\n$LogFile = Join-Path $Base \"wireguard.log\"\n$TunnelName = \"GLQVPN\"\n$WireGuardExe = Join-Path $env:ProgramFiles \"WireGuard\\wireguard.exe\"\n\nfunction Log([string]$Message) {\n    try {\n        Add-Content -LiteralPath $LogFile -Value (\"{0:o} {1}\" -f (Get-Date), $Message) -Encoding UTF8\n    } catch {}\n}\n\nfunction Write-Status([hashtable]$Extra = @{}) {\n    try {\n        $body = [ordered]@{\n            version = \"1.7.1\"\n            updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n            managerRunning = $true\n            tunnelName = $TunnelName\n            wireGuardInstalled = (Test-Path -LiteralPath $WireGuardExe)\n            tunnelService = $script:TunnelService\n            tunnelUp = $script:TunnelUp\n            interfaceIndex = $script:IfIndex\n            interfaceAlias = $script:IfAlias\n            routeCount = $script:ManagedRoutes.Count\n            readyTargets = @($script:ReadyTargets)\n            routes = @($script:ManagedRoutes.Keys)\n            lastError = $script:LastError\n            lastSyncAt = $script:LastSyncAt\n        }\n\n        foreach ($key in $Extra.Keys) {\n            $body[$key] = $Extra[$key]\n        }\n\n        $tmp = \"$StatusFile.tmp\"\n        $body | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding UTF8\n        Move-Item -Force -LiteralPath $tmp -Destination $StatusFile\n    } catch {}\n}\n\nfunction Is-IP([string]$Value) {\n    $ip = $null\n    return [System.Net.IPAddress]::TryParse($Value, [ref]$ip)\n}\n\nfunction Resolve-Target([string]$Target) {\n    $result = New-Object System.Collections.Generic.List[string]\n\n    if ([string]::IsNullOrWhiteSpace($Target)) {\n        return $result\n    }\n\n    if (Is-IP $Target) {\n        $result.Add($Target)\n        return $result\n    }\n\n    try {\n        foreach ($recordType in @(\"A\", \"AAAA\")) {\n            try {\n                $rows = Resolve-DnsName -Name $Target -Type $recordType -ErrorAction Stop\n\n                foreach ($row in $rows) {\n                    if (\n                        $row.IPAddress -and\n                        -not $result.Contains([string]$row.IPAddress)\n                    ) {\n                        $result.Add([string]$row.IPAddress)\n                    }\n                }\n            } catch {}\n        }\n\n        if ($result.Count -eq 0) {\n            foreach ($ip in [System.Net.Dns]::GetHostAddresses($Target)) {\n                $s = [string]$ip.IPAddressToString\n\n                if ($s -and -not $result.Contains($s)) {\n                    $result.Add($s)\n                }\n            }\n        }\n    } catch {}\n\n    return $result\n}\n\nfunction Parse-WireGuardEndpointHost {\n    try {\n        $line = Get-Content -LiteralPath $Config | Where-Object {\n            $_ -match '^\\s*Endpoint\\s*='\n        } | Select-Object -First 1\n\n        if (-not $line) { return $null }\n\n        $value = (($line -split '=', 2)[1]).Trim()\n\n        if ($value.StartsWith(\"[\")) {\n            $end = $value.IndexOf(\"]\")\n            if ($end -gt 1) {\n                return $value.Substring(1, $end - 1)\n            }\n        }\n\n        $colon = $value.LastIndexOf(\":\")\n        if ($colon -gt 0) {\n            return $value.Substring(0, $colon)\n        }\n\n        return $value\n    } catch {\n        return $null\n    }\n}\n\nfunction Ensure-Tunnel {\n    if (-not (Test-Path -LiteralPath $WireGuardExe)) {\n        throw \"wireguard.exe não encontrado\"\n    }\n\n    if (-not (Test-Path -LiteralPath $Config)) {\n        throw \"GLQVPN.conf não encontrado\"\n    }\n\n    $serviceName = \"WireGuardTunnel`$$TunnelName\"\n    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue\n\n    if (-not $svc) {\n        Log \"instalando tunnel service $TunnelName\"\n        & $WireGuardExe /installtunnelservice $Config | Out-Null\n        Start-Sleep -Milliseconds 800\n        $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue\n    }\n\n    if ($svc -and $svc.Status -ne \"Running\") {\n        try {\n            Start-Service -Name $serviceName -ErrorAction Stop\n            Start-Sleep -Milliseconds 500\n        } catch {}\n    }\n\n    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue\n    $script:TunnelService = if ($svc) { [string]$svc.Status } else { \"missing\" }\n}\n\nfunction Refresh-Adapter {\n    $adapter = $null\n\n    for ($i = 0; $i -lt 40; $i++) {\n        $adapter = Get-NetAdapter -Name $TunnelName -ErrorAction SilentlyContinue\n\n        if ($adapter) { break }\n        Start-Sleep -Milliseconds 250\n    }\n\n    if (-not $adapter) {\n        $script:TunnelUp = $false\n        $script:IfIndex = $null\n        $script:IfAlias = $null\n        return $false\n    }\n\n    $script:TunnelUp = ($adapter.Status -eq \"Up\")\n    $script:IfIndex = [int]$adapter.ifIndex\n    $script:IfAlias = [string]$adapter.InterfaceAlias\n    return $true\n}\n\nfunction Route-Prefix([string]$Ip) {\n    if ($Ip.Contains(\":\")) { return \"$Ip/128\" }\n    return \"$Ip/32\"\n}\n\nfunction Route-NextHop([string]$Ip) {\n    if ($Ip.Contains(\":\")) { return \"::\" }\n    return \"0.0.0.0\"\n}\n\nfunction Add-DiscordRoute([string]$Ip) {\n    if (-not $script:IfIndex) { return $false }\n\n    $prefix = Route-Prefix $Ip\n    $nextHop = Route-NextHop $Ip\n\n    try {\n        $existing = Get-NetRoute `\n            -InterfaceIndex $script:IfIndex `\n            -DestinationPrefix $prefix `\n            -ErrorAction SilentlyContinue\n\n        if (-not $existing) {\n            New-NetRoute `\n                -DestinationPrefix $prefix `\n                -InterfaceIndex $script:IfIndex `\n                -NextHop $nextHop `\n                -RouteMetric 1 `\n                -PolicyStore ActiveStore `\n                -ErrorAction Stop | Out-Null\n\n            Log \"rota adicionada $prefix -> ifIndex=$($script:IfIndex)\"\n        }\n\n        $script:ManagedRoutes[$prefix] = $Ip\n        return $true\n    } catch {\n        Log \"falha rota $prefix : $($_.Exception.Message)\"\n        return $false\n    }\n}\n\nfunction Remove-DiscordRoute([string]$Prefix) {\n    try {\n        Get-NetRoute `\n            -InterfaceIndex $script:IfIndex `\n            -DestinationPrefix $Prefix `\n            -ErrorAction SilentlyContinue |\n            Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue\n\n        [void]$script:ManagedRoutes.Remove($Prefix)\n        Log \"rota removida $Prefix\"\n    } catch {}\n}\n\nfunction Read-Targets {\n    $targets = New-Object System.Collections.Generic.List[string]\n\n    foreach ($host in @(\n        \"gateway.discord.gg\",\n        \"remote-auth-gateway.discord.gg\"\n    )) {\n        if (-not $targets.Contains($host)) {\n            $targets.Add($host)\n        }\n    }\n\n    try {\n        if (Test-Path -LiteralPath $TargetsFile) {\n            $json = Get-Content -LiteralPath $TargetsFile -Raw | ConvertFrom-Json\n\n            foreach ($item in @($json.targets)) {\n                $target = [string]$item.target\n\n                if ($target -and -not $targets.Contains($target)) {\n                    $targets.Add($target)\n                }\n            }\n        }\n    } catch {}\n\n    return $targets\n}\n\n$script:ManagedRoutes = @{}\n$script:ReadyTargets = New-Object System.Collections.Generic.List[string]\n$script:TunnelService = \"unknown\"\n$script:TunnelUp = $false\n$script:IfIndex = $null\n$script:IfAlias = $null\n$script:LastError = $null\n$script:LastSyncAt = $null\n\nLog \"wireguard manager v1.7.4 iniciado\"\n\ntry {\n    Ensure-Tunnel\n} catch {\n    $script:LastError = $_.Exception.Message\n    Log \"Ensure-Tunnel: $($script:LastError)\"\n    Write-Status\n}\n\n$endpointHost = Parse-WireGuardEndpointHost\n$endpointIps = New-Object System.Collections.Generic.HashSet[string]\n\nif ($endpointHost) {\n    foreach ($ip in Resolve-Target $endpointHost) {\n        [void]$endpointIps.Add($ip)\n    }\n}\n\nwhile ($true) {\n    try {\n        Ensure-Tunnel\n        [void](Refresh-Adapter)\n\n        if (-not $script:TunnelUp -or -not $script:IfIndex) {\n            $script:LastError = \"adaptador WireGuard ainda não está UP\"\n            Write-Status\n            Start-Sleep -Milliseconds 500\n            continue\n        }\n\n        $targets = Read-Targets\n        $desiredPrefixes = New-Object System.Collections.Generic.HashSet[string]\n        $ready = New-Object System.Collections.Generic.List[string]\n\n        foreach ($target in $targets) {\n            $ips = Resolve-Target $target\n            $allOk = ($ips.Count -gt 0)\n\n            foreach ($ip in $ips) {\n                # Never route the Proton/WireGuard server endpoint into its own tunnel.\n                if ($endpointIps.Contains($ip)) {\n                    continue\n                }\n\n                $prefix = Route-Prefix $ip\n                [void]$desiredPrefixes.Add($prefix)\n\n                if (-not (Add-DiscordRoute $ip)) {\n                    $allOk = $false\n                }\n            }\n\n            if ($allOk -and -not $ready.Contains($target)) {\n                $ready.Add($target)\n            }\n        }\n\n        foreach ($prefix in @($script:ManagedRoutes.Keys)) {\n            if (-not $desiredPrefixes.Contains($prefix)) {\n                Remove-DiscordRoute $prefix\n            }\n        }\n\n        $script:ReadyTargets = $ready\n        $script:LastError = $null\n        $script:LastSyncAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n        Write-Status\n    } catch {\n        $script:LastError = $_.Exception.Message\n        Log \"loop: $($script:LastError)\"\n        Write-Status\n    }\n\n    Start-Sleep -Milliseconds 200\n}\n";
const WG_BOOTSTRAP_PS1_SOURCE = "$ErrorActionPreference = \"Stop\"\n\n$Base = Join-Path $env:LOCALAPPDATA \"GoLiveBypassBD\"\n$Config = Join-Path $Base \"GLQVPN.conf\"\n$Manager = Join-Path $Base \"wg-manager.ps1\"\n$Status = Join-Path $Base \"wg-route-status.json\"\n$Log = Join-Path $Base \"wireguard.log\"\n$TunnelName = \"GLQVPN\"\n$TaskName = \"GoLiveDeQueijo-WireGuard\"\n\nNew-Item -ItemType Directory -Force -Path $Base | Out-Null\n\nfunction Log([string]$Message) {\n    try {\n        Add-Content -LiteralPath $Log -Value (\"{0:o} [bootstrap] {1}\" -f (Get-Date), $Message) -Encoding UTF8\n    } catch {}\n}\n\nfunction WireGuard-Path {\n    return (Join-Path $env:ProgramFiles \"WireGuard\\wireguard.exe\")\n}\n\nfunction Install-WireGuardIfNeeded {\n    $exe = WireGuard-Path\n\n    if (Test-Path -LiteralPath $exe) {\n        Log \"WireGuard já instalado\"\n        return\n    }\n\n    $arch = $env:PROCESSOR_ARCHITECTURE.ToUpperInvariant()\n\n    if ($arch -eq \"ARM64\") {\n        $file = \"wireguard-arm64-1.1.msi\"\n    } elseif ($arch -eq \"X86\") {\n        $file = \"wireguard-x86-1.1.msi\"\n    } else {\n        $file = \"wireguard-amd64-1.1.msi\"\n    }\n\n    $url = \"https://download.wireguard.com/windows-client/$file\"\n    $msi = Join-Path $Base $file\n\n    Log \"baixando WireGuard oficial: $url\"\n    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $msi\n\n    $sig = Get-AuthenticodeSignature -LiteralPath $msi\n\n    if ($sig.Status -ne \"Valid\") {\n        throw \"assinatura Authenticode do WireGuard inválida: $($sig.Status)\"\n    }\n\n    $subject = [string]$sig.SignerCertificate.Subject\n\n    if (\n        $subject -notmatch \"WireGuard\" -and\n        $subject -notmatch \"Donenfeld\"\n    ) {\n        throw \"assinante inesperado no MSI do WireGuard: $subject\"\n    }\n\n    Log \"assinatura válida: $subject\"\n\n    $proc = Start-Process `\n        -FilePath \"msiexec.exe\" `\n        -ArgumentList @(\n            \"/i\",\n            \"`\"$msi`\"\",\n            \"/qn\",\n            \"/norestart\"\n        ) `\n        -Wait `\n        -PassThru\n\n    if ($proc.ExitCode -notin @(0, 3010, 1641)) {\n        throw \"msiexec retornou código $($proc.ExitCode)\"\n    }\n\n    Start-Sleep -Milliseconds 800\n\n    if (-not (Test-Path -LiteralPath (WireGuard-Path))) {\n        throw \"wireguard.exe não apareceu após a instalação\"\n    }\n\n    Log \"WireGuard instalado com sucesso\"\n}\n\nfunction Protect-Config {\n    if (-not (Test-Path -LiteralPath $Config)) {\n        throw \"config gerenciada não existe: $Config\"\n    }\n\n    try {\n        & icacls.exe $Config /inheritance:r | Out-Null\n        & icacls.exe $Config /grant:r \"${env:USERNAME}:(R,W)\" \"SYSTEM:(F)\" \"Administrators:(F)\" | Out-Null\n    } catch {\n        Log \"aviso ACL: $($_.Exception.Message)\"\n    }\n}\n\nfunction Reinstall-Tunnel {\n    $exe = WireGuard-Path\n\n    try {\n        & $exe /uninstalltunnelservice $TunnelName | Out-Null\n        Start-Sleep -Milliseconds 500\n    } catch {}\n\n    Log \"instalando tunnel service $TunnelName\"\n    & $exe /installtunnelservice $Config | Out-Null\n    Start-Sleep -Milliseconds 1000\n}\n\nfunction Register-ManagerTask {\n    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name\n\n    $action = New-ScheduledTaskAction `\n        -Execute \"powershell.exe\" `\n        -Argument \"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `\"$Manager`\"\"\n\n    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity\n\n    $principal = New-ScheduledTaskPrincipal `\n        -UserId $identity `\n        -LogonType Interactive `\n        -RunLevel Highest\n\n    $settings = New-ScheduledTaskSettingsSet `\n        -AllowStartIfOnBatteries `\n        -DontStopIfGoingOnBatteries `\n        -ExecutionTimeLimit ([TimeSpan]::Zero) `\n        -MultipleInstances IgnoreNew\n\n    Register-ScheduledTask `\n        -TaskName $TaskName `\n        -Action $action `\n        -Trigger $trigger `\n        -Principal $principal `\n        -Settings $settings `\n        -Force | Out-Null\n\n    Start-ScheduledTask -TaskName $TaskName\n    Log \"scheduled task $TaskName registrada/iniciada\"\n}\n\ntry {\n    Install-WireGuardIfNeeded\n    Protect-Config\n    Reinstall-Tunnel\n    Register-ManagerTask\n\n    @{\n        version = \"1.7.1\"\n        updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n        bootstrapOk = $true\n        wireGuardInstalled = $true\n        taskName = $TaskName\n        tunnelName = $TunnelName\n        lastError = $null\n    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Status -Encoding UTF8\n\n    Log \"bootstrap concluído\"\n    exit 0\n} catch {\n    $message = $_.Exception.Message\n    Log \"ERRO: $message\"\n\n    @{\n        version = \"1.7.1\"\n        updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n        bootstrapOk = $false\n        wireGuardInstalled = (Test-Path -LiteralPath (WireGuard-Path))\n        taskName = $TaskName\n        tunnelName = $TunnelName\n        lastError = $message\n    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $Status -Encoding UTF8\n\n    exit 1\n}\n";
const NATIVE_HOOK_SOURCE = "/*\n * GoLiveBypassBD Native Main Hook\n * Loaded in Discord's main process before BetterDiscord.\n * SPDX-License-Identifier: GPL-3.0-or-later\n *\n * Purpose:\n * - create a localhost SOCKS router\n * - find/test a non-excluded SOCKS5 exit\n * - apply an Electron PAC directly with session.defaultSession.setProxy()\n * - route ONLY Discord gateway hosts through the local router\n * - leave voice/video/CDN/direct traffic alone\n */\n\n\"use strict\";\n\nconst {app, session} = require(\"electron\");\nconst net = require(\"net\");\nconst tls = require(\"tls\");\nconst https = require(\"https\");\nconst fs = require(\"fs\");\nconst path = require(\"path\");\n\nconst BASE = process.env.LOCALAPPDATA\n    ? path.join(process.env.LOCALAPPDATA, \"GoLiveBypassBD\")\n    : path.join(__dirname, \"GoLiveBypassBD\");\n\nconst SETTINGS = path.join(BASE, \"settings.json\");\nconst STATUS = path.join(BASE, \"native-status.json\");\nconst LOG = path.join(BASE, \"native.log\");\nconst PROXY_CACHE = path.join(BASE, \"proxy-cache.json\");\nconst VOICE_PRELOAD = path.join(BASE, \"voice-preload.js\");\nconst VOICE_STATUS = path.join(BASE, \"voice-status.json\");\nconst ROUTE_TARGETS = path.join(BASE, \"route-targets.json\");\nconst WG_STATUS = path.join(BASE, \"wg-route-status.json\");\n\nconst PROXY_SOURCES = [\n    {\n        type: \"proxyscrape\",\n        url: \"https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=socks5&proxy_format=protocolipport&format=json&timeout=1500\"\n    },\n    {\n        type: \"plain\",\n        url: \"https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt\"\n    },\n    {\n        type: \"plain\",\n        url: \"https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt\"\n    }\n];\n\nconst PROBE_TIMEOUT = 5500;\nconst SOURCE_TIMEOUT = 6000;\nconst SELECTION_BUDGET = 18000;\nconst HOLD_GATEWAY_MS = 12000;\nconst POOL_SIZE = 4;\nconst MAX_CANDIDATES = 180;\nconst HEARTBEAT_MS = 20000;\n\nlet router = null;\nlet routerPort = 0;\nlet pool = [];\nlet selecting = null;\nlet current = null;\nlet shuttingDown = false;\nlet lastGatewayViaProxy = false;\nlet lastRecoveryReconnectAt = 0;\nlet selectionAttempt = 0;\nlet manualHeartbeatFailures = 0;\nlet streamHeartbeatFailures = 0;\nlet gatewayRouteSeq = 0;\nlet mediaRouteSeq = 0;\nconst activeGatewayPairs = new Set();\nlet heartbeatTimer = null;\nlet repairTimer = null;\nlet startupRepairTimer = null;\nconst activeSockets = new Set();\nconst NATIVE_SINGLETON_KEY = \"__GO_LIVE_DE_QUEIJO_NATIVE_STARTED__\";\nconst VOICE_PRELOAD_SOURCE = \"\\\"use strict\\\";\\n\\n(() => {\\n    if (globalThis.__GLQ_VOICE_174__) return;\\n    globalThis.__GLQ_VOICE_174__ = true;\\n\\n    const fs = require(\\\"fs\\\");\\n    const path = require(\\\"path\\\");\\n    const {webFrame} = require(\\\"electron\\\");\\n\\n    const BASE = process.env.LOCALAPPDATA\\n        ? path.join(process.env.LOCALAPPDATA, \\\"GoLiveBypassBD\\\")\\n        : path.join(process.cwd(), \\\"GoLiveBypassBD\\\");\\n\\n    const LOG = path.join(BASE, \\\"native.log\\\");\\n    const STATUS = path.join(BASE, \\\"voice-status.json\\\");\\n    const COMMAND = path.join(BASE, \\\"voice-command.json\\\");\\n    const SETTINGS = path.join(BASE, \\\"settings.json\\\");\\n    const ROUTE_TARGETS = path.join(BASE, \\\"route-targets.json\\\");\\n    const WG_STATUS = path.join(BASE, \\\"wg-route-status.json\\\");\\n\\n    const STREAM_WARMUP_MS = 20_000;\\n    const INPUT_ALIVE_MS = 15_000;\\n    const OUTPUT_STALL_MS = 20_000;\\n    const DEMAND_FRESH_MS = 45_000;\\n    const RECOVERY_COOLDOWN_MS = 30_000;\\n    const RECOVERY_WINDOW_MS = 30 * 60_000;\\n    const RECOVERY_MAX = 2;\\n    const VIEWER_TIMEOUT_MS = 6500;\\n    const VIEWER_RECOVERY_COOLDOWN_MS = 30000;\\n    const VIEWER_RECOVERY_WINDOW_MS = 30 * 60_000;\\n    const VIEWER_RECOVERY_MAX = 2;\\n\\n    const state = {\\n        instanceId: Date.now(),\\n        installed: false,\\n        moduleSeen: false,\\n        hookError: null,\\n        nextId: 1,\\n        pendingKind: null,\\n        connections: [],\\n        seen: new WeakMap(),\\n        modules: new WeakSet(),\\n        demandKnown: false,\\n        demandActive: false,\\n        demandAt: 0,\\n        demandChangedAt: 0,\\n        commandNonce: null,\\n        recoveryAttempts: [],\\n        lastRecoveryAt: 0,\\n        lastRecoveryResult: null,\\n        lastRecoveryStreamId: null,\\n        viewerRecoveryAttempts: [],\\n        lastViewerRecoveryAt: 0,\\n        lastViewerRecoveryResult: null,\\n        lastViewerRecoveryId: null,\\n        lastRemoteFailure: null\\n    };\\n\\n    function mkdir() {\\n        try { fs.mkdirSync(BASE, {recursive: true}); } catch {}\\n    }\\n\\n    function log(message) {\\n        mkdir();\\n        try {\\n            fs.appendFileSync(\\n                LOG,\\n                `${new Date().toISOString()} [voice] ${message}\\\\n`,\\n                \\\"utf8\\\"\\n            );\\n        } catch {}\\n    }\\n\\n    function readJson(file, fallback = null) {\\n        try { return JSON.parse(fs.readFileSync(file, \\\"utf8\\\")); }\\n        catch { return fallback; }\\n    }\\n\\n    function finite(value) {\\n        return typeof value === \\\"number\\\" && Number.isFinite(value) ? value : null;\\n    }\\n\\n    function safeKey(key) {\\n        key = String(key);\\n        if (/^[0-9]{10,}$/.test(key)) return \\\"<numeric>\\\";\\n        if (/^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/.test(key)) return key;\\n        return \\\"<dynamic>\\\";\\n    }\\n\\n    function shape(value, depth = 0, seen = new WeakSet()) {\\n        if (value === null) return \\\"null\\\";\\n        if (value === undefined) return \\\"undefined\\\";\\n        if (depth > 3) return typeof value;\\n        if (Array.isArray(value)) return {type: \\\"array\\\", length: value.length};\\n        if (typeof value !== \\\"object\\\") return typeof value;\\n        if (seen.has(value)) return \\\"circular\\\";\\n        seen.add(value);\\n\\n        const out = {};\\n        let keys = [];\\n        try { keys = Object.keys(value).slice(0, 80); }\\n        catch { return \\\"inacessivel\\\"; }\\n\\n        for (const key of keys) {\\n            const clean = safeKey(key);\\n            try {\\n                out[clean] = shape(value[key], depth + 1, seen);\\n            } catch {\\n                out[clean] = \\\"getter-error\\\";\\n            }\\n        }\\n\\n        return out;\\n    }\\n\\n\\n    const MEDIA_SHIM_SOURCE = `\\n(() => {\\n    if (window.__GLQ_MEDIA_1610__) return;\\n    window.__GLQ_MEDIA_1610__ = true;\\n\\n    const OriginalWebSocket = window.WebSocket;\\n    const media = new Set();\\n    let lastOpenAt = 0;\\n    let lastCloseAt = 0;\\n\\n    function isMedia(url) {\\n        try {\\n            return /(^|\\\\\\\\.)discord\\\\\\\\.media$/i.test(new URL(String(url)).hostname);\\n        } catch {\\n            return false;\\n        }\\n    }\\n\\n    function WrappedWebSocket(url, protocols) {\\n        const ws = protocols === undefined\\n            ? new OriginalWebSocket(url)\\n            : new OriginalWebSocket(url, protocols);\\n\\n        try {\\n            if (isMedia(url)) {\\n                media.add(ws);\\n                ws.addEventListener(\\\"open\\\", () => { lastOpenAt = Date.now(); });\\n                ws.addEventListener(\\\"close\\\", () => {\\n                    media.delete(ws);\\n                    lastCloseAt = Date.now();\\n                });\\n            }\\n        } catch {}\\n\\n        return ws;\\n    }\\n\\n    try {\\n        Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);\\n        WrappedWebSocket.prototype = OriginalWebSocket.prototype;\\n        window.WebSocket = WrappedWebSocket;\\n    } catch {}\\n\\n    window.__glqMediaResumo = () => ({\\n        open: Array.from(media).filter(ws => ws.readyState === 1).length,\\n        lastOpenAt,\\n        lastCloseAt\\n    });\\n\\n    window.__glqMediaFechar = () => {\\n        let n = 0;\\n        media.forEach(ws => {\\n            try {\\n                if (ws.readyState === 1) {\\n                    ws.close(4000, \\\"golive-revive-voz\\\");\\n                    n++;\\n                }\\n            } catch {}\\n        });\\n        return n;\\n    };\\n})();\\n`;\\n\\n    function installMediaShim() {\\n        try {\\n            if (!webFrame || typeof webFrame.executeJavaScript !== \\\"function\\\") {\\n                log(\\\"viewer.media | webFrame indisponível\\\");\\n                return;\\n            }\\n\\n            webFrame.executeJavaScript(MEDIA_SHIM_SOURCE)\\n                .then(() => log(\\\"viewer.media | shim *.discord.media instalado\\\"))\\n                .catch(e => log(`viewer.media | shim falhou: ${e?.message || e}`));\\n        } catch (e) {\\n            log(`viewer.media | shim falhou: ${e?.message || e}`);\\n        }\\n    }\\n\\n    function viewerSettings() {\\n        return readJson(SETTINGS, {}) || {};\\n    }\\n\\n    function cleanupViewerAttempts() {\\n        const now = Date.now();\\n        state.viewerRecoveryAttempts = state.viewerRecoveryAttempts.filter(\\n            t => t >= now - VIEWER_RECOVERY_WINDOW_MS\\n        );\\n    }\\n\\n    function recoverViewer(rec, reason) {\\n        const settings = viewerSettings();\\n        if (settings.autoRecoverViewer === false) return false;\\n\\n        cleanupViewerAttempts();\\n\\n        const now = Date.now();\\n\\n        if (now - state.lastViewerRecoveryAt < VIEWER_RECOVERY_COOLDOWN_MS) {\\n            return false;\\n        }\\n\\n        if (state.viewerRecoveryAttempts.length >= VIEWER_RECOVERY_MAX) {\\n            state.lastViewerRecoveryResult = \\\"limit\\\";\\n            log(\\\"viewer.revive | teto de tentativas atingido\\\");\\n            writeStatus();\\n            return false;\\n        }\\n\\n        state.viewerRecoveryAttempts.push(now);\\n        state.lastViewerRecoveryAt = now;\\n        state.lastViewerRecoveryId = rec?.id || null;\\n        state.lastViewerRecoveryResult = \\\"requested\\\";\\n\\n        log(\\n            `viewer.revive | fechando somente *.discord.media ` +\\n            `id=${rec?.id ?? \\\"?\\\"} reason=${reason}`\\n        );\\n\\n        try {\\n            webFrame.executeJavaScript(\\n                \\\"window.__glqMediaFechar ? window.__glqMediaFechar() : -1\\\"\\n            ).then(value => {\\n                const n = Number(value);\\n                state.lastViewerRecoveryResult =\\n                    n > 0 ? `media-closed:${n}` : \\\"media-no-socket\\\";\\n\\n                log(\\n                    `viewer.revive | discord.media fechados=` +\\n                    `${Number.isFinite(n) ? n : \\\"?\\\"}`\\n                );\\n                writeStatus();\\n            }).catch(e => {\\n                state.lastViewerRecoveryResult = \\\"media-close-error\\\";\\n                log(`viewer.revive | falha: ${e?.message || e}`);\\n                writeStatus();\\n            });\\n\\n            return true;\\n        } catch (e) {\\n            state.lastViewerRecoveryResult = \\\"media-close-error\\\";\\n            log(`viewer.revive | falha: ${e?.message || e}`);\\n            writeStatus();\\n            return false;\\n        }\\n    }\\n\\n\\n    function touchWireGuardTarget(target, source = \\\"voice\\\") {\\n        target = String(target || \\\"\\\").trim();\\n\\n        if (!target) return false;\\n\\n        try {\\n            let body = {\\n                version: 1,\\n                updatedAt: null,\\n                targets: []\\n            };\\n\\n            try {\\n                const parsed = JSON.parse(\\n                    fs.readFileSync(ROUTE_TARGETS, \\\"utf8\\\")\\n                );\\n\\n                if (parsed && Array.isArray(parsed.targets)) {\\n                    body = parsed;\\n                }\\n            } catch {}\\n\\n            const now = Date.now();\\n\\n            body.targets = body.targets\\n                .filter(item => {\\n                    if (!item?.target) return false;\\n\\n                    const touched = Number(item.touchedAt || 0);\\n\\n                    return touched > 0 &&\\n                        now - touched < 15 * 60 * 1000;\\n                })\\n                .filter(\\n                    item => String(item.target) !== target\\n                );\\n\\n            body.targets.push({\\n                target,\\n                source,\\n                touchedAt: now\\n            });\\n\\n            body.updatedAt = new Date().toISOString();\\n\\n            const tmp = ROUTE_TARGETS + \\\".voice.tmp\\\";\\n\\n            fs.writeFileSync(\\n                tmp,\\n                JSON.stringify(body, null, 2),\\n                \\\"utf8\\\"\\n            );\\n\\n            try {\\n                fs.renameSync(tmp, ROUTE_TARGETS);\\n            } catch {\\n                fs.copyFileSync(tmp, ROUTE_TARGETS);\\n                try { fs.unlinkSync(tmp); } catch {}\\n            }\\n\\n            return true;\\n        } catch (e) {\\n            log(\\n                `wireguard.target.error | ${e?.message || e}`\\n            );\\n\\n            return false;\\n        }\\n    }\\n\\n    function wireGuardTargetReady(target) {\\n        try {\\n            const status = JSON.parse(\\n                fs.readFileSync(WG_STATUS, \\\"utf8\\\")\\n            );\\n\\n            return !!(\\n                status?.tunnelUp &&\\n                Array.isArray(status.readyTargets) &&\\n                status.readyTargets.includes(String(target))\\n            );\\n        } catch {\\n            return false;\\n        }\\n    }\\n\\n    function waitWireGuardTargetSync(target, timeoutMs = 1400) {\\n        const settings = readJson(SETTINGS, {});\\n\\n        if (\\n            String(settings?.networkMode || \\\"\\\").toLowerCase() !==\\n            \\\"wireguard\\\"\\n        ) {\\n            return true;\\n        }\\n\\n        const end = Date.now() + timeoutMs;\\n        let sleeper = null;\\n\\n        try {\\n            sleeper = new Int32Array(\\n                new SharedArrayBuffer(4)\\n            );\\n        } catch {}\\n\\n        while (Date.now() < end) {\\n            if (wireGuardTargetReady(target)) {\\n                return true;\\n            }\\n\\n            if (sleeper) {\\n                try {\\n                    Atomics.wait(\\n                        sleeper,\\n                        0,\\n                        0,\\n                        45\\n                    );\\n                    continue;\\n                } catch {}\\n            }\\n\\n            const until = Date.now() + 20;\\n\\n            while (Date.now() < until) {}\\n        }\\n\\n        return wireGuardTargetReady(target);\\n    }\\n\\n    function normalizeStats(raw) {\\n        let parsed = raw;\\n\\n        if (typeof parsed === \\\"string\\\") {\\n            try { parsed = JSON.parse(parsed); }\\n            catch {\\n                return {ok: false, reason: \\\"json\\\"};\\n            }\\n        }\\n\\n        if (!parsed || typeof parsed !== \\\"object\\\") {\\n            return {ok: false, reason: \\\"formato\\\"};\\n        }\\n\\n        const outbound = parsed.outbound;\\n        let video = outbound && outbound.video;\\n\\n        if ((!video || typeof video !== \\\"object\\\") &&\\n            outbound &&\\n            Array.isArray(outbound.videos)) {\\n            for (const candidate of outbound.videos) {\\n                if (!candidate || typeof candidate !== \\\"object\\\") continue;\\n\\n                if (\\n                    !video ||\\n                    (finite(candidate.framesEncoded) || 0) >\\n                    (finite(video.framesEncoded) || 0)\\n                ) {\\n                    video = candidate;\\n                }\\n            }\\n        }\\n\\n        const screenshare = parsed.screenshare;\\n        let captureFrames = null;\\n\\n        if (screenshare && typeof screenshare === \\\"object\\\") {\\n            let total = 0;\\n            let found = false;\\n\\n            for (const key of Object.keys(screenshare)) {\\n                if (\\n                    !/frames$/i.test(key) ||\\n                    /(drop|fail|encode|sent|receive)/i.test(key)\\n                ) {\\n                    continue;\\n                }\\n\\n                const value = finite(screenshare[key]);\\n                if (value === null) continue;\\n\\n                total += value;\\n                found = true;\\n            }\\n\\n            if (found) captureFrames = total;\\n        }\\n\\n        if (!video || typeof video !== \\\"object\\\") {\\n            return {\\n                ok: false,\\n                reason: \\\"sem-video\\\"\\n            };\\n        }\\n\\n        const inputFrameRate = finite(video.inputFrameRate);\\n        const framesEncoded = finite(video.framesEncoded);\\n        const encodeFrameRate = finite(video.encodeFrameRate);\\n\\n        if (\\n            (captureFrames === null && inputFrameRate === null) ||\\n            framesEncoded === null ||\\n            encodeFrameRate === null\\n        ) {\\n            return {\\n                ok: false,\\n                reason: \\\"campos\\\"\\n            };\\n        }\\n\\n        return {\\n            ok: true,\\n            captureFrames,\\n            inputFrameRate,\\n            framesEncoded,\\n            encodeFrameRate,\\n            mediaBitrate: finite(video.mediaBitrate),\\n            targetMediaBitrate: finite(video.targetMediaBitrate),\\n            width:\\n                Array.isArray(video.substreams) && video.substreams[0]\\n                    ? finite(video.substreams[0].width)\\n                    : null,\\n            height:\\n                Array.isArray(video.substreams) && video.substreams[0]\\n                    ? finite(video.substreams[0].height)\\n                    : null,\\n            suspended: video.suspended === true\\n        };\\n    }\\n\\n    function updateProgress(rec, stats) {\\n        const now = Date.now();\\n\\n        if (!rec.progress) {\\n            rec.progress = {\\n                inputValue: stats.captureFrames,\\n                outputValue: stats.framesEncoded,\\n                inputAt: now,\\n                outputAt: now\\n            };\\n        } else {\\n            if (\\n                (\\n                    stats.captureFrames !== null &&\\n                    stats.captureFrames !== rec.progress.inputValue\\n                ) ||\\n                (\\n                    stats.inputFrameRate !== null &&\\n                    stats.inputFrameRate > 0\\n                )\\n            ) {\\n                rec.progress.inputAt = now;\\n            }\\n\\n            if (\\n                stats.framesEncoded !== rec.progress.outputValue ||\\n                (\\n                    stats.encodeFrameRate !== null &&\\n                    stats.encodeFrameRate > 0\\n                )\\n            ) {\\n                rec.progress.outputAt = now;\\n            }\\n\\n            rec.progress.inputValue = stats.captureFrames;\\n            rec.progress.outputValue = stats.framesEncoded;\\n        }\\n\\n        return {\\n            statsOk: true,\\n            captureFrames: stats.captureFrames,\\n            framesEncoded: stats.framesEncoded,\\n            inputFrameRate: stats.inputFrameRate,\\n            encodeFrameRate: stats.encodeFrameRate,\\n            mediaBitrate: stats.mediaBitrate,\\n            targetMediaBitrate: stats.targetMediaBitrate,\\n            width: stats.width,\\n            height: stats.height,\\n            suspended: stats.suspended,\\n            inputAgeMs: now - rec.progress.inputAt,\\n            outputAgeMs: now - rec.progress.outputAt\\n        };\\n    }\\n\\n    function registerConnection(kind, creator, options, conn, meta = {}) {\\n        if (!conn || (typeof conn !== \\\"object\\\" && typeof conn !== \\\"function\\\")) {\\n            return conn;\\n        }\\n\\n        const existing = state.seen.get(conn);\\n\\n        if (existing) {\\n            if (\\n                (kind === \\\"stream\\\" || kind === \\\"remote-stream\\\") &&\\n                existing.kind !== kind\\n            ) {\\n                existing.kind = kind;\\n                existing.creator = creator;\\n                log(`voice.classify | id=${existing.id} -> ${kind} via=${creator}`);\\n            }\\n            return conn;\\n        }\\n\\n        const rec = {\\n            id: state.nextId++,\\n            kind,\\n            creator,\\n            createdAt: Date.now(),\\n            destroyedAt: 0,\\n            optionShape: shape(options),\\n            conn,\\n            progress: null,\\n            stats: null,\\n            statsError: null,\\n            promotedByStats: false,\\n            remoteStream: kind === \\\"remote-stream\\\",\\n            hasStreamUserId: options?.streamUserId != null,\\n            streamParametersCount:\\n                Array.isArray(options?.streamParameters)\\n                    ? options.streamParameters.length\\n                    : null,\\n            videoSupportedBefore:\\n                typeof meta.videoSupportedBefore === \\\"boolean\\\"\\n                    ? meta.videoSupportedBefore\\n                    : null,\\n            videoSupportedAfter:\\n                typeof options?.videoSupported === \\\"boolean\\\"\\n                    ? options.videoSupported\\n                    : null,\\n            firstFrameHooked: false,\\n            firstFrameAt: 0,\\n            decoderFallbackAt: 0\\n        };\\n\\n        state.seen.set(conn, rec);\\n        state.connections.push(rec);\\n\\n        if (state.connections.length > 40) {\\n            state.connections.shift();\\n        }\\n\\n        log(\\n            [\\n                \\\"voice.conn\\\",\\n                `id=${rec.id}`,\\n                `kind=${kind}`,\\n                `creator=${creator}`,\\n                `streamUser=${rec.hasStreamUserId ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                `videoSupported=${rec.videoSupportedBefore ?? \\\"?\\\"}->${rec.videoSupportedAfter ?? \\\"?\\\"}`,\\n                `streamParams=${rec.streamParametersCount ?? \\\"?\\\"}`,\\n                `shape=${JSON.stringify(rec.optionShape)}`\\n            ].join(\\\" | \\\")\\n        );\\n\\n        if (rec.remoteStream) {\\n            try {\\n                if (typeof conn.setOnFirstFrameCallback === \\\"function\\\") {\\n                    const original = conn.setOnFirstFrameCallback;\\n\\n                    conn.setOnFirstFrameCallback = function (callback) {\\n                        rec.firstFrameHooked = true;\\n\\n                        const wrapped =\\n                            typeof callback === \\\"function\\\"\\n                                ? function (...args) {\\n                                    if (!rec.firstFrameAt) {\\n                                        rec.firstFrameAt = Date.now();\\n                                        log(\\n                                            `viewer.first-frame | id=${rec.id} ` +\\n                                            `after=${rec.firstFrameAt - rec.createdAt}ms`\\n                                        );\\n                                        writeStatus();\\n                                    }\\n                                    return callback.apply(this, args);\\n                                }\\n                                : callback;\\n\\n                        return original.call(this, wrapped);\\n                    };\\n                }\\n            } catch (e) {\\n                log(`viewer.first-frame.hook.error | id=${rec.id} ${e?.message || e}`);\\n            }\\n\\n            try {\\n                if (typeof conn.setOnVideoDecoderFallbackCallback === \\\"function\\\") {\\n                    const original = conn.setOnVideoDecoderFallbackCallback;\\n\\n                    conn.setOnVideoDecoderFallbackCallback = function (callback) {\\n                        const wrapped =\\n                            typeof callback === \\\"function\\\"\\n                                ? function (...args) {\\n                                    rec.decoderFallbackAt = Date.now();\\n                                    log(`viewer.decoder-fallback | id=${rec.id}`);\\n                                    writeStatus();\\n                                    return callback.apply(this, args);\\n                                }\\n                                : callback;\\n\\n                        return original.call(this, wrapped);\\n                    };\\n                }\\n            } catch {}\\n\\n            // Healthy viewing normally produces a first frame in a few seconds.\\n            // The user's current build tears the receiver down around ~8s.\\n            setTimeout(() => {\\n                if (rec.destroyedAt || rec.firstFrameAt) return;\\n\\n                const age = Date.now() - rec.createdAt;\\n                if (age < VIEWER_TIMEOUT_MS) return;\\n\\n                log(\\n                    `viewer.stall | id=${rec.id} age=${age}ms ` +\\n                    `firstFrame=nao videoSupported=${rec.videoSupportedAfter ?? \\\"?\\\"}`\\n                );\\n\\n                recoverViewer(rec, \\\"sem-primeiro-frame\\\");\\n                writeStatus();\\n            }, VIEWER_TIMEOUT_MS);\\n        }\\n\\n        try {\\n            if (typeof conn.destroy === \\\"function\\\") {\\n                const originalDestroy = conn.destroy;\\n\\n                conn.destroy = function (...args) {\\n                    if (!rec.destroyedAt) {\\n                        rec.destroyedAt = Date.now();\\n                        const age = rec.destroyedAt - rec.createdAt;\\n\\n                        log(\\n                            `voice.conn.destroy | id=${rec.id} kind=${rec.kind} ` +\\n                            `creator=${rec.creator} age=${age}ms ` +\\n                            `firstFrame=${rec.firstFrameAt ? \\\"sim\\\" : \\\"nao\\\"}`\\n                        );\\n\\n                        if (\\n                            rec.remoteStream &&\\n                            !rec.firstFrameAt &&\\n                            age >= 1500\\n                        ) {\\n                            state.lastRemoteFailure = {\\n                                id: rec.id,\\n                                at: rec.destroyedAt,\\n                                ageMs: age,\\n                                videoSupportedBefore: rec.videoSupportedBefore,\\n                                videoSupportedAfter: rec.videoSupportedAfter\\n                            };\\n\\n                            log(\\n                                `viewer.fail | id=${rec.id} age=${age}ms ` +\\n                                `sem primeiro frame`\\n                            );\\n                        }\\n\\n                        writeStatus();\\n                    }\\n\\n                    return originalDestroy.apply(this, args);\\n                };\\n            }\\n        } catch {}\\n\\n        writeStatus();\\n        return conn;\\n    }\\n\\n    function hookVoiceModule(voice) {\\n        if (\\n            !voice ||\\n            (typeof voice !== \\\"object\\\" && typeof voice !== \\\"function\\\")\\n        ) {\\n            return voice;\\n        }\\n\\n        if (state.modules.has(voice)) return voice;\\n        state.modules.add(voice);\\n\\n        let wrappedFactories = 0;\\n\\n        for (const [name, kind] of [\\n            [\\\"createVoiceConnectionWithOptions\\\", \\\"voice\\\"],\\n            [\\\"createOwnStreamConnectionWithOptions\\\", \\\"stream\\\"]\\n        ]) {\\n            let original;\\n\\n            try { original = voice[name]; }\\n            catch { continue; }\\n\\n            if (typeof original !== \\\"function\\\") continue;\\n\\n            voice[name] = function (...args) {\\n                const options =\\n                    args[1] && typeof args[1] === \\\"object\\\"\\n                        ? args[1]\\n                        : null;\\n\\n                let effectiveKind = kind;\\n\\n                const meta = {\\n                    videoSupportedBefore:\\n                        typeof options?.videoSupported === \\\"boolean\\\"\\n                            ? options.videoSupported\\n                            : null\\n                };\\n\\n                // Confirmed by the user's real v1.7.4 log:\\n                // watching somebody else's Live is created by\\n                // createVoiceConnectionWithOptions + streamUserId.\\n                if (\\n                    name === \\\"createVoiceConnectionWithOptions\\\" &&\\n                    options?.streamUserId != null\\n                ) {\\n                    effectiveKind = \\\"remote-stream\\\";\\n\\n                    const settings = viewerSettings();\\n\\n                    if (\\n                        settings.forceViewerVideoSupported !== false &&\\n                        options.videoSupported !== true\\n                    ) {\\n                        try {\\n                            options.videoSupported = true;\\n                            log(\\n                                `viewer.patch | videoSupported ` +\\n                                `${meta.videoSupportedBefore ?? \\\"?\\\"}->true`\\n                            );\\n                        } catch (e) {\\n                            log(\\n                                `viewer.patch | falhou videoSupported: ` +\\n                                `${e?.message || e}`\\n                            );\\n                        }\\n                    }\\n                }\\n\\n                const routeTarget =\\n                    options?.address != null\\n                        ? String(options.address).trim()\\n                        : \\\"\\\";\\n\\n                let routeReady = null;\\n\\n                if (routeTarget) {\\n                    touchWireGuardTarget(\\n                        routeTarget,\\n                        effectiveKind\\n                    );\\n\\n                    routeReady =\\n                        waitWireGuardTargetSync(\\n                            routeTarget,\\n                            1400\\n                        );\\n\\n                    log(\\n                        `wireguard.voice-route | kind=${effectiveKind} ` +\\n                        `ready=${routeReady ? \\\"sim\\\" : \\\"nao\\\"}`\\n                    );\\n                }\\n\\n                state.pendingKind = effectiveKind;\\n\\n                let conn;\\n\\n                try {\\n                    conn = original.apply(this, args);\\n                } finally {\\n                    state.pendingKind = null;\\n                }\\n\\n                return registerConnection(\\n                    effectiveKind,\\n                    name,\\n                    options,\\n                    conn,\\n                    meta\\n                );\\n            };\\n\\n            wrappedFactories++;\\n        }\\n\\n        // Important for the current Discord desktop: some bundles cache the\\n        // factory before our preload gets the module. They still construct\\n        // VoiceConnection dynamically later, so this catches that path.\\n        try {\\n            const OriginalVoiceConnection = voice.VoiceConnection;\\n\\n            if (typeof OriginalVoiceConnection === \\\"function\\\") {\\n                function GoLiveVoiceConnection(...args) {\\n                    const instance = Reflect.construct(\\n                        OriginalVoiceConnection,\\n                        args,\\n                        OriginalVoiceConnection\\n                    );\\n\\n                    if (!state.pendingKind) {\\n                        registerConnection(\\n                            \\\"unknown\\\",\\n                            \\\"VoiceConnection\\\",\\n                            args[1],\\n                            instance\\n                        );\\n                    }\\n\\n                    return instance;\\n                }\\n\\n                Object.setPrototypeOf(\\n                    GoLiveVoiceConnection,\\n                    OriginalVoiceConnection\\n                );\\n\\n                GoLiveVoiceConnection.prototype =\\n                    OriginalVoiceConnection.prototype;\\n\\n                voice.VoiceConnection = GoLiveVoiceConnection;\\n            }\\n        } catch (e) {\\n            log(`voice.constructor.hook.error | ${e?.message || e}`);\\n        }\\n\\n        state.moduleSeen = true;\\n        state.installed = true;\\n        state.hookError = null;\\n\\n        log(\\n            `voice.hook | factories=${wrappedFactories} ` +\\n            `constructor=${typeof voice.VoiceConnection === \\\"function\\\" ? \\\"sim\\\" : \\\"nao\\\"}`\\n        );\\n\\n        return voice;\\n    }\\n\\n    function installHook() {\\n        try {\\n            const nm =\\n                globalThis.DiscordNative?.nativeModules ||\\n                globalThis.window?.DiscordNative?.nativeModules;\\n\\n            if (!nm || typeof nm.requireModule !== \\\"function\\\") {\\n                state.hookError = \\\"requireModule indisponível\\\";\\n                return false;\\n            }\\n\\n            if (!nm.__glq174RequireWrapped) {\\n                const originalRequire = nm.requireModule;\\n\\n                nm.requireModule = function (...args) {\\n                    const loaded = originalRequire.apply(this, args);\\n\\n                    if (args[0] === \\\"discord_voice\\\") {\\n                        return hookVoiceModule(loaded);\\n                    }\\n\\n                    return loaded;\\n                };\\n\\n                try {\\n                    Object.defineProperty(\\n                        nm,\\n                        \\\"__glq174RequireWrapped\\\",\\n                        {\\n                            value: true,\\n                            configurable: true\\n                        }\\n                    );\\n                } catch {}\\n\\n                log(\\\"voice.hook | requireModule interceptado\\\");\\n            }\\n\\n            // If Discord itself already required the addon before our preload,\\n            // requireModule returns the cached instance and we patch it now.\\n            try {\\n                hookVoiceModule(\\n                    nm.requireModule(\\\"discord_voice\\\")\\n                );\\n            } catch {}\\n\\n            state.installed = true;\\n            state.hookError = null;\\n            return true;\\n        } catch (e) {\\n            state.hookError = e?.stack || e?.message || String(e);\\n            log(`voice.hook.error | ${state.hookError}`);\\n            return false;\\n        }\\n    }\\n\\n    function noteDemand(args) {\\n        try {\\n            const joined = Array.prototype\\n                .map.call(\\n                    args,\\n                    value => typeof value === \\\"string\\\" ? value : \\\"\\\"\\n                )\\n                .join(\\\" \\\");\\n\\n            const marker = \\\"Remote media sink wants:\\\";\\n            const at = joined.indexOf(marker);\\n\\n            if (at < 0) return;\\n\\n            const payload = JSON.parse(\\n                joined.slice(at + marker.length).trim()\\n            );\\n\\n            let positive = false;\\n\\n            function walk(value) {\\n                if (positive || value == null) return;\\n\\n                if (typeof value === \\\"number\\\") {\\n                    if (value > 0) positive = true;\\n                    return;\\n                }\\n\\n                if (typeof value === \\\"object\\\") {\\n                    for (const child of Object.values(value)) {\\n                        walk(child);\\n                    }\\n                }\\n            }\\n\\n            walk(payload?.pixelCounts);\\n\\n            if (!positive && payload && typeof payload === \\\"object\\\") {\\n                for (const [key, value] of Object.entries(payload)) {\\n                    if (\\n                        key !== \\\"any\\\" &&\\n                        key !== \\\"pixelCounts\\\" &&\\n                        typeof value === \\\"number\\\" &&\\n                        value > 0\\n                    ) {\\n                        positive = true;\\n                    }\\n                }\\n            }\\n\\n            const now = Date.now();\\n\\n            if (\\n                !state.demandKnown ||\\n                state.demandActive !== positive\\n            ) {\\n                state.demandChangedAt = now;\\n                log(\\n                    `voice.demand | active=${positive ? \\\"sim\\\" : \\\"nao\\\"}`\\n                );\\n            }\\n\\n            state.demandKnown = true;\\n            state.demandActive = positive;\\n\\n            if (positive) state.demandAt = now;\\n        } catch {}\\n    }\\n\\n    for (const method of [\\\"log\\\", \\\"info\\\", \\\"debug\\\"]) {\\n        try {\\n            const original = console[method];\\n            if (typeof original !== \\\"function\\\") continue;\\n\\n            console[method] = function (...args) {\\n                noteDemand(args);\\n                return original.apply(this, args);\\n            };\\n        } catch {}\\n    }\\n\\n    function sampleConnection(rec) {\\n        return new Promise(resolve => {\\n            if (rec.destroyedAt > 0 || !rec.conn) {\\n                resolve({statsOk: false, reason: \\\"destruida\\\"});\\n                return;\\n            }\\n\\n            const conn = rec.conn;\\n\\n            let method = null;\\n            let filtered = false;\\n\\n            if (typeof conn.getFilteredStats === \\\"function\\\") {\\n                method = conn.getFilteredStats;\\n                filtered = true;\\n            } else if (typeof conn.getStats === \\\"function\\\") {\\n                method = conn.getStats;\\n            }\\n\\n            if (!method) {\\n                resolve({statsOk: false, reason: \\\"sem-metodo\\\"});\\n                return;\\n            }\\n\\n            let done = false;\\n            let timer = null;\\n\\n            const finish = raw => {\\n                if (done) return;\\n                done = true;\\n\\n                if (timer) clearTimeout(timer);\\n\\n                const normalized = normalizeStats(raw);\\n\\n                if (!normalized.ok) {\\n                    resolve({\\n                        statsOk: false,\\n                        reason: normalized.reason\\n                    });\\n                    return;\\n                }\\n\\n                // This is the missing piece from v1.7.4:\\n                // if a cached Discord factory bypassed our exact wrapper, a\\n                // VoiceConnection with real outbound-video counters is enough\\n                // to classify it as the Go Live stream.\\n                if (\\n                    rec.kind !== \\\"stream\\\" &&\\n                    rec.kind !== \\\"stream-auto\\\" &&\\n                    rec.kind !== \\\"remote-stream\\\"\\n                ) {\\n                    rec.kind = \\\"stream-auto\\\";\\n                    rec.promotedByStats = true;\\n\\n                    log(\\n                        `voice.classify | id=${rec.id} -> stream-auto ` +\\n                        `via=video-stats creator=${rec.creator}`\\n                    );\\n                }\\n\\n                resolve(updateProgress(rec, normalized));\\n            };\\n\\n            timer = setTimeout(() => {\\n                finish({});\\n            }, 2500);\\n\\n            try {\\n                const returned = filtered\\n                    ? method.call(\\n                        conn,\\n                        2,\\n                        raw => finish(raw)\\n                    )\\n                    : method.call(\\n                        conn,\\n                        raw => finish(raw)\\n                    );\\n\\n                if (\\n                    returned &&\\n                    typeof returned.then === \\\"function\\\"\\n                ) {\\n                    returned.then(\\n                        finish,\\n                        () => finish({})\\n                    );\\n                }\\n            } catch {\\n                finish({});\\n            }\\n        });\\n    }\\n\\n    function activeRemoteStreamRecord() {\\n        let best = null;\\n\\n        for (const rec of state.connections) {\\n            if (\\n                !rec ||\\n                rec.destroyedAt > 0 ||\\n                rec.kind !== \\\"remote-stream\\\"\\n            ) {\\n                continue;\\n            }\\n\\n            if (!best || rec.id > best.id) best = rec;\\n        }\\n\\n        return best;\\n    }\\n\\n    function activeStreamRecord() {\\n        let best = null;\\n\\n        for (const rec of state.connections) {\\n            if (\\n                !rec ||\\n                rec.destroyedAt > 0 ||\\n                (\\n                    rec.kind !== \\\"stream\\\" &&\\n                    rec.kind !== \\\"stream-auto\\\"\\n                )\\n            ) {\\n                continue;\\n            }\\n\\n            if (!best || rec.id > best.id) {\\n                best = rec;\\n            }\\n        }\\n\\n        return best;\\n    }\\n\\n    function recoveryAllowed() {\\n        const settings = readJson(SETTINGS, {});\\n        return settings?.autoRecoverVideo !== false;\\n    }\\n\\n    function cleanupRecoveryWindow() {\\n        const now = Date.now();\\n\\n        state.recoveryAttempts =\\n            state.recoveryAttempts.filter(\\n                at => at >= now - RECOVERY_WINDOW_MS\\n            );\\n    }\\n\\n    function destroyStream(rec, reason) {\\n        cleanupRecoveryWindow();\\n\\n        if (!rec || typeof rec.conn?.destroy !== \\\"function\\\") {\\n            state.lastRecoveryResult = \\\"no-stream\\\";\\n            return false;\\n        }\\n\\n        if (\\n            Date.now() - state.lastRecoveryAt <\\n            RECOVERY_COOLDOWN_MS\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            state.recoveryAttempts.length >=\\n            RECOVERY_MAX\\n        ) {\\n            state.lastRecoveryResult = \\\"limit\\\";\\n            log(\\\"gw.revive | video nativo: teto de tentativas atingido\\\");\\n            return false;\\n        }\\n\\n        try {\\n            state.recoveryAttempts.push(Date.now());\\n            state.lastRecoveryAt = Date.now();\\n            state.lastRecoveryStreamId = rec.id;\\n            state.lastRecoveryResult = \\\"requested\\\";\\n\\n            log(\\n                `gw.revive | video nativo nivel=1 ` +\\n                `destroy stream id=${rec.id} kind=${rec.kind} ` +\\n                `reason=${reason}`\\n            );\\n\\n            rec.conn.destroy();\\n\\n            state.lastRecoveryResult = \\\"stream-destroyed\\\";\\n            return true;\\n        } catch (e) {\\n            state.lastRecoveryResult = \\\"failed\\\";\\n\\n            log(\\n                `gw.revive | video nativo falhou id=${rec.id}: ` +\\n                `${e?.message || e}`\\n            );\\n\\n            return false;\\n        }\\n    }\\n\\n    function maybeAutoRecover(rec) {\\n        if (!recoveryAllowed()) return false;\\n        if (!rec || !rec.stats?.statsOk) return false;\\n\\n        const now = Date.now();\\n        const age = now - rec.createdAt;\\n        const s = rec.stats;\\n\\n        if (age < STREAM_WARMUP_MS) return false;\\n\\n        // Demand is the strongest guard against recovering a stream that has\\n        // nobody watching. If Discord does not expose the marker on this build,\\n        // automatic recovery stays off, but the manual button still works.\\n        if (\\n            !state.demandKnown ||\\n            !state.demandActive ||\\n            state.demandAt <= 0 ||\\n            now - state.demandAt > DEMAND_FRESH_MS\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            s.inputAgeMs > INPUT_ALIVE_MS ||\\n            s.outputAgeMs < OUTPUT_STALL_MS\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            !(\\n                typeof s.captureFrames === \\\"number\\\" ||\\n                s.inputFrameRate > 0\\n            )\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            typeof s.framesEncoded !== \\\"number\\\" ||\\n            typeof s.encodeFrameRate !== \\\"number\\\"\\n        ) {\\n            return false;\\n        }\\n\\n        return destroyStream(\\n            rec,\\n            \\\"capture-viva-output-parada\\\"\\n        );\\n    }\\n\\n    function statusConnection(rec) {\\n        return {\\n            id: rec.id,\\n            kind: rec.kind,\\n            creator: rec.creator,\\n            createdAt: rec.createdAt,\\n            destroyedAt: rec.destroyedAt || null,\\n            promotedByStats: rec.promotedByStats === true,\\n            remoteStream: rec.remoteStream === true,\\n            hasStreamUserId: rec.hasStreamUserId === true,\\n            videoSupportedBefore: rec.videoSupportedBefore,\\n            videoSupportedAfter: rec.videoSupportedAfter,\\n            streamParametersCount: rec.streamParametersCount,\\n            firstFrameHooked: rec.firstFrameHooked === true,\\n            firstFrameAt: rec.firstFrameAt || null,\\n            decoderFallbackAt: rec.decoderFallbackAt || null,\\n            optionShape: rec.optionShape,\\n            stats: rec.stats,\\n            statsError: rec.statsError\\n        };\\n    }\\n\\n    function writeStatus(extra = {}) {\\n        mkdir();\\n\\n        const active = state.connections.filter(\\n            rec => rec && rec.destroyedAt === 0\\n        );\\n\\n        const stream = activeStreamRecord();\\n\\n        const body = {\\n            version: \\\"1.7.4\\\",\\n            updatedAt: new Date().toISOString(),\\n            preloadLoaded: true,\\n            installed: state.installed,\\n            moduleSeen: state.moduleSeen,\\n            hookError: state.hookError,\\n            demandKnown: state.demandKnown,\\n            demandActive: state.demandActive,\\n            demandAgeMs:\\n                state.demandAt > 0\\n                    ? Date.now() - state.demandAt\\n                    : -1,\\n            activeConnections: active.length,\\n            activeStreams: active.filter(\\n                rec =>\\n                    rec.kind === \\\"stream\\\" ||\\n                    rec.kind === \\\"stream-auto\\\"\\n            ).length,\\n            activeRemoteStreams: active.filter(\\n                rec => rec.kind === \\\"remote-stream\\\"\\n            ).length,\\n            latestStream:\\n                stream\\n                    ? statusConnection(stream)\\n                    : null,\\n            latestRemoteStream:\\n                activeRemoteStreamRecord()\\n                    ? statusConnection(activeRemoteStreamRecord())\\n                    : null,\\n            lastRemoteFailure: state.lastRemoteFailure,\\n            lastViewerRecoveryAt: state.lastViewerRecoveryAt || null,\\n            lastViewerRecoveryResult: state.lastViewerRecoveryResult,\\n            lastViewerRecoveryId: state.lastViewerRecoveryId,\\n            viewerRecoveryAttempts: state.viewerRecoveryAttempts.length,\\n            connections: active\\n                .slice(-12)\\n                .map(statusConnection),\\n            lastRecoveryAt:\\n                state.lastRecoveryAt || null,\\n            lastRecoveryResult:\\n                state.lastRecoveryResult,\\n            lastRecoveryStreamId:\\n                state.lastRecoveryStreamId,\\n            recoveryAttempts:\\n                state.recoveryAttempts.length,\\n            ...extra\\n        };\\n\\n        try {\\n            fs.writeFileSync(\\n                STATUS,\\n                JSON.stringify(body, null, 2),\\n                \\\"utf8\\\"\\n            );\\n        } catch {}\\n    }\\n\\n    async function probeAll() {\\n        const active = state.connections.filter(\\n            rec => rec && rec.destroyedAt === 0\\n        );\\n\\n        for (const rec of active) {\\n            if (rec.kind === \\\"remote-stream\\\") {\\n                log(\\n                    [\\n                        \\\"viewer.probe\\\",\\n                        `id=${rec.id}`,\\n                        `age=${Date.now() - rec.createdAt}ms`,\\n                        `firstFrame=${rec.firstFrameAt ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                        `firstFrameHook=${rec.firstFrameHooked ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                        `decoderFallback=${rec.decoderFallbackAt ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                        `videoSupported=${rec.videoSupportedBefore ?? \\\"?\\\"}->${rec.videoSupportedAfter ?? \\\"?\\\"}`,\\n                        `streamParams=${rec.streamParametersCount ?? \\\"?\\\"}`\\n                    ].join(\\\" | \\\")\\n                );\\n                continue;\\n            }\\n\\n            const sampled = await sampleConnection(rec);\\n\\n            rec.stats = sampled;\\n            rec.statsError =\\n                sampled.statsOk\\n                    ? null\\n                    : sampled.reason;\\n\\n            if (\\n                rec.kind === \\\"stream\\\" ||\\n                rec.kind === \\\"stream-auto\\\"\\n            ) {\\n                log(\\n                    [\\n                        \\\"voice.probe\\\",\\n                        `id=${rec.id}`,\\n                        `kind=${rec.kind}`,\\n                        `capture=${sampled.captureFrames ?? \\\"?\\\"}`,\\n                        `fps_in=${sampled.inputFrameRate ?? \\\"?\\\"}`,\\n                        `encoded=${sampled.framesEncoded ?? \\\"?\\\"}`,\\n                        `fps_out=${sampled.encodeFrameRate ?? \\\"?\\\"}`,\\n                        `bitrate=${sampled.mediaBitrate ?? \\\"?\\\"}`,\\n                        `size=${sampled.width ?? \\\"?\\\"}x${sampled.height ?? \\\"?\\\"}`,\\n                        `in_age=${sampled.inputAgeMs ?? \\\"?\\\"}`,\\n                        `out_age=${sampled.outputAgeMs ?? \\\"?\\\"}`,\\n                        `demand=${state.demandKnown ? (state.demandActive ? \\\"sim\\\" : \\\"nao\\\") : \\\"?\\\"}`\\n                    ].join(\\\" | \\\")\\n                );\\n\\n                maybeAutoRecover(rec);\\n            }\\n        }\\n\\n        writeStatus();\\n    }\\n\\n    function pollCommand() {\\n        const cmd = readJson(COMMAND, null);\\n        if (!cmd || typeof cmd !== \\\"object\\\") return;\\n\\n        const nonce = String(cmd.nonce || \\\"\\\");\\n\\n        if (\\n            !nonce ||\\n            nonce === state.commandNonce\\n        ) {\\n            return;\\n        }\\n\\n        state.commandNonce = nonce;\\n\\n        if (cmd.type === \\\"destroy-stream\\\") {\\n            const stream = activeStreamRecord();\\n\\n            if (!stream) {\\n                state.lastRecoveryResult = \\\"no-stream\\\";\\n                log(\\n                    \\\"gw.revive | video nativo: comando manual sem stream classificada\\\"\\n                );\\n                writeStatus();\\n                return;\\n            }\\n\\n            destroyStream(\\n                stream,\\n                \\\"manual-plugin\\\"\\n            );\\n\\n            writeStatus();\\n            return;\\n        }\\n\\n        if (cmd.type === \\\"recover-viewer\\\") {\\n            const remote = activeRemoteStreamRecord();\\n\\n            if (!remote) {\\n                state.lastViewerRecoveryResult = \\\"no-remote-stream\\\";\\n                log(\\\"viewer.revive | comando manual sem remote-stream ativa\\\");\\n                writeStatus();\\n                return;\\n            }\\n\\n            recoverViewer(remote, \\\"manual-plugin\\\");\\n            writeStatus();\\n        }\\n    }\\n\\n    mkdir();\\n    log(\\\"voice.preload | v1.7.4 carregado\\\");\\n\\n    installMediaShim();\\n    installHook();\\n    writeStatus({state: \\\"preload-start\\\"});\\n\\n    let attempts = 0;\\n\\n    const hookTimer = setInterval(() => {\\n        attempts++;\\n\\n        if (\\n            state.moduleSeen ||\\n            attempts >= 200\\n        ) {\\n            clearInterval(hookTimer);\\n            return;\\n        }\\n\\n        installHook();\\n    }, 25);\\n\\n    setInterval(() => {\\n        probeAll().catch(\\n            e => log(\\n                `voice.probe.error | ${e?.message || e}`\\n            )\\n        );\\n    }, 3000);\\n\\n    setInterval(() => {\\n        try { pollCommand(); } catch {}\\n    }, 500);\\n})();\\n\";\n\n\nfunction registerVoicePreload() {\n    mkdir();\n\n    try {\n        fs.writeFileSync(VOICE_PRELOAD, VOICE_PRELOAD_SOURCE, \"utf8\");\n    } catch (e) {\n        log(`voice.preload.write falhou: ${e.message}`);\n        writeStatus({\n            voicePreloadRegistered: false,\n            voicePreloadError: e.message\n        });\n        return false;\n    }\n\n    try {\n        if (typeof session.defaultSession.registerPreloadScript === \"function\") {\n            try {\n                session.defaultSession.unregisterPreloadScript?.(\n                    \"go-live-de-queijo-voice-v174\"\n                );\n            } catch {}\n\n            session.defaultSession.registerPreloadScript({\n                type: \"frame\",\n                id: \"go-live-de-queijo-voice-v174\",\n                filePath: VOICE_PRELOAD\n            });\n\n            log(\"voice.preload registrado via registerPreloadScript\");\n            writeStatus({\n                voicePreloadRegistered: true,\n                voicePreloadMode: \"registerPreloadScript\",\n                voicePreloadError: null\n            });\n            return true;\n        }\n\n        if (\n            typeof session.defaultSession.getPreloads === \"function\" &&\n            typeof session.defaultSession.setPreloads === \"function\"\n        ) {\n            const old = session.defaultSession.getPreloads() || [];\n            session.defaultSession.setPreloads(\n                [...new Set([...old, VOICE_PRELOAD])]\n            );\n\n            log(\"voice.preload registrado via setPreloads\");\n            writeStatus({\n                voicePreloadRegistered: true,\n                voicePreloadMode: \"setPreloads\",\n                voicePreloadError: null\n            });\n            return true;\n        }\n\n        throw new Error(\"API de preload da sessão indisponível\");\n    } catch (e) {\n        log(`voice.preload.register falhou: ${e.message}`);\n        writeStatus({\n            voicePreloadRegistered: false,\n            voicePreloadError: e.message\n        });\n        return false;\n    }\n}\n\nfunction activeNativeStream() {\n    try {\n        const body = JSON.parse(fs.readFileSync(VOICE_STATUS, \"utf8\"));\n        return Number(body?.activeStreams || 0) > 0;\n    } catch {\n        return false;\n    }\n}\n\n\nfunction readWireGuardStatus() {\n    try {\n        return JSON.parse(fs.readFileSync(WG_STATUS, \"utf8\"));\n    } catch {\n        return null;\n    }\n}\n\nfunction wireGuardManagerReady() {\n    const status = readWireGuardStatus();\n\n    if (!status?.managerRunning || !status?.tunnelUp) {\n        return false;\n    }\n\n    try {\n        const updated = new Date(status.updatedAt || 0).getTime();\n        return Number.isFinite(updated)\n            && updated > 0\n            && Date.now() - updated < 10000;\n    } catch {\n        return false;\n    }\n}\n\nfunction touchRouteTarget(target, source = \"native\") {\n    target = String(target || \"\").trim();\n\n    if (!target) return false;\n\n    try {\n        mkdir();\n\n        let currentFile = {\n            version: 1,\n            updatedAt: null,\n            targets: []\n        };\n\n        try {\n            const parsed = JSON.parse(\n                fs.readFileSync(ROUTE_TARGETS, \"utf8\")\n            );\n\n            if (parsed && Array.isArray(parsed.targets)) {\n                currentFile = parsed;\n            }\n        } catch {}\n\n        const now = Date.now();\n\n        currentFile.targets = currentFile.targets\n            .filter(item => {\n                if (!item || !item.target) return false;\n                const touched = Number(item.touchedAt || 0);\n                return touched > 0 && now - touched < 15 * 60 * 1000;\n            })\n            .filter(item => String(item.target) !== target);\n\n        currentFile.targets.push({\n            target,\n            source,\n            touchedAt: now\n        });\n\n        currentFile.updatedAt = new Date().toISOString();\n\n        const tmp = ROUTE_TARGETS + \".tmp\";\n\n        fs.writeFileSync(\n            tmp,\n            JSON.stringify(currentFile, null, 2),\n            \"utf8\"\n        );\n\n        fs.renameSync(tmp, ROUTE_TARGETS);\n        return true;\n    } catch (e) {\n        log(`wireguard route target falhou (${target}): ${e.message}`);\n        return false;\n    }\n}\n\nfunction isRouteTargetReady(target) {\n    const status = readWireGuardStatus();\n\n    return !!(\n        status?.tunnelUp &&\n        Array.isArray(status.readyTargets) &&\n        status.readyTargets.includes(String(target))\n    );\n}\n\nasync function waitForRouteTarget(target, timeoutMs = 5000) {\n    const start = Date.now();\n\n    touchRouteTarget(target, \"router\");\n\n    while (Date.now() - start < timeoutMs) {\n        if (isRouteTargetReady(target)) return true;\n        await sleep(80);\n    }\n\n    return false;\n}\n\nasync function openThroughWireGuard(host, port, source = \"gateway\") {\n    if (!wireGuardManagerReady()) {\n        throw new Error(\n            \"WireGuard manager/túnel ainda não está pronto\"\n        );\n    }\n\n    touchRouteTarget(host, source);\n\n    const ready = await waitForRouteTarget(host, 6000);\n\n    if (!ready) {\n        const wg = readWireGuardStatus();\n\n        writeStatus({\n            wireGuardReady: false,\n            wireGuardRouteError:\n                `rota não ficou pronta para ${host}`,\n            wireGuardStatusError: wg?.lastError || null\n        });\n\n        throw new Error(\n            `rota WireGuard não ficou pronta para ${host}`\n        );\n    }\n\n    const socket = await directConnect(host, port);\n\n    const wg = readWireGuardStatus();\n\n    writeStatus({\n        wireGuardReady: true,\n        wireGuardTunnelUp: wg?.tunnelUp === true,\n        wireGuardInterfaceIndex: wg?.interfaceIndex ?? null,\n        wireGuardRouteCount: wg?.routeCount ?? null,\n        wireGuardRouteError: null\n    });\n\n    log(\n        `wireguard route pronta: ${source} ${host}:${port} -> ` +\n        `${wg?.interfaceAlias || \"GLQVPN\"}`\n    );\n\n    return {\n        socket,\n        viaProxy: false,\n        viaWireGuard: true,\n        proxy: null\n    };\n}\n\nasync function wireGuardHeartbeat() {\n    const wg = readWireGuardStatus();\n\n    writeStatus({\n        wireGuardReady: wireGuardManagerReady(),\n        wireGuardManagerRunning: wg?.managerRunning === true,\n        wireGuardTunnelUp: wg?.tunnelUp === true,\n        wireGuardService: wg?.tunnelService || null,\n        wireGuardInterfaceIndex: wg?.interfaceIndex ?? null,\n        wireGuardInterfaceAlias: wg?.interfaceAlias || null,\n        wireGuardRouteCount: wg?.routeCount ?? null,\n        wireGuardManagerError: wg?.lastError || null,\n        networkMode: \"wireguard\"\n    });\n}\n\nfunction trackSocket(socket) {\n    if (!socket || typeof socket.once !== \"function\") return socket;\n\n    activeSockets.add(socket);\n\n    socket.once(\"close\", () => {\n        activeSockets.delete(socket);\n    });\n\n    return socket;\n}\n\nfunction clearNativeTimers() {\n    if (heartbeatTimer) {\n        clearInterval(heartbeatTimer);\n        heartbeatTimer = null;\n    }\n\n    if (repairTimer) {\n        clearInterval(repairTimer);\n        repairTimer = null;\n    }\n\n    if (startupRepairTimer) {\n        clearTimeout(startupRepairTimer);\n        startupRepairTimer = null;\n    }\n}\n\nfunction destroyActiveSockets() {\n    for (const socket of [...activeSockets]) {\n        try { socket.destroy(); } catch {}\n    }\n\n    activeSockets.clear();\n}\n\nfunction mkdir() {\n    try { fs.mkdirSync(BASE, {recursive: true}); } catch {}\n}\n\nfunction log(message) {\n    mkdir();\n    const line = `${new Date().toISOString()} ${message}`;\n    try { fs.appendFileSync(LOG, line + \"\\n\"); } catch {}\n    console.log(\"[GoLiveBypassBD/native]\", message);\n}\n\nfunction writeStatus(extra) {\n    mkdir();\n\n    let previous = {};\n\n    try {\n        const parsed = JSON.parse(fs.readFileSync(STATUS, \"utf8\"));\n        if (parsed && typeof parsed === \"object\") previous = parsed;\n    } catch {}\n\n    const body = Object.assign(\n        {},\n        previous,\n        {\n            version: \"1.7.4\",\n            pid: process.pid,\n            updatedAt: new Date().toISOString(),\n            routerPort,\n            pool: pool.map(x => ({\n                proxy: safeProxy(x.proxy),\n                country: x.country || null,\n                ms: x.ms ?? null\n            })),\n            current: current ? {\n                proxy: safeProxy(current.proxy),\n                country: current.country || null,\n                ms: current.ms ?? null\n            } : previous.current || null\n        },\n        extra || {}\n    );\n\n    try {\n        fs.writeFileSync(STATUS, JSON.stringify(body, null, 2), \"utf8\");\n    } catch {}\n}\n\nfunction readSettings() {\n    try {\n        return Object.assign({\n            enabled: true,\n            excludedCountries: \"BR\",\n            manualProxy: \"\"\n        }, JSON.parse(fs.readFileSync(SETTINGS, \"utf8\")));\n    } catch {\n        return {\n            enabled: true,\n            excludedCountries: \"BR\",\n            manualProxy: \"\"\n        };\n    }\n}\n\nfunction excludedSet(settings) {\n    const result = new Set(\n        String(settings.excludedCountries || \"BR\")\n            .split(\",\")\n            .map(x => x.trim().toUpperCase())\n            .filter(x => /^[A-Z]{2}$/.test(x))\n    );\n    if (!result.size) result.add(\"BR\");\n    return result;\n}\n\nfunction parseProxy(value) {\n    const m = /^socks5:\\/\\/(?:(.*?)@)?([^:/?#\\s@]+):(\\d{1,5})$/i.exec(String(value || \"\").trim());\n    if (!m) return null;\n\n    const port = Number(m[3]);\n    if (!(port > 0 && port <= 65535)) return null;\n    if (port === 4145) return null;\n\n    let user = \"\";\n    let pass = \"\";\n\n    if (m[1]) {\n        const i = m[1].indexOf(\":\");\n        const dec = v => {\n            try { return decodeURIComponent(v); } catch { return v; }\n        };\n        user = dec(i < 0 ? m[1] : m[1].slice(0, i));\n        pass = dec(i < 0 ? \"\" : m[1].slice(i + 1));\n    }\n\n    return {\n        scheme: \"socks5\",\n        host: m[2],\n        port,\n        user,\n        pass,\n        raw: String(value).trim()\n    };\n}\n\nfunction safeProxy(proxy) {\n    if (!proxy) return \"nenhuma\";\n    return `socks5://${proxy.user ? proxy.user + \":***@\" : \"\"}${proxy.host}:${proxy.port}`;\n}\n\nfunction gatewayHost(host) {\n    const h = String(host || \"\").toLowerCase();\n\n    return h === \"gateway.discord.gg\"\n        || h === \"remote-auth-gateway.discord.gg\"\n        || (h.startsWith(\"gateway-\") && h.endsWith(\".discord.gg\"));\n}\n\nfunction mediaSignalingHost(host) {\n    const h = String(host || \"\").toLowerCase();\n\n    return h === \"discord.media\"\n        || h.endsWith(\".discord.media\");\n}\n\nfunction routedHost(host) {\n    return gatewayHost(host) || mediaSignalingHost(host);\n}\n\nfunction socketTimeout(socket, ms, reject) {\n    socket.setTimeout(ms, () => {\n        try { socket.destroy(); } catch {}\n        reject(new Error(\"timeout\"));\n    });\n}\n\nfunction socks5Tunnel(proxy, host, port, timeout = PROBE_TIMEOUT) {\n    return new Promise((resolve, reject) => {\n        const socket = trackSocket(net.connect(proxy.port, proxy.host));\n        let done = false;\n\n        const fail = error => {\n            if (done) return;\n            done = true;\n            try { socket.destroy(); } catch {}\n            reject(error instanceof Error ? error : new Error(String(error)));\n        };\n\n        socketTimeout(socket, timeout, fail);\n        socket.once(\"error\", fail);\n\n        socket.once(\"connect\", () => {\n            const methods = proxy.user ? [0x00, 0x02] : [0x00];\n            socket.write(Buffer.from([0x05, methods.length, ...methods]));\n\n            socket.once(\"data\", methodReply => {\n                if (methodReply.length < 2 || methodReply[0] !== 0x05) {\n                    return fail(new Error(\"SOCKS5 handshake inválido\"));\n                }\n                if (methodReply[1] === 0xff) {\n                    return fail(new Error(\"SOCKS5 sem método compatível\"));\n                }\n\n                const connectTarget = () => {\n                    const hostBuf = Buffer.from(host, \"utf8\");\n                    if (hostBuf.length > 255) return fail(new Error(\"hostname grande demais\"));\n\n                    const req = Buffer.concat([\n                        Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),\n                        hostBuf,\n                        Buffer.from([(port >> 8) & 255, port & 255])\n                    ]);\n\n                    socket.write(req);\n                    socket.once(\"data\", reply => {\n                        if (reply.length < 2 || reply[1] !== 0x00) {\n                            return fail(new Error(`SOCKS5 CONNECT recusado (${reply[1] ?? \"?\"})`));\n                        }\n\n                        if (done) return;\n                        done = true;\n                        socket.setTimeout(0);\n                        socket.removeListener(\"error\", fail);\n                        resolve(socket);\n                    });\n                };\n\n                if (methodReply[1] === 0x02) {\n                    const u = Buffer.from(proxy.user, \"utf8\");\n                    const p = Buffer.from(proxy.pass, \"utf8\");\n\n                    if (u.length > 255 || p.length > 255) {\n                        return fail(new Error(\"credencial SOCKS5 longa demais\"));\n                    }\n\n                    socket.write(Buffer.concat([\n                        Buffer.from([0x01, u.length]),\n                        u,\n                        Buffer.from([p.length]),\n                        p\n                    ]));\n\n                    socket.once(\"data\", authReply => {\n                        if (authReply.length < 2 || authReply[1] !== 0x00) {\n                            return fail(new Error(\"autenticação SOCKS5 recusada\"));\n                        }\n                        connectTarget();\n                    });\n                } else {\n                    connectTarget();\n                }\n            });\n        });\n    });\n}\n\nasync function tlsProbe(proxy, hostname, timeout = PROBE_TIMEOUT) {\n    const start = Date.now();\n    const raw = await socks5Tunnel(proxy, hostname, 443, timeout);\n\n    return await new Promise((resolve, reject) => {\n        let settled = false;\n\n        const secure = tls.connect({\n            socket: raw,\n            servername: hostname,\n            rejectUnauthorized: true\n        });\n\n        const fail = e => {\n            if (settled) return;\n            settled = true;\n            try { secure.destroy(); } catch {}\n            reject(e instanceof Error ? e : new Error(String(e)));\n        };\n\n        socketTimeout(secure, timeout, fail);\n        secure.once(\"error\", fail);\n        secure.once(\"secureConnect\", () => {\n            if (settled) return;\n            settled = true;\n            secure.setTimeout(0);\n            secure.destroy();\n            resolve(Date.now() - start);\n        });\n    });\n}\n\nasync function countryThrough(proxy) {\n    const raw = await socks5Tunnel(proxy, \"cloudflare.com\", 443);\n\n    return await new Promise((resolve, reject) => {\n        let settled = false;\n        let data = \"\";\n\n        const secure = tls.connect({\n            socket: raw,\n            servername: \"cloudflare.com\",\n            rejectUnauthorized: true\n        });\n\n        const fail = e => {\n            if (settled) return;\n            settled = true;\n            try { secure.destroy(); } catch {}\n            reject(e instanceof Error ? e : new Error(String(e)));\n        };\n\n        socketTimeout(secure, PROBE_TIMEOUT, fail);\n        secure.once(\"error\", fail);\n\n        secure.once(\"secureConnect\", () => {\n            secure.write(\n                \"GET /cdn-cgi/trace HTTP/1.1\\r\\n\" +\n                \"Host: cloudflare.com\\r\\n\" +\n                \"Connection: close\\r\\n\\r\\n\"\n            );\n        });\n\n        secure.on(\"data\", chunk => {\n            data += chunk.toString(\"utf8\");\n            if (data.length > 20000) fail(new Error(\"trace grande demais\"));\n        });\n\n        secure.on(\"end\", () => {\n            if (settled) return;\n            const m = /\\bloc=([A-Z]{2})\\b/.exec(data);\n            if (!m) return fail(new Error(\"país não identificado\"));\n            settled = true;\n            resolve(m[1]);\n        });\n    });\n}\n\nasync function probeExit(proxy, excluded) {\n    const started = Date.now();\n\n    const country = await countryThrough(proxy);\n    if (excluded.has(country)) {\n        throw new Error(`país excluído: ${country}`);\n    }\n\n    await tlsProbe(proxy, \"gateway.discord.gg\");\n\n    return {\n        proxy,\n        country,\n        ms: Date.now() - started\n    };\n}\n\nfunction downloadText(url, timeout = SOURCE_TIMEOUT) {\n    return new Promise((resolve, reject) => {\n        const req = https.get(url, {\n            headers: {\n                \"User-Agent\": \"GoLiveBypassBD/1.7.4\"\n            }\n        }, res => {\n            if (res.statusCode < 200 || res.statusCode >= 300) {\n                res.resume();\n                reject(new Error(`HTTP ${res.statusCode}`));\n                return;\n            }\n\n            let body = \"\";\n            res.setEncoding(\"utf8\");\n\n            res.on(\"data\", chunk => {\n                body += chunk;\n                if (body.length > 4_000_000) {\n                    req.destroy(new Error(\"resposta grande demais\"));\n                }\n            });\n\n            res.on(\"end\", () => resolve(body));\n        });\n\n        req.setTimeout(timeout, () => req.destroy(new Error(\"timeout da fonte\")));\n        req.on(\"error\", reject);\n    });\n}\n\nfunction parseSource(type, body) {\n    const out = [];\n\n    if (type === \"plain\") {\n        for (const line of body.split(/\\r?\\n/)) {\n            const raw = line.trim();\n            if (!raw || raw.startsWith(\"#\")) continue;\n            const p = parseProxy(raw.includes(\"://\") ? raw : `socks5://${raw}`);\n            if (p) out.push(p);\n        }\n        return out;\n    }\n\n    const data = JSON.parse(body);\n    const entries = Array.isArray(data.proxies) ? data.proxies : [];\n\n    for (const item of entries) {\n        const p = parseProxy(String(item?.proxy || \"\"));\n        if (p) out.push(p);\n    }\n\n    return out;\n}\n\nfunction shuffled(list) {\n    const out = [...list];\n\n    for (let i = out.length - 1; i > 0; i--) {\n        const j = Math.floor(Math.random() * (i + 1));\n        [out[i], out[j]] = [out[j], out[i]];\n    }\n\n    return out;\n}\n\nasync function proxyCandidates(settings) {\n    const manualRaw = String(settings.manualProxy || \"\").trim();\n\n    if (manualRaw) {\n        const manual = parseProxy(manualRaw);\n        if (!manual) throw new Error(\"proxy manual inválida\");\n        return [manual];\n    }\n\n    const chunks = await Promise.all(\n        PROXY_SOURCES.map(async src => {\n            try {\n                const body = await downloadText(src.url);\n                log(`fonte ${src.type} ok (${body.length} bytes)`);\n                return parseSource(src.type, body);\n            } catch (e) {\n                log(`fonte ${src.type} falhou: ${e.message}`);\n                return [];\n            }\n        })\n    );\n\n    const unique = new Map();\n\n    for (const list of chunks) {\n        for (const proxy of list) {\n            const key = `${proxy.host}:${proxy.port}`;\n            if (!unique.has(key)) unique.set(key, proxy);\n        }\n    }\n\n    const all = [...unique.values()];\n    const picked = shuffled(all).slice(0, MAX_CANDIDATES);\n\n    writeStatus({\n        proxyCandidatesTotal: all.length,\n        proxyCandidatesTesting: picked.length\n    });\n\n    return picked;\n}\n\nfunction readProxyCache(settings) {\n    try {\n        const parsed = JSON.parse(fs.readFileSync(PROXY_CACHE, \"utf8\"));\n        const list = Array.isArray(parsed?.exits) ? parsed.exits : [];\n        const excluded = excludedSet(settings);\n\n        return list\n            .map(item => {\n                const proxy = parseProxy(item?.raw || \"\");\n                if (!proxy) return null;\n\n                const country = String(item?.country || \"\").toUpperCase();\n                if (country && excluded.has(country)) return null;\n\n                return {\n                    proxy,\n                    country: country || null,\n                    ms: Number(item?.ms) || null,\n                    savedAt: Number(item?.savedAt) || 0\n                };\n            })\n            .filter(Boolean)\n            .slice(0, 6);\n    } catch {\n        return [];\n    }\n}\n\nfunction rememberExit(result) {\n    if (!result?.proxy) return;\n\n    let previous = [];\n\n    try {\n        const parsed = JSON.parse(fs.readFileSync(PROXY_CACHE, \"utf8\"));\n        if (Array.isArray(parsed?.exits)) previous = parsed.exits;\n    } catch {}\n\n    const raw = result.proxy.raw ||\n        `socks5://${result.proxy.host}:${result.proxy.port}`;\n\n    const entry = {\n        raw,\n        country: result.country || null,\n        ms: result.ms ?? null,\n        savedAt: Date.now()\n    };\n\n    const next = [\n        entry,\n        ...previous.filter(item => item?.raw !== raw)\n    ].slice(0, 8);\n\n    try {\n        fs.writeFileSync(\n            PROXY_CACHE,\n            JSON.stringify({exits: next}, null, 2),\n            \"utf8\"\n        );\n    } catch {}\n}\n\nfunction registerGatewayPair(client, remote, viaProxy, host) {\n    const pair = {\n        id: ++gatewayRouteSeq,\n        client,\n        remote,\n        viaProxy: !!viaProxy,\n        host,\n        openedAt: Date.now()\n    };\n\n    activeGatewayPairs.add(pair);\n\n    const cleanup = () => {\n        activeGatewayPairs.delete(pair);\n    };\n\n    try { client.once(\"close\", cleanup); } catch {}\n    try { remote.once(\"close\", cleanup); } catch {}\n\n    return pair;\n}\n\nfunction closeDirectGatewayPairs(reason) {\n    let closed = 0;\n\n    for (const pair of [...activeGatewayPairs]) {\n        if (pair.viaProxy) continue;\n\n        closed++;\n\n        log(\n            `fechando Gateway DIRECT #${pair.id} ${pair.host || \"?\"}: ${reason}`\n        );\n\n        try { pair.client.destroy(); } catch {}\n        try { pair.remote.destroy(); } catch {}\n\n        activeGatewayPairs.delete(pair);\n    }\n\n    return closed;\n}\n\nasync function warmCachedPool(settings, excluded) {\n    const cached = readProxyCache(settings);\n\n    if (!cached.length) {\n        writeStatus({proxyCacheCandidates: 0});\n        return;\n    }\n\n    writeStatus({\n        proxyCacheCandidates: cached.length,\n        proxyCacheState: \"testing\"\n    });\n\n    await Promise.allSettled(\n        cached.map(async item => {\n            try {\n                const result = await probeExit(item.proxy, excluded);\n\n                rememberExit(result);\n\n                if (!current) {\n                    current = result;\n                    pool = [result];\n\n                    writeStatus({\n                        state: \"exit-ready-cache\",\n                        country: result.country,\n                        proxy: safeProxy(result.proxy),\n                        ms: result.ms,\n                        proxyCacheState: \"ready\"\n                    });\n\n                    void reconnectGatewayAfterLateExit();\n                }\n            } catch {}\n        })\n    );\n\n    if (!current) {\n        writeStatus({proxyCacheState: \"miss\"});\n    }\n}\n\nfunction readStatusFile() {\n    try {\n        const parsed = JSON.parse(fs.readFileSync(STATUS, \"utf8\"));\n        return parsed && typeof parsed === \"object\" ? parsed : {};\n    } catch {\n        return {};\n    }\n}\n\nasync function reconnectGatewayAfterLateExit() {\n    const status = readStatusFile();\n\n    if (!status.pacActive) return false;\n    if (!status.directFallback && status.gatewayViaProxy !== false) return false;\n    if (!current) return false;\n\n    // Avoid reload/reconnect loops when several proxy probes finish together.\n    if (Date.now() - lastRecoveryReconnectAt < 15000) return false;\n    lastRecoveryReconnectAt = Date.now();\n\n    try {\n        const transitionId = `direct-to-proxy-${Date.now()}`;\n\n        writeStatus({\n            state: \"late-exit-reconnecting\",\n            directFallback: false,\n            gatewayViaProxy: null,\n            directReason: null,\n            recoveryProxy: safeProxy(current.proxy),\n            recoveryCountry: current.country,\n            gatewayTransitionId: transitionId,\n            gatewayTransitionAt: new Date().toISOString()\n        });\n\n        const closedDirect = closeDirectGatewayPairs(\n            \"proxy validada; migrando sessão\"\n        );\n\n        // Also ask Chromium to drop cached network connections. The explicit\n        // pair cleanup above is important because the DIRECT upstream socket\n        // belongs to our Node router, not Electron's proxy stack.\n        await session.defaultSession.closeAllConnections();\n\n        log(\n            `saída pronta (${current.country}); DIRECT fechados=${closedDirect}; ` +\n            `aguardando novo Gateway por ${safeProxy(current.proxy)}`\n        );\n\n        writeStatus({\n            state: \"awaiting-proxied-gateway\",\n            gatewayTransitionId: transitionId,\n            directPairsClosed: closedDirect\n        });\n\n        return true;\n    } catch (e) {\n        log(`reconexão após saída tardia falhou: ${e.message}`);\n        return false;\n    }\n}\n\nasync function selectPool(force = false) {\n    // Never run two large proxy scans at the same time. \"force\" means retry\n    // when idle, not duplicate an in-flight selection.\n    if (selecting) return selecting;\n\n    selecting = (async () => {\n        selectionAttempt++;\n\n        const settings = readSettings();\n        const excluded = excludedSet(settings);\n        const manualRaw = String(settings.manualProxy || \"\").trim();\n\n        // v1.7.4: an explicitly configured private/3proxy exit is authoritative.\n        // Use it immediately and never race it against cached/public proxies.\n        if (manualRaw) {\n            const manual = parseProxy(manualRaw);\n\n            if (!manual) {\n                throw new Error(\"proxy manual inválida\");\n            }\n\n            current = {\n                proxy: manual,\n                country: null,\n                ms: null,\n                manual: true\n            };\n\n            pool = [current];\n            manualHeartbeatFailures = 0;\n\n            writeStatus({\n                state: \"exit-ready-manual\",\n                proxyMode: \"manual-sticky\",\n                proxyAttempt: selectionAttempt,\n                proxyCandidatesTotal: 1,\n                proxyCandidatesTesting: 0,\n                proxyCacheCandidates: 0,\n                proxyCacheState: \"bypassed-manual\",\n                proxySelectionError: null,\n                proxy: safeProxy(manual),\n                country: null,\n                ms: null,\n                manualHeartbeatFailures: 0\n            });\n\n            log(\n                \"proxy manual/3proxy configurada: usando imediatamente; \" +\n                \"cache, listas públicas e troca por RTT desativados\"\n            );\n\n            // Geolocation/health checking becomes telemetry only. A slow probe\n            // must not delay or replace an explicitly configured private exit.\n            void probeExit(manual, excluded)\n                .then(result => {\n                    if (\n                        current?.proxy?.host === manual.host &&\n                        current?.proxy?.port === manual.port\n                    ) {\n                        current.country = result.country;\n                        current.ms = result.ms;\n                        current.manual = true;\n                        pool = [current];\n\n                        writeStatus({\n                            state: \"exit-ready-manual\",\n                            proxyMode: \"manual-sticky\",\n                            country: result.country,\n                            proxy: safeProxy(manual),\n                            ms: result.ms,\n                            manualProbe: \"ok\",\n                            manualProbeError: null\n                        });\n\n                        log(\n                            `proxy manual validada em segundo plano: ` +\n                            `${safeProxy(manual)} país=${result.country} ${result.ms}ms`\n                        );\n                    }\n                })\n                .catch(error => {\n                    writeStatus({\n                        proxyMode: \"manual-sticky\",\n                        manualProbe: \"warning\",\n                        manualProbeError: error.message\n                    });\n\n                    log(\n                        \"proxy manual: probe de telemetria falhou, \" +\n                        \"mas a saída fixa foi mantida: \" + error.message\n                    );\n                });\n\n            return pool;\n        }\n\n        writeStatus({\n            state: \"selecting-exit\",\n            proxyMode: \"auto\",\n            proxyAttempt: selectionAttempt,\n            proxySelectionError: null\n        });\n\n        // Automatic mode keeps the old cache/public-pool behavior.\n        void warmCachedPool(settings, excluded);\n\n        const candidates = await proxyCandidates(settings);\n        if (!candidates.length) throw new Error(\"nenhuma proxy candidata\");\n\n        const start = Date.now();\n        const winners = [];\n        let cursor = 0;\n        const workerCount = Math.min(28, candidates.length);\n\n        const workers = Array.from({length: workerCount}, async () => {\n            while (\n                Date.now() - start < SELECTION_BUDGET &&\n                winners.length < POOL_SIZE\n            ) {\n                const i = cursor++;\n                if (i >= candidates.length) return;\n\n                const proxy = candidates[i];\n\n                try {\n                    const result = await probeExit(proxy, excluded);\n                    winners.push(result);\n                    rememberExit(result);\n\n                    log(`proxy aprovada ${safeProxy(proxy)} país=${result.country} ${result.ms}ms`);\n\n                    if (!current) {\n                        current = result;\n                        pool = [result];\n\n                        writeStatus({\n                            state: \"exit-ready-early\",\n                            proxyMode: \"auto\",\n                            country: result.country,\n                            proxy: safeProxy(result.proxy),\n                            ms: result.ms,\n                            proxyAttempt: selectionAttempt\n                        });\n\n                        void reconnectGatewayAfterLateExit();\n                    }\n                } catch (error) {\n                    log(`proxy rejeitada ${safeProxy(proxy)}: ${error.message}`);\n                }\n            }\n        });\n\n        await Promise.allSettled(workers);\n\n        if (!winners.length) {\n            const message = \"nenhuma saída não-BR respondeu ao Gateway\";\n\n            writeStatus({\n                state: \"proxy-search-failed\",\n                proxyMode: \"auto\",\n                proxyAttempt: selectionAttempt,\n                proxySelectionError: message\n            });\n\n            throw new Error(message);\n        }\n\n        winners.sort((a, b) => a.ms - b.ms);\n\n        pool = winners.slice(0, POOL_SIZE);\n\n        if (!current || !winners.includes(current)) {\n            current = pool[0];\n        }\n\n        writeStatus({\n            state: \"exit-ready\",\n            proxyMode: \"auto\",\n            country: current.country,\n            proxy: safeProxy(current.proxy),\n            ms: current.ms,\n            proxyAttempt: selectionAttempt,\n            proxySelectionError: null\n        });\n\n        void reconnectGatewayAfterLateExit();\n\n        return pool;\n    })().finally(() => {\n        selecting = null;\n    });\n\n    return selecting;\n}\n\nfunction waitForExit(timeout = HOLD_GATEWAY_MS) {\n    if (current) return Promise.resolve(current);\n\n    return new Promise(resolve => {\n        const start = Date.now();\n\n        const tick = () => {\n            if (current) return resolve(current);\n            if (Date.now() - start >= timeout) return resolve(null);\n            setTimeout(tick, 100);\n        };\n\n        tick();\n    });\n}\n\nfunction readSocksClientRequest(client) {\n    return new Promise((resolve, reject) => {\n        let stage = 0;\n        let buffer = Buffer.alloc(0);\n\n        const cleanup = () => {\n            client.off(\"data\", onData);\n            client.off(\"error\", onError);\n            client.setTimeout(0);\n        };\n\n        const fail = e => {\n            cleanup();\n            reject(e instanceof Error ? e : new Error(String(e)));\n        };\n\n        const onError = fail;\n\n        const onData = chunk => {\n            buffer = Buffer.concat([buffer, chunk]);\n\n            if (buffer.length > 8192) {\n                fail(new Error(\"handshake SOCKS grande demais\"));\n                return;\n            }\n\n            try {\n                if (stage === 0) {\n                    if (buffer.length < 2) return;\n                    const count = buffer[1];\n                    if (buffer.length < 2 + count) return;\n\n                    client.write(Buffer.from([0x05, 0x00]));\n                    buffer = buffer.subarray(2 + count);\n                    stage = 1;\n                }\n\n                if (stage !== 1) return;\n                if (buffer.length < 5) return;\n\n                if (buffer[0] !== 0x05 || buffer[1] !== 0x01) {\n                    throw new Error(\"apenas SOCKS CONNECT suportado\");\n                }\n\n                const atyp = buffer[3];\n                let host;\n                let offset;\n\n                if (atyp === 0x01) {\n                    if (buffer.length < 10) return;\n                    host = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`;\n                    offset = 8;\n                } else if (atyp === 0x03) {\n                    const len = buffer[4];\n                    if (buffer.length < 7 + len) return;\n                    host = buffer.subarray(5, 5 + len).toString(\"utf8\");\n                    offset = 5 + len;\n                } else {\n                    throw new Error(\"ATYP não suportado\");\n                }\n\n                const port = (buffer[offset] << 8) | buffer[offset + 1];\n\n                cleanup();\n                resolve({host, port});\n            } catch (e) {\n                fail(e);\n            }\n        };\n\n        client.setTimeout(15000, () => fail(new Error(\"timeout cliente SOCKS\")));\n        client.on(\"error\", onError);\n        client.on(\"data\", onData);\n    });\n}\n\nfunction directConnect(host, port, timeout = 6000) {\n    return new Promise((resolve, reject) => {\n        const socket = trackSocket(net.connect(port, host));\n        let done = false;\n\n        const fail = error => {\n            if (done) return;\n            done = true;\n            try { socket.destroy(); } catch {}\n            reject(error instanceof Error ? error : new Error(String(error)));\n        };\n\n        socket.setTimeout(timeout, () => fail(new Error(\"timeout DIRECT\")));\n        socket.once(\"error\", fail);\n\n        socket.once(\"connect\", () => {\n            if (done) return;\n            done = true;\n            socket.setTimeout(0);\n            socket.removeListener(\"error\", fail);\n            resolve(socket);\n        });\n    });\n}\n\nasync function openDirectFallback(host, port, reason) {\n    lastGatewayViaProxy = false;\n\n    log(`FALLBACK DIRECT para ${host}:${port}: ${reason}`);\n\n    writeStatus({\n        state: \"degraded-direct\",\n        directFallback: true,\n        gatewayViaProxy: false,\n        directReason: reason,\n        directAt: new Date().toISOString()\n    });\n\n    const socket = await directConnect(host, port);\n\n    return {\n        socket,\n        viaProxy: false,\n        proxy: null\n    };\n}\n\nasync function openThroughPool(host, port) {\n    const settingsNow = readSettings();\n    const manualMode = !!String(settingsNow.manualProxy || \"\").trim();\n    const ready = await waitForExit(HOLD_GATEWAY_MS);\n\n    if (!ready) {\n        if (manualMode) {\n            const reason = \"proxy manual não ficou disponível a tempo\";\n\n            writeStatus({\n                state: \"manual-proxy-unavailable\",\n                proxyMode: \"manual-sticky\",\n                directFallback: false,\n                gatewayViaProxy: false,\n                directReason: reason\n            });\n\n            // Do NOT leak the Gateway to DIRECT when the user explicitly chose\n            // a private exit. Discord will retry this SOCKS connection.\n            throw new Error(reason);\n        }\n\n        selectPool(true).catch(error =>\n            log(`refresh após espera falhou: ${error.message}`)\n        );\n\n        return openDirectFallback(\n            host,\n            port,\n            \"nenhuma saída proxy ficou pronta a tempo\"\n        );\n    }\n\n    const ordered = [];\n\n    if (current) ordered.push(current);\n\n    if (!manualMode) {\n        for (const item of pool) {\n            if (!ordered.includes(item)) ordered.push(item);\n        }\n    }\n\n    let last = null;\n\n    for (const item of ordered) {\n        try {\n            const tunnelTimeout = manualMode ? 12000 : 6000;\n            const socket = await socks5Tunnel(\n                item.proxy,\n                host,\n                port,\n                tunnelTimeout\n            );\n\n            lastGatewayViaProxy = true;\n\n            if (current !== item) {\n                current = item;\n                log(`saída trocada para ${safeProxy(item.proxy)}`);\n            }\n\n            if (manualMode) {\n                manualHeartbeatFailures = 0;\n            }\n\n            writeStatus({\n                state: \"exit-in-use\",\n                proxyMode: manualMode ? \"manual-sticky\" : \"auto\",\n                directFallback: false,\n                gatewayViaProxy: true,\n                directReason: null,\n                manualHeartbeatFailures\n            });\n\n            return {\n                socket,\n                viaProxy: true,\n                proxy: item\n            };\n        } catch (error) {\n            last = error;\n\n            log(\n                `saída ${safeProxy(item.proxy)} falhou no tráfego vivo: ` +\n                error.message\n            );\n\n            if (manualMode) {\n                writeStatus({\n                    state: \"manual-proxy-relay-failed\",\n                    proxyMode: \"manual-sticky\",\n                    directFallback: false,\n                    gatewayViaProxy: false,\n                    directReason: error.message,\n                    manualHeartbeatFailures\n                });\n\n                // Explicit manual proxy is sticky: never switch to a public\n                // reserve and never fall back to the local/direct BR route.\n                throw error;\n            }\n\n            pool = pool.filter(x => x !== item);\n\n            if (current === item) current = null;\n        }\n    }\n\n    if (manualMode) {\n        const reason = last?.message || \"proxy manual indisponível\";\n\n        writeStatus({\n            state: \"manual-proxy-unavailable\",\n            proxyMode: \"manual-sticky\",\n            directFallback: false,\n            gatewayViaProxy: false,\n            directReason: reason\n        });\n\n        throw last || new Error(reason);\n    }\n\n    selectPool(true).catch(error =>\n        log(`refresh de pool falhou: ${error.message}`)\n    );\n\n    return openDirectFallback(\n        host,\n        port,\n        last?.message || \"pool de proxies esgotado\"\n    );\n}\n\n\nasync function openMediaSignalingThroughPool(host, port) {\n    const settingsNow = readSettings();\n    const manualMode = !!String(settingsNow.manualProxy || \"\").trim();\n\n    const ready = await waitForExit(HOLD_GATEWAY_MS);\n\n    if (!ready) {\n        const reason = \"nenhuma saída proxy pronta para sinalização de mídia\";\n\n        writeStatus({\n            mediaSignalingProxy: true,\n            mediaViaProxy: false,\n            mediaFallbackDirect: !manualMode,\n            mediaRouteError: reason\n        });\n\n        if (manualMode) {\n            throw new Error(reason);\n        }\n\n        log(`media signaling FALLBACK DIRECT ${host}:${port}: ${reason}`);\n\n        return {\n            socket: await directConnect(host, port),\n            viaProxy: false,\n            proxy: null\n        };\n    }\n\n    // Important: media signaling is NOT allowed to replace current/pool.\n    // A failed media handshake must never destabilize the healthy Gateway.\n    const ordered = [];\n\n    if (current) ordered.push(current);\n\n    for (const item of pool) {\n        if (!ordered.includes(item)) ordered.push(item);\n    }\n\n    let last = null;\n\n    for (const item of ordered) {\n        try {\n            const timeout = manualMode ? 12000 : 7000;\n\n            const socket = await socks5Tunnel(\n                item.proxy,\n                host,\n                port,\n                timeout\n            );\n\n            writeStatus({\n                mediaSignalingProxy: true,\n                mediaViaProxy: true,\n                mediaFallbackDirect: false,\n                mediaRouteError: null,\n                mediaProxy: safeProxy(item.proxy),\n                mediaCountry: item.country || null\n            });\n\n            log(\n                `media signaling roteada: ${host}:${port} -> ` +\n                `${safeProxy(item.proxy)}`\n            );\n\n            return {\n                socket,\n                viaProxy: true,\n                proxy: item\n            };\n        } catch (error) {\n            last = error;\n\n            log(\n                `media signaling: ${safeProxy(item.proxy)} falhou para ` +\n                `${host}:${port}: ${error.message}`\n            );\n        }\n    }\n\n    const reason = last?.message || \"pool de mídia esgotado\";\n\n    writeStatus({\n        mediaSignalingProxy: true,\n        mediaViaProxy: false,\n        mediaFallbackDirect: !manualMode,\n        mediaRouteError: reason\n    });\n\n    if (manualMode) {\n        // Manual/3proxy is authoritative. Do not silently reveal the media\n        // signaling to the direct BR route.\n        throw last || new Error(reason);\n    }\n\n    // Free proxies can be unreliable. Keep voice usable rather than making the\n    // whole call fail; the diagnostic will clearly show that this attempt fell\n    // back to DIRECT and therefore did not test the new route successfully.\n    log(\n        `media signaling FALLBACK DIRECT ${host}:${port}: ${reason}`\n    );\n\n    return {\n        socket: await directConnect(host, port),\n        viaProxy: false,\n        proxy: null\n    };\n}\n\nasync function handleRouterClient(client) {\n    try {\n        const request = await readSocksClientRequest(client);\n\n        if (!routedHost(request.host)) {\n            client.write(Buffer.from([0x05, 0x02, 0, 1, 0,0,0,0, 0,0]));\n            client.destroy();\n            return;\n        }\n\n        const settingsNow = readSettings();\n        const wireGuardMode =\n            String(settingsNow.networkMode || \"\").toLowerCase() ===\n            \"wireguard\";\n\n        const isMedia = mediaSignalingHost(request.host);\n\n        if (isMedia) {\n            log(`media signaling visto: ${request.host}:${request.port}`);\n        } else {\n            log(`gateway visto: ${request.host}:${request.port}`);\n        }\n\n        let route;\n\n        if (wireGuardMode) {\n            route = await openThroughWireGuard(\n                request.host,\n                request.port,\n                isMedia ? \"media-signaling\" : \"gateway\"\n            );\n        } else {\n            route = isMedia\n                ? await openMediaSignalingThroughPool(\n                    request.host,\n                    request.port\n                )\n                : await openThroughPool(\n                    request.host,\n                    request.port\n                );\n        }\n\n        const remote = route.socket;\n        const viaProxy = route.viaProxy === true;\n        const viaWireGuard = route.viaWireGuard === true;\n\n        if (!isMedia) {\n            lastGatewayViaProxy = viaProxy || viaWireGuard;\n\n            registerGatewayPair(\n                client,\n                remote,\n                viaProxy || viaWireGuard,\n                request.host\n            );\n        }\n\n        client.write(Buffer.from([0x05, 0x00, 0, 1, 127,0,0,1, 0,0]));\n        client.pipe(remote);\n        remote.pipe(client);\n\n        const tearDownRemote = () => {\n            try { client.destroy(); } catch {}\n            try { remote.destroy(); } catch {}\n        };\n\n        remote.on(\"error\", tearDownRemote);\n        client.on(\"error\", tearDownRemote);\n        remote.on(\"end\", tearDownRemote);\n        client.on(\"end\", tearDownRemote);\n\n        if (isMedia) {\n            const id = ++mediaRouteSeq;\n\n            writeStatus({\n                state: wireGuardMode\n                    ? \"media-wireguard-routed\"\n                    : \"media-signaling-routed\",\n                lastMediaHost: request.host,\n                lastMediaAt: new Date().toISOString(),\n                mediaRouteId: id,\n                mediaViaProxy: viaProxy,\n                mediaViaWireGuard: viaWireGuard,\n                mediaFallbackDirect:\n                    !viaProxy && !viaWireGuard\n            });\n\n            return;\n        }\n\n        writeStatus({\n            state: wireGuardMode\n                ? \"gateway-wireguard-routed\"\n                : \"gateway-routed\",\n            lastGatewayHost: request.host,\n            lastGatewayAt: new Date().toISOString(),\n            gatewayRouteId: gatewayRouteSeq,\n            gatewayViaProxy: viaProxy,\n            gatewayViaWireGuard: viaWireGuard,\n            directFallback:\n                !viaProxy && !viaWireGuard,\n            directReason:\n                viaProxy || viaWireGuard\n                    ? null\n                    : \"gateway atual abriu em DIRECT\",\n            gatewayTransitionCompletedAt:\n                viaProxy || viaWireGuard\n                    ? new Date().toISOString()\n                    : null\n        });\n    } catch (e) {\n        log(`router: ${e.message}`);\n\n        try {\n            client.write(Buffer.from([0x05, 0x01, 0, 1, 0,0,0,0, 0,0]));\n        } catch {}\n\n        try { client.destroy(); } catch {}\n    }\n}\n\nasync function startRouter() {\n    if (router) return router;\n\n    router = net.createServer(client => {\n        trackSocket(client);\n        handleRouterClient(client).catch(e => log(`cliente router: ${e.message}`));\n    });\n\n    await new Promise((resolve, reject) => {\n        router.once(\"error\", reject);\n        router.listen(0, \"127.0.0.1\", resolve);\n    });\n\n    routerPort = router.address().port;\n    log(`roteador local pronto em 127.0.0.1:${routerPort}`);\n\n    writeStatus({\n        state: \"router-ready\",\n        routerPort\n    });\n\n    return router;\n}\n\nfunction pacSource(fallback) {\n    return `\nfunction FindProxyForURL(url, host) {\n    host = String(host || \"\").toLowerCase();\n\n    var gateway =\n        host === \"gateway.discord.gg\" ||\n        host === \"remote-auth-gateway.discord.gg\" ||\n        (host.indexOf(\"gateway-\") === 0 && dnsDomainIs(host, \".discord.gg\"));\n\n    var media =\n        host === \"discord.media\" ||\n        dnsDomainIs(host, \".discord.media\");\n\n    if (gateway || media) {\n        return \"SOCKS5 127.0.0.1:${routerPort}\";\n    }\n\n    return ${JSON.stringify(fallback)};\n}\n`.trim();\n}\n\nasync function installPac() {\n    let fallback = \"DIRECT\";\n\n    try {\n        const system = await session.defaultSession.resolveProxy(\n            \"https://discord.com\"\n        );\n\n        if (typeof system === \"string\" && system.trim()) {\n            fallback = system.trim();\n        }\n    } catch (e) {\n        log(`não consegui ler proxy do sistema: ${e.message}`);\n    }\n\n    const source = pacSource(fallback);\n    const url = \"data:application/x-ns-proxy-autoconfig;base64,\"\n        + Buffer.from(source, \"utf8\").toString(\"base64\");\n\n    await session.defaultSession.setProxy({\n        mode: \"pac_script\",\n        pacScript: url\n    });\n\n    const checks = await Promise.all([\n        session.defaultSession.resolveProxy(\n            \"https://gateway.discord.gg\"\n        ),\n        session.defaultSession.resolveProxy(\n            \"https://gateway-us-east1-b.discord.gg\"\n        ),\n        session.defaultSession.resolveProxy(\n            \"https://voice-test.discord.media\"\n        ),\n        session.defaultSession.resolveProxy(\n            \"https://discord.com\"\n        )\n    ]);\n\n    const gatewayOk =\n        checks[0].includes(String(routerPort)) &&\n        checks[1].includes(String(routerPort));\n\n    const mediaOk =\n        checks[2].includes(String(routerPort));\n\n    if (!gatewayOk || !mediaOk) {\n        await session.defaultSession.setProxy({mode: \"system\"});\n\n        throw new Error(\n            `PAC local não foi aplicada: ${checks.join(\" | \")}`\n        );\n    }\n\n    const settingsNow = readSettings();\n    const wgMode =\n        String(settingsNow.networkMode || \"\").toLowerCase() ===\n        \"wireguard\";\n\n    log(\n        wgMode\n            ? `PAC local ativa: Gateway + *.discord.media -> ` +\n              `router 127.0.0.1:${routerPort} -> WireGuard`\n            : `PAC nativa ativa: gateway + *.discord.media -> ` +\n              `127.0.0.1:${routerPort}; resto -> ${fallback}`\n    );\n\n    writeStatus({\n        state: \"pac-active\",\n        pacActive: true,\n        pacPurpose: wgMode ? \"wireguard-route-coordinator\" : \"proxy\",\n        resolveGateway: checks[0],\n        resolveRegionalGateway: checks[1],\n        resolveMediaSignaling: checks[2],\n        resolveDiscordCom: checks[3]\n    });\n}\n\n\nasync function forceGatewayReconnectAfterWireGuardReady() {\n    if (!wireGuardManagerReady()) {\n        writeStatus({\n            state: \"wireguard-not-ready\",\n            wireGuardReady: false,\n            directFallback: false,\n            directReason: \"WireGuard manager não está pronto\"\n        });\n\n        return false;\n    }\n\n    touchRouteTarget(\"gateway.discord.gg\", \"startup-gateway\");\n    touchRouteTarget(\n        \"remote-auth-gateway.discord.gg\",\n        \"startup-gateway\"\n    );\n\n    const ready = await waitForRouteTarget(\n        \"gateway.discord.gg\",\n        8000\n    );\n\n    if (!ready) {\n        writeStatus({\n            state: \"wireguard-route-not-ready\",\n            wireGuardReady: false,\n            directFallback: false,\n            directReason:\n                \"rota do gateway não ficou pronta\"\n        });\n\n        return false;\n    }\n\n    try {\n        await session.defaultSession.closeAllConnections();\n\n        log(\n            \"WireGuard pronto; conexões Chromium fechadas para \" +\n            \"renegociar Gateway/media pelo túnel\"\n        );\n\n        writeStatus({\n            state: \"wireguard-ready-reconnecting\",\n            wireGuardReady: true,\n            gatewayViaWireGuard: null,\n            directFallback: false,\n            directReason: null\n        });\n\n        return true;\n    } catch (e) {\n        log(`closeAllConnections WireGuard falhou: ${e.message}`);\n        return false;\n    }\n}\n\nasync function forceGatewayReconnectAfterProxyReady() {\n    if (!current) {\n        writeStatus({\n            state: \"degraded-direct\",\n            directFallback: true,\n            directReason: \"nenhuma proxy validada; conexão atual não será derrubada\"\n        });\n        return false;\n    }\n\n    try {\n        const closedDirect = closeDirectGatewayPairs(\n            \"proxy pronta no boot\"\n        );\n\n        await session.defaultSession.closeAllConnections();\n\n        log(\n            `proxy pronta (${current.country}); DIRECT fechados=${closedDirect}; ` +\n            \"aguardando Gateway reconectar pela saída validada\"\n        );\n\n        lastGatewayViaProxy = false;\n\n        writeStatus({\n            state: \"proxy-ready-reconnecting\",\n            directFallback: false,\n            gatewayViaProxy: null,\n            directReason: null,\n            country: current.country,\n            proxy: safeProxy(current.proxy),\n            ms: current.ms\n        });\n\n        return true;\n    } catch (e) {\n        log(`closeAllConnections falhou: ${e.message}`);\n        return false;\n    }\n}\n\nasync function heartbeat() {\n    if (shuttingDown) return;\n\n    const settingsNow = readSettings();\n    const manualMode = !!String(settingsNow.manualProxy || \"\").trim();\n\n    if (!current) {\n        try {\n            await selectPool(true);\n        } catch (error) {\n            log(`heartbeat sem saída: ${error.message}`);\n\n            writeStatus({\n                state: manualMode\n                    ? \"manual-proxy-waiting\"\n                    : \"degraded-direct\",\n                proxyMode: manualMode ? \"manual-sticky\" : \"auto\",\n                proxyAttempt: selectionAttempt,\n                proxySelectionError: error.message,\n                directFallback: manualMode ? false : true\n            });\n        }\n\n        return;\n    }\n\n    try {\n        // A private 3proxy may occasionally answer a probe slowly even while\n        // the live Gateway tunnel is healthy. Give it more time than a free\n        // public exit before calling the telemetry probe unhealthy.\n        const heartbeatTimeout = manualMode ? 12000 : PROBE_TIMEOUT;\n        const ms = await tlsProbe(\n            current.proxy,\n            \"gateway.discord.gg\",\n            heartbeatTimeout\n        );\n\n        current.ms = ms;\n        streamHeartbeatFailures = 0;\n\n        if (manualMode) {\n            manualHeartbeatFailures = 0;\n        }\n\n        writeStatus({\n            state: \"healthy\",\n            proxyMode: manualMode ? \"manual-sticky\" : \"auto\",\n            heartbeatMs: ms,\n            manualHeartbeatFailures\n        });\n    } catch (error) {\n        if (manualMode) {\n            manualHeartbeatFailures++;\n\n            log(\n                `proxy manual: heartbeat falhou ${manualHeartbeatFailures}x: ` +\n                error.message\n            );\n\n            writeStatus({\n                state: manualHeartbeatFailures >= 2\n                    ? \"manual-proxy-suspect\"\n                    : \"manual-proxy-heartbeat-warning\",\n                proxyMode: \"manual-sticky\",\n                manualHeartbeatFailures,\n                lastHeartbeatError: error.message,\n                directFallback: false\n            });\n\n            // Critical v1.7.4 behavior: a health-probe failure no longer\n            // destroys/replaces a live manual Gateway. That reconnection was\n            // capable of leaving Discord's media engine stuck in loading.\n            return;\n        }\n\n        if (activeNativeStream()) {\n            streamHeartbeatFailures++;\n\n            log(\n                `heartbeat durante Live falhou ${streamHeartbeatFailures}/2: ` +\n                error.message\n            );\n\n            writeStatus({\n                state: \"stream-heartbeat-warning\",\n                streamHeartbeatFailures,\n                lastHeartbeatError: error.message\n            });\n\n            if (streamHeartbeatFailures < 2) {\n                log(\n                    \"Live nativa ativa: ignorando uma falha isolada para \" +\n                    \"não provocar reconexão do Gateway\"\n                );\n                return;\n            }\n        }\n\n        log(`heartbeat derrubou ${safeProxy(current.proxy)}: ${error.message}`);\n\n        streamHeartbeatFailures = 0;\n        pool = pool.filter(x => x !== current);\n        current = pool[0] || null;\n\n        if (!current) {\n            try {\n                await selectPool(true);\n            } catch (refreshError) {\n                log(`não consegui repor pool: ${refreshError.message}`);\n            }\n        }\n\n        writeStatus({state: \"exit-degraded\"});\n    }\n}\n\nconst SELF_HOOK_BEGIN = \"/* GoLiveBypassBD:NATIVE-HOOK:BEGIN */\";\nconst SELF_HOOK_END = \"/* GoLiveBypassBD:NATIVE-HOOK:END */\";\n\nfunction stripSelfMarker(content) {\n    const begin = content.indexOf(SELF_HOOK_BEGIN);\n    if (begin < 0) return content;\n\n    const end = content.indexOf(SELF_HOOK_END, begin);\n    if (end < 0) return content;\n\n    return content.slice(0, begin)\n        + content.slice(end + SELF_HOOK_END.length).replace(/^\\r?\\n/, \"\");\n}\n\nfunction selfMarkerBlock() {\n    return [\n        SELF_HOOK_BEGIN,\n        \"try { require(\" + JSON.stringify(__filename) + \"); }\",\n        \"catch (e) { console.error('[GoLiveBypassBD/native-hook]', e); }\",\n        SELF_HOOK_END,\n        \"\"\n    ].join(\"\\n\");\n}\n\nfunction repairOwnInjection() {\n    const settings = readSettings();\n    const coreIndex = String(settings.coreIndex || \"\").trim();\n\n    if (!coreIndex) {\n        writeStatus({\n            injectionPersistent: false,\n            injectionReason: \"coreIndex ausente no settings.json\"\n        });\n        return false;\n    }\n\n    try {\n        if (!fs.existsSync(coreIndex)) {\n            writeStatus({\n                injectionPersistent: false,\n                injectionReason: \"coreIndex não existe: \" + coreIndex\n            });\n            return false;\n        }\n\n        const original = fs.readFileSync(coreIndex, \"utf8\");\n\n        const escapedSelfPath = JSON.stringify(__filename);\n\n        if (\n            original.includes(SELF_HOOK_BEGIN) &&\n            original.includes(SELF_HOOK_END) &&\n            original.includes(escapedSelfPath)\n        ) {\n            writeStatus({\n                injectionPersistent: true,\n                injectionPath: coreIndex,\n                injectionReason: null\n            });\n            return true;\n        }\n\n        const clean = stripSelfMarker(original);\n        const wanted = selfMarkerBlock() + clean;\n\n        fs.writeFileSync(coreIndex, wanted, \"utf8\");\n\n        const verify = fs.readFileSync(coreIndex, \"utf8\");\n        const ok = verify.includes(SELF_HOOK_BEGIN)\n            && verify.includes(SELF_HOOK_END)\n            && verify.includes(escapedSelfPath);\n\n        writeStatus({\n            injectionPersistent: ok,\n            injectionPath: coreIndex,\n            injectionReason: ok ? null : \"verificação após write falhou\"\n        });\n\n        if (ok) {\n            log(`injeção persistente reparada em ${coreIndex}`);\n        }\n\n        return ok;\n    } catch (e) {\n        log(`self-heal da injeção falhou: ${e.message}`);\n\n        writeStatus({\n            injectionPersistent: false,\n            injectionPath: coreIndex,\n            injectionReason: e.message\n        });\n\n        return false;\n    }\n}\n\nasync function start() {\n    mkdir();\n\n    const settings = readSettings();\n    const wireGuardMode =\n        String(settings.networkMode || \"\").toLowerCase() ===\n        \"wireguard\";\n\n    log(\"--- main hook v1.7.4 carregado ---\");\n\n    writeStatus({\n        state: \"hook-loaded\",\n        hookLoaded: true,\n        enabled: settings.enabled !== false,\n        electron: process.versions.electron || null,\n        networkMode: wireGuardMode ? \"wireguard\" : \"legacy-proxy\",\n        directFallback: false,\n        gatewayRouteId: 0,\n        gatewayTransitionId: null,\n        gatewayTransitionAt: null,\n        gatewayTransitionCompletedAt: null,\n        lastGatewayHost: null,\n        lastGatewayAt: null,\n        streamHeartbeatFailures: 0,\n        voicePreloadRegistered: false,\n        voicePreloadError: null,\n        mediaRouteId: 0,\n        mediaViaProxy: null,\n        mediaViaWireGuard: null,\n        mediaFallbackDirect: false,\n        lastMediaHost: null,\n        lastMediaAt: null,\n        wireGuardReady: false\n    });\n\n    registerVoicePreload();\n\n    if (settings.enabled === false) {\n        log(\"hook desativado pelas configurações\");\n        return;\n    }\n\n    await startRouter();\n\n    if (wireGuardMode) {\n        log(\n            \"modo WireGuard: proxy pública/Tor/SOCKS remoto desativados\"\n        );\n\n        touchRouteTarget(\n            \"gateway.discord.gg\",\n            \"startup-gateway\"\n        );\n\n        touchRouteTarget(\n            \"remote-auth-gateway.discord.gg\",\n            \"startup-gateway\"\n        );\n\n        const started = Date.now();\n\n        while (\n            !wireGuardManagerReady() &&\n            Date.now() - started < 15000\n        ) {\n            await sleep(250);\n        }\n\n        if (!wireGuardManagerReady()) {\n            const wg = readWireGuardStatus();\n\n            log(\n                \"WireGuard não ficou pronto; mantendo proxy do sistema: \" +\n                (wg?.lastError || \"status indisponível\")\n            );\n\n            try {\n                await session.defaultSession.setProxy({mode: \"system\"});\n            } catch {}\n\n            writeStatus({\n                state: \"wireguard-not-ready\",\n                pacActive: false,\n                wireGuardReady: false,\n                wireGuardManagerError: wg?.lastError || null,\n                directFallback: false,\n                directReason:\n                    \"WireGuard não está pronto; bypass de rede não iniciado\"\n            });\n\n            return;\n        }\n\n        try {\n            await installPac();\n        } catch (e) {\n            log(`PAC local WireGuard falhou: ${e.message}`);\n\n            try {\n                await session.defaultSession.setProxy({mode: \"system\"});\n            } catch {}\n\n            writeStatus({\n                state: \"wireguard-pac-error\",\n                pacActive: false,\n                wireGuardReady: true,\n                directFallback: false,\n                directReason: e.message\n            });\n\n            return;\n        }\n\n        await forceGatewayReconnectAfterWireGuardReady();\n\n        clearNativeTimers();\n\n        startupRepairTimer = setTimeout(() => {\n            startupRepairTimer = null;\n            repairOwnInjection();\n        }, 5000);\n\n        heartbeatTimer = setInterval(() => {\n            wireGuardHeartbeat().catch(\n                e => log(`WireGuard heartbeat: ${e.message}`)\n            );\n        }, 3000);\n\n        repairTimer = setInterval(() => {\n            repairOwnInjection();\n        }, 60000);\n\n        return;\n    }\n\n    // Legacy compatibility only. UI v1.7.4 no longer exposes this mode.\n    const selectionPromise = selectPool()\n        .then(result => result)\n        .catch(e => {\n            log(`seleção inicial falhou: ${e.message}`);\n\n            writeStatus({\n                state: \"degraded-direct\",\n                directFallback: true,\n                directReason: e.message,\n                error: e.message\n            });\n\n            return null;\n        });\n\n    try {\n        await installPac();\n    } catch (e) {\n        log(`PAC não pôde ser instalada: ${e.message}`);\n\n        try {\n            await session.defaultSession.setProxy({mode: \"system\"});\n        } catch {}\n\n        return;\n    }\n\n    const selected = await selectionPromise;\n\n    if (selected && current) {\n        await forceGatewayReconnectAfterProxyReady();\n    }\n\n    clearNativeTimers();\n\n    startupRepairTimer = setTimeout(() => {\n        startupRepairTimer = null;\n        repairOwnInjection();\n    }, 5000);\n\n    heartbeatTimer = setInterval(() => {\n        heartbeat().catch(\n            e => log(`heartbeat interno: ${e.message}`)\n        );\n    }, HEARTBEAT_MS);\n\n    repairTimer = setInterval(() => {\n        repairOwnInjection();\n    }, 60000);\n}\n\nfunction begin() {\n    if (globalThis[NATIVE_SINGLETON_KEY]) {\n        log(\"hook nativo já estava ativo neste processo; ignorando segunda inicialização\");\n        return;\n    }\n\n    globalThis[NATIVE_SINGLETON_KEY] = true;\n\n    start().catch(e => {\n        log(`FATAL: ${e.stack || e.message}`);\n        writeStatus({\n            state: \"fatal\",\n            error: e.message\n        });\n    });\n}\n\napp.once(\"before-quit\", () => {\n    shuttingDown = true;\n\n    clearNativeTimers();\n    destroyActiveSockets();\n\n    for (const pair of [...activeGatewayPairs]) {\n        try { pair.client.destroy(); } catch {}\n        try { pair.remote.destroy(); } catch {}\n    }\n    activeGatewayPairs.clear();\n\n    try { router?.close(); } catch {}\n    router = null;\n\n    globalThis[NATIVE_SINGLETON_KEY] = false;\n});\n\n// This module is loaded by discord_desktop_core very early.\nif (app.isReady()) {\n    begin();\n} else {\n    app.once(\"ready\", begin);\n}\n";

module.exports = class GoLiveBypassBD {
    constructor() {
        this.api = new BdApi("GoLiveBypassBD");

        this.settings = Object.assign({
            enabled: true,
            excludedCountries: "BR",
            manualProxy: "",
            networkMode: "wireguard",
            wireGuardConfigured: false,
            voiceRegion: "",
            autoRecoverVideo: true,
            autoRecoverViewer: false,
            forceViewerVideoSupported: true,
            autoUpdate: true,
            autoInstallUpdates: false
        }, this.api.Data.load("settings") || {});

        this.videoGuardTarget = null;
        this.originalVariations = null;
        this.videoGuardOriginals = [];
        this.videoGuardDefinitionsPatched = 0;
        this.mediaGateFallbackInstalled = false;
        this.originalApexGetServerAssignment = null;
        this.lastServerAssignment = null;
        this.sessionVerdict = "ainda não verificado";
        this.videoGuardPatchMode = "não aplicado";
        this.regionOriginals = null;
        this.lastCoreIndex = null;
        this.lastDiscoveryMethod = null;
        this.lastDiscoveryScore = null;

        this._stopped = false;
        this._timeouts = new Set();
        this._updateInterval = null;
        this._checkingUpdate = false;
        this._updateStatus = "aguardando";
        this._latestVersion = PLUGIN_VERSION;
        this._updateAvailableVersion = null;
        this._lastUpdateCheckAt = null;
        this._serverProxyWaitChecks = 0;
        this._serverProxyWaitScheduled = false;
        this._rendererDiagnosticsInstalled = false;
    }

    schedule(callback, delay) {
        const id = setTimeout(() => {
            this._timeouts.delete(id);

            if (this._stopped) return;

            try {
                callback();
            } catch (e) {
                this.api.Logger.error("Erro em tarefa agendada", e);
            }
        }, delay);

        this._timeouts.add(id);
        return id;
    }

    clearRuntimeTimers() {
        for (const id of this._timeouts) {
            try { clearTimeout(id); } catch {}
        }

        this._timeouts.clear();

        if (this._updateInterval) {
            try { clearInterval(this._updateInterval); } catch {}
            this._updateInterval = null;
        }
    }

    start() {
        this._stopped = false;
        this._serverProxyWaitChecks = 0;
        this._serverProxyWaitScheduled = false;
        this.clearRuntimeTimers();
        this.saveSettingsAndNativeConfig();

        if (this.settings.enabled) {
            this.installVideoGuardPatch();
        }

        this.installRegionOverride();

        // Atualiza o hook no disco sem reiniciar à força.
        // A próxima abertura/reinício passa a usar a versão atual.
        try {
            this.ensureNativeHookFiles();
        } catch (e) {
            this.api.Logger.warn("Não consegui preparar hook nativo automaticamente", e);
        }

        this.schedule(() => {
            const status = this.readNativeStatus();

            if (status?.pacActive) {
                BdApi.UI.showToast(
                    `Go Live De Queijo: proxy nativa ativa${status.current?.country ? " (" + status.current.country + ")" : ""}.`,
                    {type: "success", timeout: 5000}
                );
            }
        }, 1200);

        // The server-side experiment is evaluated shortly after CONNECTION_OPEN.
        // Verify the REAL assignment after it settles and, if necessary, reload
        // the renderer while the already-tested proxy remains active.
        this.schedule(() => {
            this.verifyServerSessionAndRetry();
        }, 1800);

        this.installRendererDiagnostics();

        this.schedule(() => {
            const nativeStatus = this.readNativeStatus();
            const runtimeVersion = String(nativeStatus?.version || "");

            if (
                nativeStatus?.hookLoaded &&
                runtimeVersion &&
                runtimeVersion !== PLUGIN_VERSION &&
                !this.hasActiveStreamMedia()
            ) {
                const key = `nativeRuntimeRestartedFor-${PLUGIN_VERSION}`;

                if (!this.api.Data.load(key)) {
                    this.api.Data.save(key, true);

                    BdApi.UI.showToast(
                        `Go Live: ativando hook nativo ${PLUGIN_VERSION}; reiniciando Discord uma vez...`,
                        {type: "info", timeout: 6500}
                    );

                    this.schedule(() => {
                        this.restartDiscord().catch(e => {
                            this.api.Logger.error("Falha no relaunch nativo", e);
                        });
                    }, 1200);
                }
            }
        }, 2500);

        this.startAutoUpdater();
    }

    stop() {
        this._stopped = true;
        this.clearRuntimeTimers();

        try { this.api.Patcher.unpatchAll(); } catch {}

        this.restoreVideoGuardPatch();
        this.restoreRegionOverride();

        this.originalApexGetServerAssignment = null;
        this.lastServerAssignment = null;
        this._rendererDiagnosticsInstalled = false;
    }

    get localAppData() {
        try {
            const native = window.DiscordNative?.process?.env?.LOCALAPPDATA;
            if (typeof native === "string" && native.trim()) return native;
        } catch {}

        // %APPDATA%\BetterDiscord\plugins -> %LOCALAPPDATA%
        try {
            return path.resolve(BdApi.Plugins.folder, "..", "..", "..", "Local");
        } catch {
            return null;
        }
    }

    get dataDir() {
        const base = this.localAppData;
        if (!base) throw new Error("LOCALAPPDATA não pôde ser resolvido.");
        return path.join(base, "GoLiveBypassBD");
    }

    get hookPath() {
        return path.join(this.dataDir, "main-hook.js");
    }

    get nativeSettingsPath() {
        return path.join(this.dataDir, "settings.json");
    }

    get nativeStatusPath() {
        return path.join(this.dataDir, "native-status.json");
    }

    get nativeLogPath() {
        return path.join(this.dataDir, "native.log");
    }

    get rendererLogPath() {
        return path.join(this.dataDir, "renderer.log");
    }

    get voiceCommandPath() {
        return path.join(this.dataDir, "voice-command.json");
    }

    get wireGuardStatusPath() {
        return path.join(this.dataDir, "wg-route-status.json");
    }

    get wireGuardManagerPath() {
        return path.join(this.dataDir, "wg-manager.ps1");
    }

    get wireGuardBootstrapPath() {
        return path.join(this.dataDir, "wg-bootstrap.ps1");
    }

    get wireGuardManagedConfigPath() {
        return path.join(this.dataDir, "GLQVPN.conf");
    }

    get wireGuardLogPath() {
        return path.join(this.dataDir, "wireguard.log");
    }

    saveSettingsAndNativeConfig() {
        this.api.Data.save("settings", this.settings);

        try {
            fs.mkdirSync(this.dataDir, {recursive: true});
            fs.writeFileSync(
                this.nativeSettingsPath,
                JSON.stringify({
                    enabled: !!this.settings.enabled,
                    excludedCountries: String(this.settings.excludedCountries || "BR"),
                    manualProxy: "",
                    networkMode: "wireguard",
                    wireGuardConfigured: this.settings.wireGuardConfigured === true,
                    autoRecoverVideo: this.settings.autoRecoverVideo !== false,
                    autoRecoverViewer: false,
                    forceViewerVideoSupported: true,
                    mediaSignalingProxy: false,
                    coreIndex: this.lastCoreIndex || null,
                    hookPath: this.hookPath
                }, null, 2),
                "utf8"
            );
        } catch (e) {
            this.api.Logger.error("Falha ao gravar config nativa", e);
        }
    }

    readNativeStatus() {
        try {
            return JSON.parse(fs.readFileSync(this.nativeStatusPath, "utf8"));
        } catch {
            return null;
        }
    }

    getBetterDiscordPluginsFolder() {
        const candidates = [];

        try {
            if (BdApi?.Plugins?.folder) {
                candidates.push(String(BdApi.Plugins.folder));
            }
        } catch {}

        if (process.platform === "win32" && process.env.APPDATA) {
            candidates.push(
                path.join(
                    process.env.APPDATA,
                    "BetterDiscord",
                    "plugins"
                )
            );
        }

        try {
            if (
                typeof __filename === "string" &&
                __filename &&
                !__filename.startsWith("betterdiscord://")
            ) {
                candidates.push(path.dirname(__filename));
            }
        } catch {}

        for (const candidate of candidates) {
            try {
                const resolved = path.resolve(candidate);

                if (
                    fs.existsSync(resolved) &&
                    fs.statSync(resolved).isDirectory()
                ) {
                    return resolved;
                }
            } catch {}
        }

        throw new Error(
            "Não consegui localizar a pasta de plugins do BetterDiscord."
        );
    }

    findWireGuardConfigInPluginsFolder() {
        const folder = this.getBetterDiscordPluginsFolder();

        const priorityNames = [
            "GoLiveDeQueijo.conf",
            "ProtonVPN.conf",
            "Proton.conf",
            "wireguard.conf",
            "wg.conf"
        ];

        // Primeiro tenta nomes conhecidos diretamente. Isso evita depender de
        // readdirSync(..., {withFileTypes:true}), que em algumas versões do
        // BetterDiscord devolve strings em vez de fs.Dirent.
        for (const preferred of priorityNames) {
            const candidate = path.join(
                folder,
                preferred
            );

            try {
                if (
                    fs.existsSync(candidate) &&
                    fs.statSync(candidate).isFile()
                ) {
                    this.validateWireGuardConfig(
                        candidate
                    );

                    return candidate;
                }
            } catch {}
        }

        let entries = [];

        try {
            entries = fs.readdirSync(folder);
        } catch (e) {
            throw new Error(
                `Não consegui ler a pasta de plugins: ${e.message}`
            );
        }

        const configs = [];

        for (const rawEntry of entries) {
            // Compatível tanto com string quanto com Dirent.
            const name =
                typeof rawEntry === "string"
                    ? rawEntry
                    : rawEntry?.name;

            if (
                !name ||
                !String(name)
                    .toLowerCase()
                    .endsWith(".conf")
            ) {
                continue;
            }

            const full = path.join(
                folder,
                String(name)
            );

            try {
                if (
                    fs.existsSync(full) &&
                    fs.statSync(full).isFile()
                ) {
                    configs.push(full);
                }
            } catch {}
        }

        if (!configs.length) {
            // Ajuda no caso comum do Windows esconder extensão e o arquivo
            // acabar salvo como ".conf.txt".
            const confTxt = [];

            for (const rawEntry of entries) {
                const name =
                    typeof rawEntry === "string"
                        ? rawEntry
                        : rawEntry?.name;

                if (
                    name &&
                    String(name)
                        .toLowerCase()
                        .endsWith(".conf.txt")
                ) {
                    confTxt.push(String(name));
                }
            }

            const hint = confTxt.length
                ? "\n\nATENÇÃO: encontrei arquivo(s) com .conf.txt:\n" +
                  confTxt.join("\n") +
                  "\nRenomeie removendo o .txt."
                : "";

            throw new Error(
                "Nenhum arquivo .conf foi encontrado na pasta de plugins do BetterDiscord.\n\n" +
                `Pasta detectada:\n${folder}\n\n` +
                "Nome recomendado:\nGoLiveDeQueijo.conf" +
                hint
            );
        }

        configs.sort((a, b) =>
            path.basename(a).localeCompare(
                path.basename(b)
            )
        );

        const invalid = [];

        for (const file of configs) {
            try {
                this.validateWireGuardConfig(
                    file
                );

                return file;
            } catch (e) {
                invalid.push(
                    `${path.basename(file)}: ${e.message}`
                );
            }
        }

        throw new Error(
            "Encontrei arquivo(s) .conf na pasta de plugins, mas nenhum passou na validação WireGuard.\n\n" +
            invalid.join("\n")
        );
    }

    readWireGuardStatus() {
        try {
            return JSON.parse(
                fs.readFileSync(
                    this.wireGuardStatusPath,
                    "utf8"
                )
            );
        } catch {
            return null;
        }
    }

    execFileAsync(file, args, options = {}) {
        return new Promise((resolve, reject) => {
            childProcess.execFile(
                file,
                args,
                Object.assign({
                    windowsHide: true,
                    encoding: "utf8",
                    maxBuffer: 2 * 1024 * 1024
                }, options),
                (error, stdout, stderr) => {
                    if (error) {
                        error.stdout = stdout;
                        error.stderr = stderr;
                        reject(error);
                        return;
                    }

                    resolve({
                        stdout: stdout || "",
                        stderr: stderr || ""
                    });
                }
            );
        });
    }

    validateWireGuardConfig(file) {
        const resolved = path.resolve(String(file || ""));

        if (!fs.existsSync(resolved)) {
            throw new Error("arquivo .conf não existe");
        }

        const text = fs.readFileSync(resolved, "utf8");

        const required = [
            /^\s*\[Interface\]\s*$/mi,
            /^\s*PrivateKey\s*=\s*\S+/mi,
            /^\s*\[Peer\]\s*$/mi,
            /^\s*PublicKey\s*=\s*\S+/mi,
            /^\s*Endpoint\s*=\s*\S+/mi
        ];

        for (const pattern of required) {
            if (!pattern.test(text)) {
                throw new Error(
                    "config WireGuard incompleta; faltou um campo obrigatório"
                );
            }
        }

        const peers = (
            text.match(/^\s*\[Peer\]\s*$/gmi) || []
        ).length;

        if (peers !== 1) {
            throw new Error(
                "v1.7.4 aceita exatamente 1 [Peer] por configuração"
            );
        }

        return text;
    }

    buildManagedWireGuardConfig(sourceFile) {
        const original = this.validateWireGuardConfig(sourceFile);

        const lines = original
            .replace(/\r\n/g, "\n")
            .split("\n");

        const out = [];
        let section = "";
        let peerAllowedWritten = false;
        let peerKeepaliveWritten = false;
        let interfaceTableWritten = false;

        const flushPeerDefaults = () => {
            if (section !== "peer") return;

            if (!peerAllowedWritten) {
                out.push("AllowedIPs = 0.0.0.0/0, ::/0");
                peerAllowedWritten = true;
            }

            if (!peerKeepaliveWritten) {
                out.push("PersistentKeepalive = 25");
                peerKeepaliveWritten = true;
            }
        };

        for (const raw of lines) {
            const line = raw.trim();

            if (/^\[Interface\]$/i.test(line)) {
                flushPeerDefaults();
                section = "interface";
                out.push("[Interface]");
                continue;
            }

            if (/^\[Peer\]$/i.test(line)) {
                if (
                    section === "interface" &&
                    !interfaceTableWritten
                ) {
                    out.push("Table = off");
                    interfaceTableWritten = true;
                }

                flushPeerDefaults();
                section = "peer";
                peerAllowedWritten = false;
                peerKeepaliveWritten = false;
                out.push("");
                out.push("[Peer]");
                continue;
            }

            if (
                section === "interface" &&
                /^(Table|DNS|PreUp|PostUp|PreDown|PostDown)\s*=/i.test(line)
            ) {
                // Table=off is managed by us. DNS/scripts are removed so this
                // tunnel does not change the rest of the PC.
                continue;
            }

            if (
                section === "peer" &&
                /^AllowedIPs\s*=/i.test(line)
            ) {
                if (!peerAllowedWritten) {
                    out.push("AllowedIPs = 0.0.0.0/0, ::/0");
                    peerAllowedWritten = true;
                }

                continue;
            }

            if (
                section === "peer" &&
                /^PersistentKeepalive\s*=/i.test(line)
            ) {
                if (!peerKeepaliveWritten) {
                    out.push("PersistentKeepalive = 25");
                    peerKeepaliveWritten = true;
                }

                continue;
            }

            // Never carry arbitrary executable hooks from a custom config.
            if (
                /^(PreUp|PostUp|PreDown|PostDown)\s*=/i.test(line)
            ) {
                continue;
            }

            out.push(raw);
        }

        if (
            section === "interface" &&
            !interfaceTableWritten
        ) {
            out.push("Table = off");
        }

        flushPeerDefaults();

        let text = out.join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim() + "\n";

        // Table=off disables WireGuard for Windows automatic routes. AllowedIPs
        // remains full so the peer accepts every dynamically selected Discord IP;
        // our elevated route manager decides which destinations actually use it.
        if (!/^\s*Table\s*=\s*off\s*$/mi.test(text)) {
            text = text.replace(
                /^\s*\[Interface\]\s*$/mi,
                "[Interface]\nTable = off"
            );
        }

        return text;
    }

    writeWireGuardSupportFiles() {
        fs.mkdirSync(this.dataDir, {recursive: true});

        const sourcePath =
            this.findWireGuardConfigInPluginsFolder();

        const managed = this.buildManagedWireGuardConfig(
            sourcePath
        );

        this.api.Logger.info(
            `WireGuard .conf detectado automaticamente: ${sourcePath}`
        );

        fs.writeFileSync(
            this.wireGuardManagedConfigPath,
            managed,
            "utf8"
        );

        fs.writeFileSync(
            this.wireGuardManagerPath,
            WG_MANAGER_PS1_SOURCE,
            "utf8"
        );

        fs.writeFileSync(
            this.wireGuardBootstrapPath,
            WG_BOOTSTRAP_PS1_SOURCE,
            "utf8"
        );
    }

    async runWireGuardBootstrap() {
        this.writeWireGuardSupportFiles();

        const escaped = this.wireGuardBootstrapPath
            .replace(/'/g, "''");

        const command = [
            "$p = Start-Process",
            "-FilePath 'powershell.exe'",
            "-Verb RunAs",
            "-ArgumentList @(",
            "'-NoProfile',",
            "'-ExecutionPolicy','Bypass',",
            `'-File','${escaped}'`,
            ")",
            "-Wait -PassThru;",
            "exit $p.ExitCode"
        ].join(" ");

        BdApi.UI.showToast(
            "Preparando WireGuard. Confirme a janela do Windows (UAC)...",
            {type: "info", timeout: 10000}
        );

        await this.execFileAsync(
            "powershell.exe",
            [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command
            ],
            {windowsHide: false, timeout: 120000}
        );

        const started = Date.now();

        while (Date.now() - started < 20000) {
            const status = this.readWireGuardStatus();

            if (
                status?.managerRunning &&
                status?.tunnelUp
            ) {
                this.settings.networkMode = "wireguard";
                this.settings.wireGuardConfigured = true;
                this.saveSettingsAndNativeConfig();

                return status;
            }

            if (
                status?.bootstrapOk === false &&
                status?.lastError
            ) {
                throw new Error(status.lastError);
            }

            await new Promise(
                resolve => setTimeout(resolve, 500)
            );
        }

        const status = this.readWireGuardStatus();

        throw new Error(
            status?.lastError ||
            "WireGuard não ficou pronto em 20 segundos"
        );
    }

    async ensureWireGuardReady() {
        if (process.platform !== "win32") {
            throw new Error(
                "WireGuard automático da v1.7.4 suporta Windows"
            );
        }

        // O .conf é procurado automaticamente na própria pasta de plugins
        // do BetterDiscord. Reaplica sempre no install/update para manter
        // helper/config gerenciada sincronizados com a versão do plugin.
        this.findWireGuardConfigInPluginsFolder();

        return this.runWireGuardBootstrap();
    }

    // ---------------------------------------------------------------------
    // Locate BetterDiscord's discord_desktop_core injection point.
    // ---------------------------------------------------------------------

    parseAppVersion(name) {
        const m = /^app-(.+)$/i.exec(name);
        if (!m) return [0];

        return m[1]
            .split(".")
            .map(v => Number(v.replace(/\D.*/, "")) || 0);
    }

    compareVersionNames(a, b) {
        const av = this.parseAppVersion(a);
        const bv = this.parseAppVersion(b);
        const n = Math.max(av.length, bv.length);

        for (let i = 0; i < n; i++) {
            const x = av[i] || 0;
            const y = bv[i] || 0;
            if (x !== y) return y - x;
        }

        return b.localeCompare(a);
    }

    get roamingAppData() {
        try {
            // %APPDATA%\BetterDiscord\plugins -> %APPDATA%
            return path.resolve(BdApi.Plugins.folder, "..", "..");
        } catch {
            return null;
        }
    }

    candidateDiscordRoots() {
        const roots = [];
        const push = value => {
            if (!value || typeof value !== "string") return;
            const normalized = path.normalize(value);
            if (!roots.includes(normalized)) roots.push(normalized);
        };

        try {
            const exe = window.DiscordNative?.app?.getPath?.("exe")
                || window.DiscordNative?.remoteApp?.getPath?.("exe");

            if (typeof exe === "string" && exe) {
                const appDir = path.dirname(exe);      // ...\Discord\app-X
                const root = path.dirname(appDir);     // ...\Discord
                push(root);
                push(appDir);
            }
        } catch {}

        const local = this.localAppData;
        if (local) {
            for (const name of ["Discord", "DiscordPTB", "DiscordCanary"]) {
                push(path.join(local, name));
            }
        }

        const roaming = this.roamingAppData;
        if (roaming) {
            for (const name of ["discord", "discordptb", "discordcanary"]) {
                push(path.join(roaming, name));
            }
        }

        return roots.filter(p => {
            try { return fs.existsSync(p); } catch { return false; }
        });
    }

    statKind(target) {
        try {
            const stat = fs.statSync(target);

            if (typeof stat?.isFile === "function" && stat.isFile()) {
                return "file";
            }

            if (typeof stat?.isDirectory === "function" && stat.isDirectory()) {
                return "dir";
            }

            // Compatibility fallback for BetterDiscord/Electron builds where
            // fs returns a Stats-like plain object without isFile/isDirectory.
            const mode = Number(stat?.mode);

            if (Number.isFinite(mode)) {
                const type = mode & 0o170000;

                if (type === 0o100000) return "file";
                if (type === 0o040000) return "dir";
            }
        } catch {}

        return null;
    }

    pathIsFile(target) {
        return this.statKind(target) === "file";
    }

    pathIsDirectory(target) {
        return this.statKind(target) === "dir";
    }

    readDirNames(dir) {
        try {
            const entries = fs.readdirSync(dir);

            if (!Array.isArray(entries)) return [];

            return entries
                .map(entry => {
                    if (typeof entry === "string") return entry;
                    if (entry && typeof entry.name === "string") return entry.name;
                    return null;
                })
                .filter(Boolean);
        } catch {
            return [];
        }
    }

    listDirs(dir) {
        return this.readDirNames(dir)
            .filter(name => this.pathIsDirectory(path.join(dir, name)));
    }

    findModulesDirs(startDir, maxDepth = 3) {
        const results = [];
        const queue = [{dir: startDir, depth: 0}];
        const seen = new Set();

        while (queue.length) {
            const item = queue.shift();
            const normalized = path.normalize(item.dir).toLowerCase();

            if (seen.has(normalized)) continue;
            seen.add(normalized);

            if (path.basename(item.dir).toLowerCase() === "modules") {
                results.push(item.dir);
                continue;
            }

            if (item.depth >= maxDepth) continue;

            for (const name of this.listDirs(item.dir)) {
                // Ignore folders that can be very large but cannot contain Discord's native modules.
                if (/^(locales?|swiftshader|cache|gpu(cache)?|logs?|dictionaries)$/i.test(name)) {
                    continue;
                }

                queue.push({
                    dir: path.join(item.dir, name),
                    depth: item.depth + 1
                });
            }
        }

        return results;
    }

    findIndexInsideCore(coreDir, maxDepth = 3) {
        const directCandidates = [
            path.join(coreDir, "discord_desktop_core", "index.js"),
            path.join(coreDir, "index.js")
        ];

        for (const candidate of directCandidates) {
            try {
                if (fs.existsSync(candidate) && this.pathIsFile(candidate)) {
                    return candidate;
                }
            } catch {}
        }

        const queue = [{dir: coreDir, depth: 0}];
        const seen = new Set();

        while (queue.length) {
            const item = queue.shift();
            const normalized = path.normalize(item.dir).toLowerCase();

            if (seen.has(normalized)) continue;
            seen.add(normalized);

            const index = path.join(item.dir, "index.js");
            try {
                if (fs.existsSync(index) && this.pathIsFile(index)) {
                    return index;
                }
            } catch {}

            if (item.depth >= maxDepth) continue;

            for (const name of this.listDirs(item.dir)) {
                queue.push({
                    dir: path.join(item.dir, name),
                    depth: item.depth + 1
                });
            }
        }

        return null;
    }

    scoreInjectionIndex(indexPath) {
        let score = 0;
        let content = "";

        try {
            if (!this.pathIsFile(indexPath)) return null;

            const stat = fs.statSync(indexPath);
            const size = Number(stat?.size);

            if (Number.isFinite(size) && size > 2 * 1024 * 1024) {
                return null;
            }

            content = fs.readFileSync(indexPath, "utf8");
        } catch {
            return null;
        }

        const lowerPath = indexPath.toLowerCase();
        const lower = content.toLowerCase();

        if (lower.includes("betterdiscord")) score += 1000;
        if (lower.includes("core.asar")) score += 700;
        if (lowerPath.includes("discord_desktop_core")) score += 450;
        if (lower.includes("discord_desktop_core")) score += 250;

        if (content.length < 4096) score += 120;
        else if (content.length < 32768) score += 40;

        if (/[\\/]app-[^\\/]+[\\/]/i.test(indexPath)) score += 80;
        if (/[\\/]modules?[\\/]/i.test(indexPath)) score += 80;

        if (
            lowerPath.includes("node_modules") &&
            !lower.includes("betterdiscord") &&
            !lower.includes("core.asar")
        ) {
            score -= 1000;
        }

        return {
            index: indexPath,
            score,
            preview: content.slice(0, 500)
        };
    }

    genericIndexSearch(root, maxDepth = 8, maxDirs = 8000) {
        const hits = [];
        const queue = [{dir: root, depth: 0}];
        const seen = new Set();
        let visited = 0;

        const skipDir = name =>
            /^(cache|code cache|gpu(cache)?|dictionaries|locales?|logs?|crashpad|swiftshader|blob_storage|session storage)$/i.test(name);

        while (queue.length && visited < maxDirs) {
            const item = queue.shift();
            const normalized = path.normalize(item.dir).toLowerCase();

            if (seen.has(normalized)) continue;
            seen.add(normalized);
            visited++;

            const names = this.readDirNames(item.dir);

            for (const name of names) {
                const full = path.join(item.dir, name);

                if (
                    String(name).toLowerCase() === "index.js" &&
                    this.pathIsFile(full)
                ) {
                    const scored = this.scoreInjectionIndex(full);

                    if (scored && scored.score > 0) {
                        hits.push(scored);
                    }

                    continue;
                }

                if (!this.pathIsDirectory(full)) continue;
                if (item.depth >= maxDepth) continue;
                if (skipDir(name)) continue;

                queue.push({
                    dir: full,
                    depth: item.depth + 1
                });
            }
        }

        return {hits, visited};
    }

    findCoreIndex() {
        const roots = this.candidateDiscordRoots();
        const candidates = [];
        const scanNotes = [];

        for (const root of roots) {
            const rootBase = path.basename(root);
            const versionDirs = [];

            if (/^(?:app-)?\d+\.\d+\.\d+/i.test(rootBase)) {
                versionDirs.push({name: rootBase, full: root});
            }

            for (const name of this.listDirs(root)) {
                if (/^app-/i.test(name) || /^\d+\.\d+\.\d+/i.test(name)) {
                    versionDirs.push({
                        name,
                        full: path.join(root, name)
                    });
                }
            }

            versionDirs.sort((a, b) =>
                this.compareVersionNames(a.name, b.name)
            );

            for (const version of versionDirs) {
                const moduleDirs = this.findModulesDirs(version.full, 5);

                for (const modules of moduleDirs) {
                    const coreNames = this.listDirs(modules)
                        .filter(name => /discord_desktop_core/i.test(name))
                        .sort()
                        .reverse();

                    for (const coreName of coreNames) {
                        const coreDir = path.join(modules, coreName);
                        const index = this.findIndexInsideCore(coreDir, 5);
                        if (!index) continue;

                        const scored = this.scoreInjectionIndex(index);
                        if (!scored) continue;

                        candidates.push({
                            root,
                            appName: version.name,
                            coreName,
                            index,
                            modules,
                            score: scored.score + 500,
                            method: "structured"
                        });
                    }
                }
            }
        }

        for (const root of roots) {
            const result = this.genericIndexSearch(root, 9, 10000);
            scanNotes.push(`${root} (${result.visited} pastas)`);

            for (const hit of result.hits) {
                candidates.push({
                    root,
                    appName: null,
                    coreName: null,
                    index: hit.index,
                    modules: null,
                    score: hit.score,
                    method: "generic"
                });
            }
        }

        if (!candidates.length) {
            throw new Error(
                "Não encontrei o index.js de injeção do BetterDiscord. " +
                "Varredura: " + (scanNotes.join(" | ") || roots.join(" | ") || "nenhuma pasta")
            );
        }

        const unique = new Map();

        for (const item of candidates) {
            const key = path.normalize(item.index).toLowerCase();
            const old = unique.get(key);

            if (!old || item.score > old.score) {
                unique.set(key, item);
            }
        }

        const ranked = [...unique.values()].sort((a, b) => b.score - a.score);
        const best = ranked[0];

        let content = "";
        try {
            content = fs.readFileSync(best.index, "utf8");
        } catch {}

        const clearSignal =
            /betterdiscord/i.test(content) ||
            /core\.asar/i.test(content) ||
            /discord_desktop_core/i.test(best.index);

        if (!clearSignal) {
            throw new Error(
                "Encontrei arquivos index.js, mas nenhum parece ser o ponto de injeção do BetterDiscord. " +
                "Melhor candidato: " + best.index
            );
        }

        this.lastCoreIndex = best.index;
        this.lastDiscoveryMethod = best.method;
        this.lastDiscoveryScore = best.score;

        return best;
    }

    markerBlock() {
        return [
            HOOK_BEGIN,
            "try { require(" + JSON.stringify(this.hookPath) + "); }",
            "catch (e) { console.error('[GoLiveBypassBD/native-hook]', e); }",
            HOOK_END,
            ""
        ].join("\n");
    }

    stripMarker(content) {
        const begin = content.indexOf(HOOK_BEGIN);
        if (begin < 0) return content;

        const end = content.indexOf(HOOK_END, begin);
        if (end < 0) return content;

        const after = end + HOOK_END.length;
        return content.slice(0, begin)
            + content.slice(after).replace(/^\r?\n/, "");
    }

    ensureNativeHookFiles() {
        fs.mkdirSync(this.dataDir, {recursive: true});

        const currentHook = fs.existsSync(this.hookPath)
            ? fs.readFileSync(this.hookPath, "utf8")
            : "";

        if (currentHook !== NATIVE_HOOK_SOURCE) {
            fs.writeFileSync(this.hookPath, NATIVE_HOOK_SOURCE, "utf8");
        }

        const target = this.findCoreIndex();
        const original = fs.readFileSync(target.index, "utf8");
        const clean = this.stripMarker(original);
        const wanted = this.markerBlock() + clean;

        if (original !== wanted) {
            const backup = target.index + ".glbbd-backup";

            if (!fs.existsSync(backup)) {
                // BetterDiscord's fs bridge may not expose copyFileSync.
                // We already have the original content in memory, so write
                // the backup directly instead of calling copyFileSync.
                fs.writeFileSync(backup, original, "utf8");
            }

            fs.writeFileSync(target.index, wanted, "utf8");
        }

        // Verify the loader is truly present before reporting installation success.
        const verify = fs.readFileSync(target.index, "utf8");

        const escapedHookPath = JSON.stringify(this.hookPath);

        if (
            !verify.includes(HOOK_BEGIN) ||
            !verify.includes(HOOK_END) ||
            !verify.includes(escapedHookPath)
        ) {
            throw new Error(
                "O index.js foi gravado, mas a verificação do hook falhou."
            );
        }

        this.lastCoreIndex = target.index;
        this.saveSettingsAndNativeConfig();

        return target;
    }

    isNativeHookOnDisk() {
        try {
            const target = this.findCoreIndex();
            const content = fs.readFileSync(target.index, "utf8");

            const escapedHookPath = JSON.stringify(this.hookPath);

            return content.includes(HOOK_BEGIN)
                && content.includes(HOOK_END)
                && content.includes(escapedHookPath);
        } catch {
            return false;
        }
    }

    isNativeRuntimeLoaded() {
        const status = this.readNativeStatus();

        if (!status?.hookLoaded) return false;

        try {
            const updated = new Date(status.updatedAt || 0).getTime();
            return Number.isFinite(updated)
                && updated > 0
                && Date.now() - updated < 10 * 60 * 1000;
        } catch {
            return false;
        }
    }

    isNativeHookInstalled() {
        return this.isNativeHookOnDisk()
            || this.isNativeRuntimeLoaded();
    }

    removeNativeHook() {
        try {
            const target = this.findCoreIndex();
            const content = fs.readFileSync(target.index, "utf8");
            const clean = this.stripMarker(content);

            if (clean !== content) {
                fs.writeFileSync(target.index, clean, "utf8");
            }

            try {
                if (fs.existsSync(this.nativeStatusPath)) {
                    fs.unlinkSync(this.nativeStatusPath);
                }
            } catch {}

            return true;
        } catch (e) {
            BdApi.UI.alert(
                "Go Live De Queijo",
                `Não consegui remover o hook:\n\n${e.message}`
            );
            return false;
        }
    }

    // ---------------------------------------------------------------------
    // Renderer-side guard only. MediaEngineStore is NEVER modified.
    // ---------------------------------------------------------------------

    isVideoGuardObject(value) {
        return !!(
            value &&
            typeof value === "object" &&
            value.name === VIDEO_GUARD &&
            value.variations &&
            typeof value.variations === "object"
        );
    }

    collectVideoGuardObjects(value, found, seen, depth = 0) {
        if (
            value == null ||
            (typeof value !== "object" && typeof value !== "function") ||
            depth > 5
        ) {
            return;
        }

        if (seen.has(value)) return;
        seen.add(value);

        if (this.isVideoGuardObject(value)) {
            found.push(value);
        }

        let keys = [];

        try {
            keys = Object.keys(value);
        } catch {
            return;
        }

        // Keep the traversal bounded. Declarations are usually shallow; this
        // avoids walking giant Discord stores/React trees.
        if (keys.length > 200) return;

        for (const key of keys) {
            if (
                key === "prototype" ||
                key === "constructor" ||
                key === "__proto__"
            ) {
                continue;
            }

            let child;

            try {
                child = value[key];
            } catch {
                continue;
            }

            this.collectVideoGuardObjects(
                child,
                found,
                seen,
                depth + 1
            );
        }
    }

    findVideoGuardDefinitions() {
        const found = [];
        const seen = new WeakSet();

        const inspectRaw = raw => {
            if (!raw || typeof raw !== "object") return;

            this.collectVideoGuardObjects(
                raw.declarations,
                found,
                seen,
                0
            );

            this.collectVideoGuardObjects(
                raw.exports,
                found,
                seen,
                0
            );
        };

        // BetterDiscord documents raw:true + declarations specifically for
        // values buried at module top-level. This is the closest equivalent
        // to Vencord's compile-time variations:{} patch available at runtime.
        try {
            const raw = BdApi.Webpack.getBySource(
                VIDEO_GUARD,
                {
                    raw: true,
                    cacheId: "GoLiveBypassBD-video-guard-raw-v148"
                }
            );

            inspectRaw(raw);
        } catch (e) {
            this.api.Logger.warn(
                "Busca raw do video-guard falhou",
                e
            );
        }

        // Fallback query in case getBySource's first result is a consumer and
        // not the module that owns the experiment declaration.
        try {
            const raws = BdApi.Webpack.getModules(
                module => {
                    try {
                        const src = String(module?.toString?.() || "");
                        return src.includes(VIDEO_GUARD);
                    } catch {
                        return false;
                    }
                },
                {
                    raw: true,
                    first: false
                }
            );

            if (Array.isArray(raws)) {
                for (const raw of raws) inspectRaw(raw);
            }
        } catch {}

        return [...new Set(found)];
    }

    patchVideoGuardDefinitions() {
        this.videoGuardOriginals = [];
        this.videoGuardDefinitionsPatched = 0;

        const definitions = this.findVideoGuardDefinitions();

        for (const target of definitions) {
            try {
                const original = target.variations;

                this.videoGuardOriginals.push({
                    target,
                    variations: original
                });

                // Exact same semantic change used by the original plugin:
                // name:"2026-08-video-guard", variations:{}
                try {
                    target.variations = {};
                } catch {}

                if (
                    target.variations &&
                    typeof target.variations === "object"
                ) {
                    for (const key of Object.keys(target.variations)) {
                        try { delete target.variations[key]; } catch {}
                    }
                }

                if (
                    target.variations &&
                    Object.keys(target.variations).length === 0
                ) {
                    this.videoGuardDefinitionsPatched++;
                }
            } catch {}
        }

        return this.videoGuardDefinitionsPatched;
    }

    installNarrowMediaGateFallback() {
        if (this.mediaGateFallbackInstalled) return true;

        try {
            const media = BdApi.Webpack.getStore("MediaEngineStore");

            if (!media || typeof media.supportsInApp !== "function") {
                return false;
            }

            // IMPORTANT: only the exact gate used by canGoLive.
            // We intentionally DO NOT patch:
            // - supports("VIDEO")  (decoder/media capability)
            // - DESKTOP_CAPTURE
            // This avoids the v1.1.x regression where watching somebody
            // else's stream could get audio but infinite video loading.
            this.api.Patcher.after(
                media,
                "supportsInApp",
                (_, args, result) => {
                    if (
                        this.settings.enabled &&
                        String(args?.[0] ?? "") === "VIDEO"
                    ) {
                        return true;
                    }

                    return result;
                }
            );

            this.mediaGateFallbackInstalled = true;
            return true;
        } catch (e) {
            this.api.Logger.warn(
                "Fallback estreito supportsInApp(VIDEO) falhou",
                e
            );

            return false;
        }
    }

    installVideoGuardPatch() {
        this.restoreVideoGuardPatch();

        const count = this.patchVideoGuardDefinitions();

        try {
            const apexForVerdict = BdApi.Webpack.getStore("ApexExperimentStore");

            if (
                apexForVerdict?.getServerAssignment &&
                !this.originalApexGetServerAssignment
            ) {
                this.originalApexGetServerAssignment =
                    apexForVerdict.getServerAssignment.bind(apexForVerdict);
            }
        } catch {}

        if (count > 0) {
            this.videoGuardPatchMode =
                `variations:{} (${count} definição${count === 1 ? "" : "ões"})`;
        } else {
            // Fallback for assignment lookups. This by itself may not refresh
            // every consumer, so the narrow MediaEngine gate below is also
            // installed if supportsInApp(VIDEO) remains false.
            try {
                const apex = BdApi.Webpack.getStore("ApexExperimentStore");

                if (
                    apex?.getServerAssignment &&
                    !this.originalApexGetServerAssignment
                ) {
                    this.originalApexGetServerAssignment =
                        apex.getServerAssignment.bind(apex);
                }

                if (apex?.getServerAssignment) {
                    this.api.Patcher.instead(
                        apex,
                        "getServerAssignment",
                        (that, args, original) => {
                            if (args?.[2] === VIDEO_GUARD) return null;
                            return original(...args);
                        }
                    );

                    this.videoGuardPatchMode = "Apex fallback";
                }
            } catch (e) {
                this.api.Logger.warn(
                    "Fallback do ApexExperimentStore falhou",
                    e
                );
            }
        }

        // Let experiment consumers settle, then verify the actual gate. If
        // Discord still reports false, enable ONLY supportsInApp(VIDEO).
        this.schedule(() => {
            if (!this.settings.enabled) return;

            try {
                const media = BdApi.Webpack.getStore("MediaEngineStore");
                const value = media?.supportsInApp?.("VIDEO");

                if (value !== true) {
                    const ok = this.installNarrowMediaGateFallback();

                    if (ok) {
                        this.videoGuardPatchMode += " + supportsInApp(VIDEO)";
                        BdApi.UI.showToast(
                            "Go Live De Queijo: trava local de vídeo liberada.",
                            {type: "success", timeout: 4000}
                        );
                    }
                }
            } catch {}
        }, 250);

        return count > 0;
    }

    restoreVideoGuardPatch() {
        for (const item of this.videoGuardOriginals || []) {
            try {
                item.target.variations = item.variations;
            } catch {}
        }

        this.videoGuardOriginals = [];
        this.videoGuardDefinitionsPatched = 0;
        this.videoGuardTarget = null;
        this.originalVariations = null;
        this.mediaGateFallbackInstalled = false;
        this.videoGuardPatchMode = "não aplicado";
    }

    readRealVideoGuardAssignment() {
        try {
            const user = BdApi.Webpack.getStore("UserStore")?.getCurrentUser?.();

            if (!user) return null;

            if (typeof this.originalApexGetServerAssignment === "function") {
                return this.originalApexGetServerAssignment(
                    "user",
                    user.id,
                    VIDEO_GUARD
                );
            }

            const apex = BdApi.Webpack.getStore("ApexExperimentStore");

            return apex?.getServerAssignment?.(
                "user",
                user.id,
                VIDEO_GUARD
            ) ?? null;
        } catch (e) {
            return {
                __glbError: e?.message || String(e)
            };
        }
    }

    serverAssignmentBlocked(assignment) {
        if (!assignment || typeof assignment !== "object") return false;

        const variantId = assignment.variantId;

        return variantId === 1 || variantId === 2;
    }

    hasActiveStreamMedia() {
        try {
            const appStream = BdApi.Webpack.getStore("ApplicationStreamingStore");
            const streamRtc = BdApi.Webpack.getStore("StreamRTCConnectionStore");

            const mine = appStream?.getCurrentUserActiveStream?.();
            if (mine) return true;

            const keys = streamRtc?.getAllActiveStreamKeys?.();

            if (Array.isArray(keys) && keys.length > 0) return true;

            if (keys && typeof keys === "object" && Object.keys(keys).length > 0) {
                return true;
            }
        } catch {}

        return false;
    }

    sessionRetryState() {
        const nativePid = Number(this.readNativeStatus()?.pid || 0);
        const saved = this.api.Data.load("sessionRetryState");

        if (!saved || typeof saved !== "object") {
            return {
                count: 0,
                windowStartedAt: Date.now(),
                nativePid
            };
        }

        const started = Number(saved.windowStartedAt) || 0;
        const savedPid = Number(saved.nativePid || 0);

        // A full Discord restart creates a new native process. Retries from
        // the old process must not poison the new clean boot.
        if (
            !started ||
            Date.now() - started > 120_000 ||
            (nativePid > 0 && savedPid > 0 && nativePid !== savedPid)
        ) {
            return {
                count: 0,
                windowStartedAt: Date.now(),
                nativePid
            };
        }

        return {
            count: Number(saved.count) || 0,
            windowStartedAt: started,
            nativePid
        };
    }

    resetSessionRetries() {
        this.api.Data.save("sessionRetryState", {
            count: 0,
            windowStartedAt: Date.now(),
            nativePid: Number(this.readNativeStatus()?.pid || 0)
        });
    }

    gatewayBootRetryState() {
        const nativePid = Number(this.readNativeStatus()?.pid || 0);
        const saved = this.api.Data.load("gatewayBootRetryState");

        if (!saved || typeof saved !== "object") {
            return {
                count: 0,
                windowStartedAt: Date.now(),
                nativePid
            };
        }

        const started = Number(saved.windowStartedAt) || 0;

        if (!started || Date.now() - started > 180_000) {
            return {
                count: 0,
                windowStartedAt: Date.now(),
                nativePid
            };
        }

        return {
            count: Number(saved.count) || 0,
            windowStartedAt: started,
            nativePid: Number(saved.nativePid || nativePid)
        };
    }


    scheduleServerProxyRecheck() {
        if (this._stopped || this._serverProxyWaitScheduled) return;

        if (this._serverProxyWaitChecks >= 40) {
            this.sessionVerdict += " • Gateway não migrou após 80s";
            return;
        }

        this._serverProxyWaitChecks++;
        this._serverProxyWaitScheduled = true;

        this.schedule(() => {
            this._serverProxyWaitScheduled = false;
            this.verifyServerSessionAndRetry();
        }, 2000);
    }

    async verifyServerSessionAndRetry() {
        if (!this.settings.enabled) return;

        const assignment = this.readRealVideoGuardAssignment();

        this.lastServerAssignment = assignment;

        if (
            assignment &&
            typeof assignment === "object" &&
            "__glbError" in assignment
        ) {
            this.sessionVerdict = `erro ao ler atribuição: ${assignment.__glbError}`;
            return;
        }

        if (assignment === undefined) {
            this.sessionVerdict = "INDETERMINADA (servidor retornou undefined)";
            this.appendRendererLog("server.assignment", {
                value: "undefined",
                verdict: "indeterminate"
            });
            return;
        }

        const blocked = this.serverAssignmentBlocked(assignment);

        if (!blocked) {
            this.sessionVerdict = "LIBERADA pelo servidor";
            this._serverProxyWaitChecks = 0;
            this._serverProxyWaitScheduled = false;
            this.resetSessionRetries();

            const status = this.readNativeStatus();
            const country =
                status?.current?.country ||
                status?.country ||
                "?";

            BdApi.UI.showToast(
                `Go Live De Queijo: sessão liberada pelo servidor${country !== "?" ? " via " + country : ""}.`,
                {type: "success", timeout: 5000}
            );

            return;
        }

        this.sessionVerdict =
            `BLOQUEADA pelo servidor (variantId ${assignment.variantId})`;

        const native = this.readNativeStatus();

        if (
            !native?.pacActive ||
            !native?.current?.proxy
        ) {
            this.sessionVerdict =
                `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • procurando proxy`;

            if (this._serverProxyWaitChecks === 0) {
                BdApi.UI.showToast(
                    "Go Live De Queijo: procurando uma saída proxy válida...",
                    {type: "info", timeout: 5500}
                );
            }

            this.scheduleServerProxyRecheck();
            return;
        }

        // The important distinction: "a proxy was found" is NOT enough.
        // Do not spend renderer reload attempts while the live Gateway is
        // still the DIRECT one that created variantId 2.
        if (
            native.gatewayViaProxy !== true ||
            native.directFallback === true
        ) {
            this.sessionVerdict =
                `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • migrando Gateway para a proxy`;

            const waits = this._serverProxyWaitChecks;

            if (waits === 0) {
                BdApi.UI.showToast(
                    "Go Live De Queijo: proxy pronta; migrando o Gateway...",
                    {type: "info", timeout: 5500}
                );
            }

            // Give the native hook time to destroy the DIRECT tunnel and see
            // the replacement Gateway arrive through SOCKS.
            if (waits < 10) {
                this.scheduleServerProxyRecheck();
                return;
            }

            // A renderer reload was not enough on some Discord builds because
            // the gateway service survived it. One FULL relaunch, with the
            // validated proxy already cached for next boot, is more reliable.
            const bootRetry = this.gatewayBootRetryState();

            if (bootRetry.count < 1 && !this.hasActiveStreamMedia()) {
                this.api.Data.save("gatewayBootRetryState", {
                    count: bootRetry.count + 1,
                    windowStartedAt: bootRetry.windowStartedAt,
                    nativePid: Number(native?.pid || 0)
                });

                this.sessionVerdict += " • reiniciando Discord";

                BdApi.UI.showToast(
                    "Go Live De Queijo: Gateway ainda estava direto; reiniciando o Discord com a proxy já salva.",
                    {type: "info", timeout: 6500}
                );

                this.schedule(() => {
                    this.restartDiscord().catch(e => {
                        this.api.Logger.error(
                            "Falha ao reiniciar para aplicar proxy no boot",
                            e
                        );
                    });
                }, 700);

                return;
            }

            this.scheduleServerProxyRecheck();
            return;
        }

        this._serverProxyWaitChecks = 0;
        this._serverProxyWaitScheduled = false;

        if (this.hasActiveStreamMedia()) {
            BdApi.UI.showToast(
                "Go Live De Queijo: sessão bloqueada, mas há mídia ativa; não vou recarregar por baixo da call.",
                {type: "info", timeout: 7000}
            );
            return;
        }

        const retry = this.sessionRetryState();

        if (retry.count >= 2) {
            this.sessionVerdict += " • tentativas automáticas esgotadas";

            BdApi.UI.showToast(
                "Go Live De Queijo: o servidor continuou bloqueando após 2 tentativas.",
                {type: "error", timeout: 7000}
            );
            return;
        }

        const next = retry.count + 1;

        this.api.Data.save("sessionRetryState", {
            count: next,
            windowStartedAt: retry.windowStartedAt,
            nativePid: retry.nativePid
        });

        this.sessionVerdict += ` • Gateway na proxy, atualizando sessão (${next}/2)`;

        BdApi.UI.showToast(
            `Go Live De Queijo: Gateway já está pela proxy; atualizando a sessão (${next}/2).`,
            {type: "info", timeout: 4500}
        );

        // The original implementation reloads the renderer when the server's
        // assignment is still blocked. The native hook stays alive in the main
        // process, so the PAC/router are already ready for the new Gateway.
        this.schedule(() => {
            try {
                window.location.reload();
            } catch (e) {
                this.api.Logger.error("Falha ao recarregar renderer", e);
            }
        }, 450);
    }

    // ---------------------------------------------------------------------
    // RTC override
    // ---------------------------------------------------------------------

    installRegionOverride() {
        this.restoreRegionOverride();

        const region = String(this.settings.voiceRegion || "").trim();
        if (!region) return;

        try {
            const store = BdApi.Webpack.getStore("RTCRegionStore");
            if (!store) return;

            this.regionOriginals = {
                getPreferredRegion:
                    typeof store.getPreferredRegion === "function"
                        ? store.getPreferredRegion
                        : null,
                getPreferredRegions:
                    typeof store.getPreferredRegions === "function"
                        ? store.getPreferredRegions
                        : null,
                shouldIncludePreferredRegion:
                    typeof store.shouldIncludePreferredRegion === "function"
                        ? store.shouldIncludePreferredRegion
                        : null
            };

            if (this.regionOriginals.getPreferredRegion) {
                const original = this.regionOriginals.getPreferredRegion;

                store.getPreferredRegion = function () {
                    return region || original.call(this);
                };
            }

            if (this.regionOriginals.getPreferredRegions) {
                const original = this.regionOriginals.getPreferredRegions;

                store.getPreferredRegions = function () {
                    const current = original.call(this) || [];
                    return [region, ...current.filter(x => x !== region)];
                };
            }

            if (this.regionOriginals.shouldIncludePreferredRegion) {
                store.shouldIncludePreferredRegion = function () {
                    return true;
                };
            }
        } catch {}
    }

    restoreRegionOverride() {
        if (!this.regionOriginals) return;

        try {
            const store = BdApi.Webpack.getStore("RTCRegionStore");

            if (store) {
                if (this.regionOriginals.getPreferredRegion) {
                    store.getPreferredRegion = this.regionOriginals.getPreferredRegion;
                }

                if (this.regionOriginals.getPreferredRegions) {
                    store.getPreferredRegions = this.regionOriginals.getPreferredRegions;
                }

                if (this.regionOriginals.shouldIncludePreferredRegion) {
                    store.shouldIncludePreferredRegion = this.regionOriginals.shouldIncludePreferredRegion;
                }
            }
        } catch {}

        this.regionOriginals = null;
    }

    restartPatches() {
        try { this.api.Patcher.unpatchAll(); } catch {}
        this.restoreVideoGuardPatch();
        this.restoreRegionOverride();

        if (this.settings.enabled) this.installVideoGuardPatch();
        this.installRegionOverride();
    }

    // ---------------------------------------------------------------------
    // Restart
    // ---------------------------------------------------------------------

    async restartDiscord() {
        const native = window.DiscordNative;
        const targets = [native?.app, native?.remoteApp].filter(Boolean);

        let scheduled = false;
        let lastError = null;

        for (const target of targets) {
            if (typeof target.relaunch !== "function") continue;

            try {
                const result = target.relaunch();

                if (result && typeof result.then === "function") {
                    await result;
                }

                scheduled = true;

                if (typeof target.quit === "function") {
                    setTimeout(() => {
                        try { target.quit(); } catch {}
                    }, 150);
                } else if (typeof target.exit === "function") {
                    setTimeout(() => {
                        try { target.exit(0); } catch {}
                    }, 150);
                }

                break;
            } catch (e) {
                lastError = e;
            }
        }

        if (!scheduled) {
            throw lastError || new Error(
                "DiscordNative não expõe relaunch nesta build."
            );
        }

        return true;
    }

    async installAndRestart() {
        try {
            this.saveSettingsAndNativeConfig();

            BdApi.UI.showToast(
                "Procurando .conf na pasta de plugins e preparando WireGuard...",
                {type: "info", timeout: 7000}
            );

            const wg = await this.ensureWireGuardReady();

            const target = this.ensureNativeHookFiles();

            BdApi.UI.showToast(
                `WireGuard ${wg?.tunnelUp ? "ativo" : "preparado"} • ` +
                `hook instalado em ${target.appName}. Reiniciando...`,
                {type: "success", timeout: 7000}
            );

            await this.restartDiscord();
        } catch (e) {
            this.api.Logger.error(
                "Falha ao preparar WireGuard/reiniciar",
                e
            );

            BdApi.UI.alert(
                PLUGIN_NAME,
                "Não consegui preparar o WireGuard:\n\n" +
                e.message +
                "\n\nO plugin não ativou um fallback SOCKS silencioso."
            );
        }
    }

    async removeAndRestart() {
        if (!this.removeNativeHook()) return;

        try {
            BdApi.UI.showToast(
                "Hook removido. Reiniciando Discord...",
                {type: "info"}
            );

            await this.restartDiscord();
        } catch (e) {
            BdApi.UI.alert(
                "Go Live De Queijo",
                "Hook foi removido, mas não consegui reiniciar automaticamente. " +
                "Feche o Discord pela bandeja e abra de novo."
            );
        }
    }

    appendRendererLog(kind, data = {}) {
        try {
            fs.mkdirSync(this.dataDir, {recursive: true});

            const safe = {};
            const allowed = [
                "type", "state", "status", "region", "hostname",
                "endpoint", "quality", "mode", "reason", "connected",
                "result", "value", "verdict", "activeMedia",
                "routeId", "gatewayViaProxy"
            ];

            for (const key of allowed) {
                const value = data?.[key];

                if (
                    value == null ||
                    typeof value === "string" ||
                    typeof value === "number" ||
                    typeof value === "boolean"
                ) {
                    safe[key] = value;
                }
            }

            if (data?.streamKey != null) safe.streamKey = "<present>";
            if (data?.token != null) safe.token = "<redacted>";
            if (data?.secretKey != null) safe.secretKey = "<redacted>";

            const line =
                new Date().toISOString() +
                " [" + kind + "] " +
                JSON.stringify(safe) +
                "\n";

            fs.appendFileSync(this.rendererLogPath, line, "utf8");

            try {
                const stat = fs.statSync(this.rendererLogPath);

                if (stat.size > 700 * 1024) {
                    const lines = fs
                        .readFileSync(this.rendererLogPath, "utf8")
                        .split(/\r?\n/)
                        .filter(Boolean)
                        .slice(-1500);

                    fs.writeFileSync(
                        this.rendererLogPath,
                        lines.join("\n") + "\n",
                        "utf8"
                    );
                }
            } catch {}
        } catch {}
    }

    tailLog(file, maxLines = 180) {
        try {
            if (!file || !fs.existsSync(file)) return [];

            return fs
                .readFileSync(file, "utf8")
                .split(/\r?\n/)
                .filter(Boolean)
                .slice(-maxLines);
        } catch (e) {
            return [`[erro lendo log] ${e.message}`];
        }
    }

    rendererMediaSnapshot() {
        const snapshot = {
            activeStream: false,
            streamKeys: 0,
            rtcState: "?",
            streamState: "?"
        };

        try {
            const appStream = BdApi.Webpack.getStore("ApplicationStreamingStore");
            const mine = appStream?.getCurrentUserActiveStream?.();
            snapshot.activeStream = !!mine;
            if (mine) snapshot.streamState = "current-user-stream";
        } catch {}

        try {
            const streamRtc = BdApi.Webpack.getStore("StreamRTCConnectionStore");
            const keys = streamRtc?.getAllActiveStreamKeys?.();

            if (Array.isArray(keys)) {
                snapshot.streamKeys = keys.length;
            } else if (keys && typeof keys === "object") {
                snapshot.streamKeys = Object.keys(keys).length;
            }
        } catch {}

        try {
            const rtc = BdApi.Webpack.getStore("RTCConnectionStore");

            for (const method of [
                "getRTCConnectionState",
                "getConnectionState"
            ]) {
                if (typeof rtc?.[method] !== "function") continue;

                try {
                    const value = rtc[method]();
                    if (
                        value == null ||
                        typeof value === "string" ||
                        typeof value === "number" ||
                        typeof value === "boolean"
                    ) {
                        snapshot.rtcState = String(value);
                        break;
                    }
                } catch {}
            }
        } catch {}

        return snapshot;
    }


    requestNativeVideoRecovery() {
        try {
            fs.mkdirSync(this.dataDir, {recursive: true});

            fs.writeFileSync(
                this.voiceCommandPath,
                JSON.stringify({
                    type: "destroy-stream",
                    nonce: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    at: new Date().toISOString()
                }, null, 2),
                "utf8"
            );

            BdApi.UI.showToast(
                "Go Live: recuperação do discord_voice solicitada. Aguarde a renegociação.",
                {type: "info", timeout: 9000}
            );
        } catch (e) {
            BdApi.UI.alert(
                "Go Live De Queijo",
                `Falha ao solicitar recuperação nativa:\n\n${e.message}`
            );
        }
    }


    requestViewerMediaRecovery() {
        try {
            fs.mkdirSync(this.dataDir, {recursive: true});

            fs.writeFileSync(
                this.voiceCommandPath,
                JSON.stringify({
                    type: "recover-viewer",
                    nonce: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    at: new Date().toISOString()
                }, null, 2),
                "utf8"
            );

            this.appendRendererLog("viewer.recovery.request", {
                state: "recover-viewer"
            });

            BdApi.UI.showToast(
                "Go Live: solicitada renegociação de mídia da Live assistida.",
                {type: "info", timeout: 9000}
            );
        } catch (e) {
            BdApi.UI.alert(
                "Go Live De Queijo",
                `Falha ao solicitar recuperação do viewer:\n\n${e.message}`
            );
        }
    }

    installRendererDiagnostics() {
        if (this._rendererDiagnosticsInstalled) return;
        this._rendererDiagnosticsInstalled = true;

        this.appendRendererLog("diagnostics.start", {
            state: "renderer-start"
        });

        try {
            const dispatcher = BdApi.Webpack.getModule(
                m =>
                    m &&
                    typeof m.dispatch === "function" &&
                    typeof m.subscribe === "function" &&
                    typeof m.unsubscribe === "function",
                {searchExports: true}
            );

            if (dispatcher) {
                this.api.Patcher.before(
                    dispatcher,
                    "dispatch",
                    (_, args) => {
                        const event = args?.[0];
                        const type = String(event?.type || "");

                        if (
                            !/(STREAM|VOICE|RTC|MEDIA|VIDEO|CONNECTION_OPEN|CALL)/i.test(type)
                        ) {
                            return;
                        }

                        this.appendRendererLog("flux", {
                            type,
                            state: event?.state,
                            status: event?.status,
                            region: event?.region,
                            hostname: event?.hostname,
                            endpoint: event?.endpoint,
                            quality: event?.quality,
                            mode: event?.mode,
                            reason: event?.reason,
                            connected: event?.connected,
                            streamKey: event?.streamKey,
                            token: event?.token,
                            secretKey: event?.secretKey
                        });
                    }
                );

                this.appendRendererLog("dispatcher", {
                    state: "patched"
                });
            } else {
                this.appendRendererLog("dispatcher", {
                    state: "not-found"
                });
            }
        } catch (e) {
            this.appendRendererLog("dispatcher.error", {
                reason: e?.message || String(e)
            });
        }

        let lastRouteId = this.readNativeStatus()?.gatewayRouteId ?? null;
        let lastGatewayAt = this.readNativeStatus()?.lastGatewayAt ?? null;

        const watchGateway = () => {
            if (this._stopped) return;

            try {
                const status = this.readNativeStatus() || {};
                const routeId = status.gatewayRouteId ?? null;
                const gatewayAt = status.lastGatewayAt ?? null;

                const changed =
                    (
                        routeId != null &&
                        lastRouteId != null &&
                        String(routeId) !== String(lastRouteId)
                    ) ||
                    (
                        routeId == null &&
                        gatewayAt &&
                        lastGatewayAt &&
                        gatewayAt !== lastGatewayAt
                    );

                if (changed) {
                    const activeMedia = this.hasActiveStreamMedia();

                    this.appendRendererLog("gateway.reconnect", {
                        state: activeMedia ? "active-media" : "idle",
                        hostname: status.lastGatewayHost || null,
                        activeMedia,
                        routeId: routeId ?? null,
                        gatewayViaProxy: status.gatewayViaProxy ?? null
                    });

                    BdApi.UI.showToast(
                        activeMedia
                            ? "Go Live: Gateway reconectou durante mídia ativa; evento gravado no diagnóstico."
                            : "Go Live: Gateway reconectou; evento gravado no diagnóstico.",
                        {
                            type: activeMedia ? "warning" : "info",
                            timeout: 8500
                        }
                    );
                }

                if (routeId != null) lastRouteId = routeId;
                if (gatewayAt) lastGatewayAt = gatewayAt;
            } catch {}

            this.schedule(watchGateway, 1000);
        };

        this.schedule(watchGateway, 1000);
    }

    getFullDiagnostic() {
        const media = this.rendererMediaSnapshot();
        const nativeTail = this.tailLog(this.nativeLogPath, 180);
        const rendererTail = this.tailLog(this.rendererLogPath, 180);
        const wireGuardTail = this.tailLog(this.wireGuardLogPath, 120);
        const wireGuardStatus = this.readWireGuardStatus();

        return [
            this.getDiagnostic(),
            "",
            "== RTC / STREAM SNAPSHOT ==",
            `activeStream: ${media.activeStream ? "SIM" : "NÃO"}`,
            `streamKeys: ${media.streamKeys}`,
            `rtcState: ${media.rtcState}`,
            `streamState: ${media.streamState}`,
            "",
            "== NATIVE LOG (últimas 180) ==",
            ...(nativeTail.length ? nativeTail : ["(vazio)"]),
            "",
            "== RENDERER / STREAM / VOICE / RTC (últimas 180) ==",
            ...(rendererTail.length ? rendererTail : ["(vazio)"]),
            "",
            "== DISCORD_VOICE STATUS ==",
            (() => {
                try {
                    return fs.readFileSync(
                        path.join(this.dataDir, "voice-status.json"),
                        "utf8"
                    );
                } catch {
                    return "(voice-status.json ainda não existe)";
                }
            })(),
            "",
            "== WIREGUARD / ROTAS ==",
            JSON.stringify(wireGuardStatus || {}, null, 2),
            "",
            "== WIREGUARD LOG (últimas 120) ==",
            ...(wireGuardTail.length ? wireGuardTail : ["(vazio)"]),
            "",
            "NOTA v1.7.4:",
            "Os dois logs da v1.7.4 confirmaram remote-stream com videoSupported=true e callback de primeiro frame instalado, mas nenhum frame chegou.",
            "Fechar/reabrir *.discord.media também não resolveu. Por isso a v1.7.4 testa outra hipótese: a sinalização *.discord.media passa pela mesma saída não-BR do Gateway.",
            "Somente WebSocket/HTTPS de sinalização passa pela proxy; o tráfego RTP/UDP continua direto."
        ].join("\n");
    }

    recoverRtc() {
        const mediaActive = this.hasActiveStreamMedia();

        this.appendRendererLog("rtc.manual-recovery", {
            state: mediaActive ? "active-media" : "idle",
            activeMedia: mediaActive
        });

        const reload = () => {
            try {
                window.location.reload();
            } catch (e) {
                BdApi.UI.alert(
                    "Go Live De Queijo",
                    `Não consegui recarregar o renderer:\n\n${e.message}`
                );
            }
        };

        if (
            mediaActive &&
            typeof BdApi.UI.showConfirmationModal === "function"
        ) {
            BdApi.UI.showConfirmationModal(
                "Recuperar RTC / loading",
                "Há uma call/Live detectada. O Discord será recarregado para reconstruir o estado de RTC. Isso pode reconectar a mídia.",
                {
                    confirmText: "Recuperar RTC",
                    cancelText: "Cancelar",
                    onConfirm: reload
                }
            );
            return;
        }

        reload();
    }

    // ---------------------------------------------------------------------
    // Diagnostic
    // ---------------------------------------------------------------------

    getDiagnostic() {
        const status = this.readNativeStatus();

        const lines = [
            "Go Live De Queijo v1.7.4",
            "",
            "== NATIVE HOOK ==",
            `instalado/ativo: ${this.isNativeHookInstalled() ? "SIM" : "NÃO"}`,
            `marcador no disco: ${this.isNativeHookOnDisk() ? "SIM" : "NÃO"}`,
            `runtime carregado: ${this.isNativeRuntimeLoaded() ? "SIM" : "NÃO"}`,
            `core index: ${this.lastCoreIndex || "indisponível"}`,
            `método de descoberta: ${this.lastDiscoveryMethod || "?"}`,
            `score do candidato: ${this.lastDiscoveryScore ?? "?"}`,
            `hook path: ${this.hookPath}`,
            `roots pesquisados: ${JSON.stringify(this.candidateDiscordRoots())}`,
            "",
            "== NATIVE STATUS =="
        ];

        if (!status) {
            lines.push("status: ainda não existe (precisa reiniciar após instalar)");
        } else {
            lines.push(`state: ${status.state || "?"}`);
            lines.push(`hookLoaded: ${status.hookLoaded ?? false}`);
            lines.push(`pacActive: ${status.pacActive ?? false}`);
            lines.push(`routerPort: ${status.routerPort || "?"}`);
            lines.push(`proxyAttempt: ${status.proxyAttempt ?? "?"}`);
            lines.push(`proxyCandidates: ${status.proxyCandidatesTesting ?? "?"}/${status.proxyCandidatesTotal ?? "?"}`);
            lines.push(`proxyCache: ${status.proxyCacheState || "-"} (${status.proxyCacheCandidates ?? 0})`);
            lines.push(`proxySelectionError: ${status.proxySelectionError || "-"}`);
            lines.push(`country: ${status.current?.country || status.country || "?"}`);
            lines.push(`proxy: ${status.current?.proxy || status.proxy || "?"}`);
            lines.push(`ms: ${status.current?.ms ?? status.ms ?? "?"}`);
            lines.push(`resolveGateway: ${status.resolveGateway || "?"}`);
            lines.push(`resolveMediaSignaling: ${status.resolveMediaSignaling || "?"}`);
            lines.push(`mediaSignalingProxy: ${status.mediaSignalingProxy ?? true}`);
            lines.push(`lastMediaHost: ${status.lastMediaHost || "?"}`);
            lines.push(`lastMediaAt: ${status.lastMediaAt || "?"}`);
            lines.push(`mediaRouteId: ${status.mediaRouteId ?? 0}`);
            lines.push(`mediaViaProxy: ${status.mediaViaProxy ?? "?"}`);
            lines.push(`mediaFallbackDirect: ${status.mediaFallbackDirect ?? false}`);
            lines.push(`mediaProxy: ${status.mediaProxy || "-"}`);
            lines.push(`mediaCountry: ${status.mediaCountry || "-"}`);
            lines.push(`mediaRouteError: ${status.mediaRouteError || "-"}`);
            lines.push(`lastGatewayHost: ${status.lastGatewayHost || "?"}`);
            lines.push(`lastGatewayAt: ${status.lastGatewayAt || "?"}`);
            lines.push(`gatewayViaProxy: ${status.gatewayViaProxy ?? "?"}`);
            lines.push(`gatewayRouteId: ${status.gatewayRouteId ?? "?"}`);
            lines.push(`gatewayTransitionId: ${status.gatewayTransitionId || "-"}`);
            lines.push(`gatewayTransitionAt: ${status.gatewayTransitionAt || "-"}`);
            lines.push(`gatewayTransitionCompletedAt: ${status.gatewayTransitionCompletedAt || "-"}`);
            lines.push(`directPairsClosed: ${status.directPairsClosed ?? "?"}`);
            lines.push(`directFallback: ${status.directFallback ?? false}`);
            lines.push(`directReason: ${status.directReason || "-"}`);
            lines.push(`proxyMode: ${status.proxyMode || (String(this.settings.manualProxy || "").trim() ? "manual-sticky" : "auto")}`);
            lines.push(`manualHeartbeatFailures: ${status.manualHeartbeatFailures ?? 0}`);
            lines.push(`manualProbe: ${status.manualProbe || "-"}`);
            lines.push(`manualProbeError: ${status.manualProbeError || "-"}`);
            lines.push(`voiceRegion: ${this.settings.voiceRegion || "AUTOMÁTICA"}`);
            lines.push(`injectionPersistent: ${status.injectionPersistent ?? "?"}`);
            lines.push(`injectionPath: ${status.injectionPath || "?"}`);
            lines.push(`injectionReason: ${status.injectionReason || "-"}`);
            if (status.error) lines.push(`error: ${status.error}`);
        }

        lines.push(
            "",
            "== CLIENT PATCH ==",
            `video guard: ${this.videoGuardPatchMode}`,
            `definições video-guard alteradas: ${this.videoGuardDefinitionsPatched}`,
            `fallback supportsInApp(VIDEO): ${this.mediaGateFallbackInstalled ? "SIM" : "NÃO"}`,
            `atribuição REAL do servidor: ${JSON.stringify(this.readRealVideoGuardAssignment())}`,
            `veredito da sessão: ${this.sessionVerdict}`,
            "MediaEngineStore: somente supportsInApp(VIDEO) pode receber fallback; supports()/DESKTOP ficam originais"
        );

        try {
            const media = BdApi.Webpack.getStore("MediaEngineStore");

            const call = (name, ...args) => {
                try {
                    if (typeof media?.[name] !== "function") return "ausente";
                    return media[name](...args);
                } catch (e) {
                    return `erro: ${e.message}`;
                }
            };

            lines.push(`supports VIDEO: ${call("supports", "VIDEO")}`);
            lines.push(`supportsInApp VIDEO: ${call("supportsInApp", "VIDEO")}`);
            lines.push(
                `supportsInApp DESKTOP_CAPTURE: ${call("supportsInApp", "DESKTOP_CAPTURE")}`
            );
        } catch {}

        lines.push(
            "",
            "== UPDATER ==",
            `repo: ${GITHUB_REPO}`,
            `versão instalada: ${PLUGIN_VERSION}`,
            `última versão vista: ${this._latestVersion || "?"}`,
            `update disponível: ${this._updateAvailableVersion || "NÃO"}`,
            `estado: ${this._updateStatus || "?"}`,
            `última checagem: ${this._lastUpdateCheckAt || "-"}`,
            `detecção automática: ${this.settings.autoUpdate ? "SIM" : "NÃO"}`,
            `instalação automática: ${this.settings.autoInstallUpdates ? "SIM" : "NÃO"}`,
            "",
            "== ARQUIVOS ==",
            `settings: ${this.nativeSettingsPath}`,
            `status: ${this.nativeStatusPath}`,
            `log: ${this.nativeLogPath}`,
            `renderer log: ${this.rendererLogPath}`
        );

        return lines.join("\n");
    }

    async copyDiagnostic() {
        const text = this.getFullDiagnostic();

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                BdApi.UI.showToast("Diagnóstico copiado.", {type: "success"});
                return;
            }
        } catch {}

        BdApi.UI.alert("Diagnóstico", text);
    }


    // ---------------------------------------------------------------------
    // GitHub updater
    // ---------------------------------------------------------------------

    normalizeGithubRepo(value) {
        let raw = String(value || "").trim();

        if (!raw) return null;

        raw = raw
            .replace(/^git\+/, "")
            .replace(/\.git$/i, "")
            .replace(/\/+$/, "");

        const urlMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:[/?#].*)?$/i.exec(raw);

        if (urlMatch) {
            return `${urlMatch[1]}/${urlMatch[2]}`;
        }

        const shortMatch = /^([^/\s]+)\/([^/\s]+)$/.exec(raw);

        if (shortMatch) {
            return `${shortMatch[1]}/${shortMatch[2]}`;
        }

        return null;
    }

    githubRawUpdateUrl() {
        const [owner, name] = GITHUB_REPO.split("/");

        return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${UPDATE_BRANCH}/${UPDATE_FILE_NAME}`;
    }

    parsePluginMeta(source, key) {
        const pattern = new RegExp(
            `^\\s*\\*\\s*@${key}\\s+(.+?)\\s*$`,
            "mi"
        );

        const match = pattern.exec(String(source || ""));
        return match ? match[1].trim() : null;
    }

    compareVersions(a, b) {
        const parse = value =>
            String(value || "")
                .split(".")
                .map(part => Number.parseInt(part, 10) || 0);

        const av = parse(a);
        const bv = parse(b);
        const max = Math.max(av.length, bv.length);

        for (let i = 0; i < max; i++) {
            const x = av[i] || 0;
            const y = bv[i] || 0;

            if (x > y) return 1;
            if (x < y) return -1;
        }

        return 0;
    }

    findOwnPluginPath() {
        const folder = BdApi.Plugins.folder;
        let names = [];

        try {
            const entries = fs.readdirSync(folder);

            if (Array.isArray(entries)) {
                names = entries
                    .map(entry => {
                        if (typeof entry === "string") return entry;
                        if (entry && typeof entry.name === "string") return entry.name;
                        return null;
                    })
                    .filter(Boolean);
            }
        } catch {}

        const candidates = [
            UPDATE_FILE_NAME,
            ...names.filter(name => /\.plugin\.js$/i.test(name))
        ];

        const seen = new Set();

        for (const name of candidates) {
            if (!name || seen.has(name)) continue;
            seen.add(name);

            const file = path.join(folder, name);

            try {
                if (!fs.existsSync(file)) continue;

                const source = fs.readFileSync(file, "utf8");
                const pluginName = this.parsePluginMeta(source, "name");
                const authorId = this.parsePluginMeta(source, "authorId");

                if (
                    pluginName === PLUGIN_NAME &&
                    authorId === PLUGIN_AUTHOR_ID
                ) {
                    return file;
                }
            } catch {}
        }

        return path.join(folder, UPDATE_FILE_NAME);
    }

    validateRemotePlugin(source) {
        const name = this.parsePluginMeta(source, "name");
        const authorId = this.parsePluginMeta(source, "authorId");
        const version = this.parsePluginMeta(source, "version");

        if (name !== PLUGIN_NAME) {
            throw new Error(`nome do plugin remoto inválido: ${name || "ausente"}`);
        }

        if (authorId !== PLUGIN_AUTHOR_ID) {
            throw new Error("authorId do plugin remoto não confere");
        }

        if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version || "")) {
            throw new Error(`versão remota inválida: ${version || "ausente"}`);
        }

        if (!String(source).includes("module.exports")) {
            throw new Error("arquivo remoto não parece ser um plugin BetterDiscord");
        }

        return version;
    }

    async installRemoteUpdate(source, version) {
        const target = this.findOwnPluginPath();

        try {
            this._updateStatus = `instalando v${version}`;
            const current = fs.existsSync(target)
                ? fs.readFileSync(target, "utf8")
                : "";

            fs.mkdirSync(this.dataDir, {recursive: true});

            // Fixed backup name so updates don't create an ever-growing pile.
            if (current) {
                fs.writeFileSync(
                    path.join(this.dataDir, "plugin-update-backup.js"),
                    current,
                    "utf8"
                );
            }

            fs.writeFileSync(target, source, "utf8");

            this._latestVersion = version;
            this._updateAvailableVersion = null;
            this._updateStatus = `atualizado para v${version}`;
            this.api.Data.save("lastInstalledUpdateVersion", version);

            BdApi.UI.showToast(
                `Go Live De Queijo atualizado para v${version}.`,
                {type: "success", timeout: 6000}
            );
        } catch (e) {
            this._updateStatus = `erro ao instalar: ${e.message}`;
            this.api.Logger.error("Falha ao instalar atualização", e);

            BdApi.UI.alert(
                "Go Live De Queijo",
                `Não consegui instalar a atualização:\n\n${e.message}`
            );
        }
    }

    async checkForUpdates(manual = false) {
        if (this._checkingUpdate) return null;

        const url = this.githubRawUpdateUrl();

        this._checkingUpdate = true;
        this._updateStatus = "verificando GitHub...";
        this._lastUpdateCheckAt = new Date().toISOString();

        try {
            const response = await BdApi.Net.fetch(
                `${url}?v=${Date.now()}`,
                {
                    headers: {
                        "Cache-Control": "no-cache",
                        "Pragma": "no-cache"
                    }
                }
            );

            if (!response?.ok) {
                throw new Error(`GitHub respondeu HTTP ${response?.status ?? "?"}`);
            }

            const remoteSource = await response.text();

            if (remoteSource.length < 500 || remoteSource.length > 2_000_000) {
                throw new Error("tamanho do plugin remoto fora do esperado");
            }

            const remoteVersion = this.validateRemotePlugin(remoteSource);
            this._latestVersion = remoteVersion;

            if (this.compareVersions(remoteVersion, PLUGIN_VERSION) <= 0) {
                this._updateAvailableVersion = null;
                this._updateStatus = `em dia • v${PLUGIN_VERSION}`;

                if (manual) {
                    BdApi.UI.showToast(
                        `Você já está na versão mais recente (v${PLUGIN_VERSION}).`,
                        {type: "success", timeout: 4500}
                    );
                }

                return {available: false, version: remoteVersion};
            }

            this._updateAvailableVersion = remoteVersion;
            this._updateStatus = `nova versão • v${remoteVersion}`;

            if (this.settings.autoInstallUpdates) {
                await this.installRemoteUpdate(remoteSource, remoteVersion);
                return {
                    available: true,
                    installed: true,
                    version: remoteVersion
                };
            }

            const lastNotified = String(
                this.api.Data.load("lastNotifiedUpdateVersion") || ""
            );

            const shouldNotify = manual || lastNotified !== remoteVersion;

            if (shouldNotify) {
                this.api.Data.save("lastNotifiedUpdateVersion", remoteVersion);

                const update = () =>
                    this.installRemoteUpdate(remoteSource, remoteVersion);

                if (typeof BdApi.UI.showConfirmationModal === "function") {
                    BdApi.UI.showConfirmationModal(
                        "Atualização disponível",
                        `Go Live De Queijo v${remoteVersion} está disponível.\n\nVersão atual: v${PLUGIN_VERSION}`,
                        {
                            confirmText: "Atualizar",
                            cancelText: "Depois",
                            onConfirm: update
                        }
                    );
                } else if (window.confirm(
                    `Go Live De Queijo v${remoteVersion} está disponível. Atualizar agora?`
                )) {
                    await update();
                }
            }

            return {
                available: true,
                installed: false,
                version: remoteVersion
            };
        } catch (e) {
            this._updateStatus = `erro: ${e.message}`;
            this.api.Logger.warn("Falha ao verificar atualização", e);

            if (manual) {
                BdApi.UI.alert(
                    "Go Live De Queijo",
                    `Não consegui verificar atualizações:\n\n${e.message}`
                );
            }

            return {
                available: false,
                error: e.message
            };
        } finally {
            this._checkingUpdate = false;
        }
    }

    startAutoUpdater() {
        if (this._updateInterval) {
            clearInterval(this._updateInterval);
            this._updateInterval = null;
        }

        if (!this.settings.autoUpdate) return;

        this.schedule(() => {
            this.checkForUpdates(false);
        }, 4000);

        this._updateInterval = setInterval(() => {
            if (this._stopped) return;
            this.checkForUpdates(false);
        }, UPDATE_INTERVAL_MS);
    }

    // ---------------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------------

    getSettingsPanel() {
        const React = BdApi.React;
        const plugin = this;
        const status = this.readNativeStatus() || {};
        const installed = this.isNativeHookInstalled();
        const installedOnDisk = this.isNativeHookOnDisk();
        const runtimeLoaded = this.isNativeRuntimeLoaded();
        const pacActive = !!status?.pacActive;
        const wgStatus = this.readWireGuardStatus() || {};
        const wgReady = !!(
            wgStatus?.managerRunning &&
            wgStatus?.tunnelUp
        );
        const wgRoutes = Number(wgStatus?.routeCount || 0);

        function LiveLogPanel() {
            const buildText = () => {
                const renderer = plugin.tailLog(plugin.rendererLogPath, 55);
                const native = plugin.tailLog(plugin.nativeLogPath, 55);

                return [
                    "RENDERER / STREAM / VOICE / RTC",
                    ...(renderer.length ? renderer : ["(sem eventos ainda)"]),
                    "",
                    "NATIVE / GATEWAY / WIREGUARD",
                    ...(native.length ? native : ["(sem log ainda)"])
                ].join("\n");
            };

            const [text, setText] = React.useState(buildText);

            React.useEffect(() => {
                const id = setInterval(() => setText(buildText()), 1000);
                return () => clearInterval(id);
            }, []);

            return React.createElement(
                "div",
                {style: cardStyle},
                React.createElement(
                    "div",
                    {style: sectionTitleStyle},
                    "Logs ao vivo"
                ),
                React.createElement(
                    "div",
                    {
                        style: {
                            fontSize: "12px",
                            color: "var(--text-muted)",
                            marginBottom: "10px"
                        }
                    },
                    "Copiar diagnóstico inclui estes logs completos e o snapshot de RTC."
                ),
                React.createElement(
                    "pre",
                    {
                        style: {
                            margin: 0,
                            width: "100%",
                            maxHeight: "360px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            fontFamily: "var(--font-code)",
                            fontSize: "11px",
                            lineHeight: 1.45,
                            boxSizing: "border-box"
                        }
                    },
                    text
                )
            );
        }

        const rootStyle = {
            padding: "18px",
            width: "100%",
            maxWidth: "920px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
        };

        const cardStyle = {
            border: "1px solid var(--background-modifier-accent)",
            borderRadius: "12px",
            padding: "16px",
            boxSizing: "border-box",
            background: "var(--background-secondary)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)"
        };

        const sectionTitleStyle = {
            fontSize: "14px",
            fontWeight: 700,
            marginBottom: "14px",
            letterSpacing: "0.2px"
        };

        const rowStyle = {
            display: "grid",
            gridTemplateColumns: "minmax(220px, 290px) minmax(0, 1fr)",
            gap: "16px",
            alignItems: "center",
            padding: "10px 0"
        };

        const labelTitleStyle = {
            fontSize: "14px",
            fontWeight: 600,
            lineHeight: 1.25,
            marginBottom: "4px"
        };

        const labelHintStyle = {
            fontSize: "12px",
            color: "var(--text-muted)",
            lineHeight: 1.35
        };

        const inputStyle = {
            width: "100%",
            boxSizing: "border-box",
            minHeight: "40px",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--input-border)",
            background: "var(--input-background)",
            color: "var(--text-normal)",
            outline: "none"
        };

        const buttonBaseStyle = {
            minHeight: "42px",
            padding: "10px 14px",
            border: 0,
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "13px",
            transition: "transform .12s ease, opacity .12s ease"
        };

        const toggleWrapStyle = {
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center"
        };

        const toggleButtonStyle = enabled => ({
            display: "inline-flex",
            alignItems: "center",
            justifyContent: enabled ? "flex-end" : "flex-start",
            width: "62px",
            height: "34px",
            padding: "4px",
            borderRadius: "999px",
            border: `1px solid ${enabled ? "var(--status-positive)" : "var(--background-modifier-accent)"}`,
            background: enabled ? "var(--button-positive-background)" : "var(--input-background)",
            cursor: "pointer",
            boxSizing: "border-box"
        });

        const toggleKnobStyle = {
            width: "24px",
            height: "24px",
            borderRadius: "999px",
            background: "var(--white-500)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.22)"
        };

        const toggleTextStyle = enabled => ({
            fontSize: "12px",
            fontWeight: 700,
            color: enabled ? "var(--status-positive)" : "var(--text-muted)",
            marginRight: "12px"
        });

        const save = (key, value, repatch = false) => {
            plugin.settings[key] = value;
            plugin.saveSettingsAndNativeConfig();
            if (repatch) plugin.restartPatches();
        };

        let detectedWireGuardConfig = null;

        try {
            detectedWireGuardConfig =
                this.findWireGuardConfigInPluginsFolder();
        } catch {}

        const stateText = wgReady
            ? `ATIVO • ${wgRoutes} rota${wgRoutes === 1 ? "" : "s"}`
            : detectedWireGuardConfig
                ? "AGUARDANDO INSTALAÇÃO"
                : "COLOQUE UM .CONF NA PASTA PLUGINS";

        const stateColor = wgReady
            ? "var(--status-positive)"
            : detectedWireGuardConfig
                ? "var(--status-warning)"
                : "var(--status-danger)";

        const field = (title, hint, control) => React.createElement(
            "div",
            {style: rowStyle},
            React.createElement(
                "div",
                null,
                React.createElement("div", {style: labelTitleStyle}, title),
                React.createElement("div", {style: labelHintStyle}, hint)
            ),
            control
        );

        return React.createElement(
            "div",
            {style: rootStyle},

            React.createElement(
                "div",
                {style: {display: "flex", flexDirection: "column", gap: "4px"}},
                React.createElement("h2", {style: {margin: 0}}, "Go Live De Queijo v1.7.4"),
                React.createElement(
                    "div",
                    {style: {fontSize: "12px", color: "var(--text-muted)"}},
                    "Proxy do Gateway e atualizações automáticas"
                )
            ),

            React.createElement(
                "div",
                {style: cardStyle},
                React.createElement(
                    "div",
                    {
                        style: {
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px"
                        }
                    },
                    React.createElement(
                        "div",
                        {style: {display: "flex", flexDirection: "column", gap: "6px"}},
                        React.createElement(
                            "div",
                            {style: {fontSize: "13px", fontWeight: 700, color: "var(--text-muted)"}},
                            "Status da rede"
                        ),
                        React.createElement(
                            "div",
                            {style: {fontSize: "18px", fontWeight: 800, lineHeight: 1.2}},
                            "WireGuard do Discord"
                        )
                    ),
                    React.createElement(
                        "div",
                        {
                            style: {
                                padding: "8px 12px",
                                borderRadius: "999px",
                                border: `1px solid ${stateColor}`,
                                color: stateColor,
                                fontSize: "12px",
                                fontWeight: 800,
                                letterSpacing: "0.3px"
                            }
                        },
                        stateText
                    )
                ),
                React.createElement(
                    "div",
                    {
                        style: {
                            marginTop: "14px",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "10px"
                        }
                    },
                    React.createElement(
                        "div",
                        {
                            style: {
                                border: "1px solid var(--background-modifier-accent)",
                                borderRadius: "10px",
                                padding: "12px"
                            }
                        },
                        React.createElement("div", {style: {fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px"}}, "Túnel"),
                        React.createElement("div", {style: {fontSize: "15px", fontWeight: 700}}, wgReady ? "GLQVPN ativo" : "-" )
                    ),
                    React.createElement(
                        "div",
                        {
                            style: {
                                border: "1px solid var(--background-modifier-accent)",
                                borderRadius: "10px",
                                padding: "12px"
                            }
                        },
                        React.createElement("div", {style: {fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px"}}, "Rotas Discord"),
                        React.createElement("div", {style: {fontSize: "15px", fontWeight: 700}}, `TCP/UDP: ${wgRoutes}`)
                    ),
                    React.createElement(
                        "div",
                        {
                            style: {
                                border: "1px solid var(--background-modifier-accent)",
                                borderRadius: "10px",
                                padding: "12px"
                            }
                        },
                        React.createElement("div", {style: {fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px"}}, "Runtime"),
                        React.createElement("div", {style: {fontSize: "15px", fontWeight: 700}}, runtimeLoaded ? "Carregado" : "Pendente")
                    )
                )
            ),

            React.createElement(
                "div",
                {style: cardStyle},
                React.createElement("div", {style: sectionTitleStyle}, "Configurações"),

                field(
                    "Neutralizar video-guard",
                    "Libera a trava local do Go Live.",
                    React.createElement(
                        "div",
                        {style: toggleWrapStyle},
                        React.createElement(
                            "div",
                            {
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px"
                                }
                            },
                            React.createElement(
                                "span",
                                {style: toggleTextStyle(!!this.settings.enabled)},
                                this.settings.enabled ? "Ativado" : "Desativado"
                            ),
                            React.createElement(
                                "button",
                                {
                                    type: "button",
                                    style: toggleButtonStyle(!!this.settings.enabled),
                                    onClick: () => save("enabled", !this.settings.enabled, true),
                                    title: this.settings.enabled ? "Desativar" : "Ativar",
                                    'aria-label': this.settings.enabled ? "Desativar neutralização" : "Ativar neutralização"
                                },
                                React.createElement("span", {style: toggleKnobStyle})
                            )
                        )
                    )
                ),

                field(
                    "Config WireGuard / Proton VPN",
                    "O plugin procura automaticamente um arquivo .conf na própria pasta de plugins do BetterDiscord. Preferência: GoLiveDeQueijo.conf, ProtonVPN.conf, Proton.conf, wireguard.conf ou wg.conf.",
                    React.createElement("input", {
                        style: inputStyle,
                        value: detectedWireGuardConfig
                            ? detectedWireGuardConfig
                            : path.join(
                                this.getBetterDiscordPluginsFolder(),
                                "GoLiveDeQueijo.conf"
                            ),
                        readOnly: true
                    })
                ),

                field(
                    "Região RTC forçada",
                    "Deixe vazio para usar o modo automático.",
                    React.createElement("input", {
                        style: inputStyle,
                        value: this.settings.voiceRegion,
                        placeholder: "ex.: brazil, us-east",
                        onChange: e => save("voiceRegion", e.target.value),
                        onBlur: () => plugin.restartPatches()
                    })
                ),

                field(
                    "Atualização automática",
                    "Busca atualizações automaticamente no GitHub do plugin.",
                    React.createElement(
                        "div",
                        {style: toggleWrapStyle},
                        React.createElement(
                            "div",
                            {
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px"
                                }
                            },
                            React.createElement(
                                "span",
                                {style: toggleTextStyle(!!this.settings.autoUpdate)},
                                this.settings.autoUpdate ? "Ativado" : "Desativado"
                            ),
                            React.createElement(
                                "button",
                                {
                                    type: "button",
                                    style: toggleButtonStyle(!!this.settings.autoUpdate),
                                    onClick: () => {
                                        save("autoUpdate", !this.settings.autoUpdate);
                                        plugin.startAutoUpdater();
                                    },
                                    title: this.settings.autoUpdate ? "Desativar" : "Ativar",
                                    "aria-label": this.settings.autoUpdate
                                        ? "Desativar atualização automática"
                                        : "Ativar atualização automática"
                                },
                                React.createElement("span", {style: toggleKnobStyle})
                            )
                        )
                    )
                ),

                field(
                    "Instalar updates automaticamente",
                    "Se ativado, baixa e substitui o plugin sem pedir confirmação.",
                    React.createElement(
                        "div",
                        {style: toggleWrapStyle},
                        React.createElement(
                            "div",
                            {
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px"
                                }
                            },
                            React.createElement(
                                "span",
                                {style: toggleTextStyle(!!this.settings.autoInstallUpdates)},
                                this.settings.autoInstallUpdates ? "Ativado" : "Desativado"
                            ),
                            React.createElement(
                                "button",
                                {
                                    type: "button",
                                    style: toggleButtonStyle(!!this.settings.autoInstallUpdates),
                                    onClick: () => {
                                        save(
                                            "autoInstallUpdates",
                                            !this.settings.autoInstallUpdates
                                        );

                                        if (
                                            this.settings.autoInstallUpdates &&
                                            this._updateAvailableVersion
                                        ) {
                                            plugin.checkForUpdates(true);
                                        }
                                    },
                                    title: this.settings.autoInstallUpdates ? "Desativar" : "Ativar",
                                    "aria-label": this.settings.autoInstallUpdates
                                        ? "Desativar instalação automática"
                                        : "Ativar instalação automática"
                                },
                                React.createElement("span", {style: toggleKnobStyle})
                            )
                        )
                    )
                )
            ),

            React.createElement(
                "div",
                {style: cardStyle},
                React.createElement("div", {style: sectionTitleStyle}, "Atualizações"),
                React.createElement(
                    "div",
                    {
                        style: {
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                            gap: "10px"
                        }
                    },
                    React.createElement(
                        "div",
                        {
                            style: {
                                border: "1px solid var(--background-modifier-accent)",
                                borderRadius: "10px",
                                padding: "12px"
                            }
                        },
                        React.createElement(
                            "div",
                            {
                                style: {
                                    fontSize: "12px",
                                    color: "var(--text-muted)",
                                    marginBottom: "4px"
                                }
                            },
                            "Versão instalada"
                        ),
                        React.createElement(
                            "div",
                            {style: {fontSize: "15px", fontWeight: 700}},
                            `v${PLUGIN_VERSION}`
                        )
                    ),
                    React.createElement(
                        "div",
                        {
                            style: {
                                border: "1px solid var(--background-modifier-accent)",
                                borderRadius: "10px",
                                padding: "12px"
                            }
                        },
                        React.createElement(
                            "div",
                            {
                                style: {
                                    fontSize: "12px",
                                    color: "var(--text-muted)",
                                    marginBottom: "4px"
                                }
                            },
                            "Updater"
                        ),
                        React.createElement(
                            "div",
                            {style: {fontSize: "15px", fontWeight: 700}},
                            this._updateStatus || "aguardando"
                        )
                    )
                )
            ),

            React.createElement(LiveLogPanel),

            React.createElement(
                "div",
                {style: cardStyle},
                React.createElement("div", {style: sectionTitleStyle}, "Ações"),
                React.createElement(
                    "div",
                    {
                        style: {
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "10px",
                            alignItems: "center"
                        }
                    },
                    React.createElement(
                        "button",
                        {
                            style: Object.assign({}, buttonBaseStyle, {
                                background: "var(--button-positive-background)",
                                color: "var(--white-500)"
                            }),
                            onClick: () => plugin.installAndRestart()
                        },
                        "Instalar/atualizar e reiniciar"
                    ),
                    React.createElement(
                        "button",
                        {
                            style: Object.assign({}, buttonBaseStyle, {
                                background: "var(--button-secondary-background)",
                                color: "var(--text-normal)"
                            }),
                            onClick: () => plugin.copyDiagnostic()
                        },
                        "Copiar diagnóstico"
                    ),
                    React.createElement(
                        "button",
                        {
                            style: Object.assign({}, buttonBaseStyle, {
                                background: "var(--button-secondary-background)",
                                color: "var(--text-normal)"
                            }),
                            onClick: () => plugin.checkForUpdates(true)
                        },
                        "Buscar atualização"
                    )
                )
            )
        );
    }
};
