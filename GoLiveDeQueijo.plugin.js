/**
 * @name Go Live De Queijo
 * @author Pão de Queijo
 * @authorId 416992570846085121
 * @description Plugin BetterDiscord para dar bypass na granja
 * @version 2.0.9
 * @source https://github.com/paodequeijo616/GoLiveBypass_BetterDiscord
 * @updateUrl https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/GoLiveDeQueijo.plugin.js
 * @downloadUrl https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/GoLiveDeQueijo.plugin.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const VIDEO_GUARD = "2026-08-video-guard";
const PLUGIN_NAME = "Go Live De Queijo";
const PLUGIN_VERSION = "2.0.9";
const PLUGIN_AUTHOR_ID = "416992570846085121";
const GITHUB_REPO = "paodequeijo616/GoLiveBypass_BetterDiscord";
const UPDATE_FILE_NAME = "GoLiveDeQueijo.plugin.js";
const UPDATE_BRANCH = "main";
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const HOOK_BEGIN = "/* GoLiveBypassBD:NATIVE-HOOK:BEGIN */";
const HOOK_END = "/* GoLiveBypassBD:NATIVE-HOOK:END */";
const SINGBOX_BOOTSTRAP_PS1_SOURCE = "param([switch]$Elevated)\n\n$ErrorActionPreference = \"Stop\"\n\n$Base = Join-Path $env:LOCALAPPDATA \"GoLiveBypassBD\"\n$BinRoot = Join-Path $Base \"sing-box\"\n$Exe = Join-Path $BinRoot \"sing-box.exe\"\n$Config = Join-Path $Base \"singbox-config.json\"\n$Runner = Join-Path $Base \"singbox-runner.ps1\"\n$RunnerLog = Join-Path $Base \"singbox-runner.log\"\n$Status = Join-Path $Base \"singbox-install-status.json\"\n$Log = Join-Path $Base \"singbox-bootstrap.log\"\n$TaskName = \"GoLiveDeQueijo-SingBox\"\n$OldTaskName = \"GoLiveDeQueijo-WireGuard\"\n$TunName = \"GoLiveDeQueijo\"\n$PowerShellExe = Join-Path $env:SystemRoot \"System32\\WindowsPowerShell\\v1.0\\powershell.exe\"\nif (-not (Test-Path -LiteralPath $PowerShellExe)) {\n    $pwsh = Join-Path $env:ProgramFiles \"PowerShell\\7\\pwsh.exe\"\n    if (Test-Path -LiteralPath $pwsh) { $PowerShellExe = $pwsh } else { $PowerShellExe = \"powershell.exe\" }\n}\n$FallbackVersion = \"1.13.20\"\n$Version = $FallbackVersion\n$ZipName = \"sing-box-$Version-windows-amd64.zip\"\n$ZipUrl = \"https://github.com/SagerNet/sing-box/releases/download/v$Version/$ZipName\"\n$ZipPath = Join-Path $Base \"sing-box-windows-amd64.zip\"\n$ExtractRoot = Join-Path $Base \"sing-box-extract\"\n\nNew-Item -ItemType Directory -Force -Path $Base | Out-Null\nNew-Item -ItemType Directory -Force -Path $BinRoot | Out-Null\n\nfunction Log([string]$Message) {\n    try {\n        Add-Content -LiteralPath $Log -Value (\"{0:o} [sing-box] {1}\" -f (Get-Date), $Message) -Encoding UTF8\n    } catch {}\n}\n\nfunction Write-Utf8NoBom([string]$File, [string]$Text) {\n    $encoding = New-Object System.Text.UTF8Encoding($false)\n    [System.IO.File]::WriteAllText($File, $Text, $encoding)\n}\n\nfunction Write-Status([hashtable]$Data) {\n    try {\n        Write-Utf8NoBom $Status ($Data | ConvertTo-Json -Depth 8)\n    } catch {}\n}\n\nfunction Stop-OldWireGuard {\n    try {\n        Stop-ScheduledTask -TaskName $OldTaskName -ErrorAction SilentlyContinue\n        Unregister-ScheduledTask -TaskName $OldTaskName -Confirm:$false -ErrorAction SilentlyContinue\n        Log \"tarefa WireGuard antiga removida\"\n    } catch {}\n\n    try {\n        $wg = Join-Path $env:ProgramFiles \"WireGuard\\wireguard.exe\"\n        if (Test-Path -LiteralPath $wg) {\n            & $wg /uninstalltunnelservice GLQVPN | Out-Null\n            Log \"tunnel service GLQVPN antigo removido\"\n        }\n    } catch {}\n}\n\nfunction Stop-OldSingBox {\n    try {\n        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue\n    } catch {}\n\n    try {\n        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |\n            Where-Object {\n                $_.Name -ieq \"sing-box.exe\" -and\n                $_.ExecutablePath -and\n                $_.ExecutablePath -like \"$BinRoot*\"\n            } |\n            ForEach-Object {\n                try {\n                    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue\n                } catch {}\n            }\n    } catch {}\n\n    Start-Sleep -Milliseconds 500\n}\n\nfunction Current-Version {\n    if (-not (Test-Path -LiteralPath $Exe)) {\n        return $null\n    }\n\n    try {\n        $output = (& $Exe version 2>&1 | Out-String)\n        if ($output -match \"sing-box version\\s+([0-9.]+)\") {\n            return $Matches[1]\n        }\n    } catch {}\n\n    return $null\n}\n\nfunction Is-Administrator {\n    try {\n        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()\n        $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)\n        return $principal.IsInRole(\n            [System.Security.Principal.WindowsBuiltInRole]::Administrator\n        )\n    } catch {\n        return $false\n    }\n}\n\nif (-not (Is-Administrator)) {\n    Log \"bootstrap iniciado sem admin; solicitando UAC\"\n\n    Write-Status @{\n        version = \"2.0.9\"\n        updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n        bootstrapOk = $false\n        stage = \"waiting-uac\"\n        singBoxVersion = (Current-Version)\n        singBoxExe = $Exe\n        taskName = $TaskName\n        processRunning = $false\n        tunUp = $false\n        lastError = $null\n    }\n\n    try {\n        $quotedScript = '\"' + $PSCommandPath.Replace('\"', '\"\"') + '\"'\n        $argumentString = \"-NoProfile -ExecutionPolicy Bypass -File $quotedScript -Elevated\"\n\n        $elevatedProcess = Start-Process `\n            -FilePath $PowerShellExe `\n            -Verb RunAs `\n            -ArgumentList $argumentString `\n            -Wait `\n            -PassThru\n\n        $code = [int]$elevatedProcess.ExitCode\n        Log \"processo elevado terminou com ExitCode=$code\"\n        exit $code\n    } catch {\n        $message = $_.Exception.Message\n        Log \"UAC/elevacao falhou: $message\"\n\n        Write-Status @{\n            version = \"2.0.9\"\n            updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n            bootstrapOk = $false\n            stage = \"uac-failed\"\n            singBoxVersion = (Current-Version)\n            singBoxExe = $Exe\n            taskName = $TaskName\n            processRunning = $false\n            tunUp = $false\n            lastError = $message\n        }\n\n        exit 10\n    }\n}\n\nLog \"bootstrap elevado iniciado (admin=sim)\"\n\nWrite-Status @{\n    version = \"2.0.9\"\n    updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n    bootstrapOk = $false\n    stage = \"elevated-start\"\n    singBoxVersion = (Current-Version)\n    singBoxExe = $Exe\n    taskName = $TaskName\n    processRunning = $false\n    tunUp = $false\n    lastError = $null\n}\n\nfunction Resolve-StableRelease {\n    try {\n        $headers = @{\n            \"User-Agent\" = \"GoLiveDeQueijo/1.8.3\"\n            \"Accept\" = \"application/vnd.github+json\"\n        }\n\n        $release = Invoke-RestMethod `\n            -UseBasicParsing `\n            -Headers $headers `\n            -Uri \"https://api.github.com/repos/SagerNet/sing-box/releases/latest\"\n\n        $tag = [string]$release.tag_name\n        $asset = $release.assets |\n            Where-Object {\n                $_.name -match '^sing-box-[0-9.]+-windows-amd64\\.zip$'\n            } |\n            Select-Object -First 1\n\n        if ($tag -and $asset -and $asset.browser_download_url) {\n            $script:Version = $tag.TrimStart(\"v\")\n            $script:ZipName = [string]$asset.name\n            $script:ZipUrl = [string]$asset.browser_download_url\n\n            Log (\n                \"release stable resolvido: \" +\n                \"${script:Version} -> ${script:ZipUrl}\"\n            )\n\n            return\n        }\n\n        throw \"release latest não trouxe asset windows-amd64\"\n    } catch {\n        $script:Version = $FallbackVersion\n        $script:ZipName = \"sing-box-$FallbackVersion-windows-amd64.zip\"\n        $script:ZipUrl =\n            \"https://github.com/SagerNet/sing-box/releases/download/v$FallbackVersion/$script:ZipName\"\n\n        Log (\n            \"falha consultando latest stable; usando fallback \" +\n            \"${FallbackVersion}: $($_.Exception.Message)\"\n        )\n    }\n}\n\nfunction Ensure-Binary {\n    Resolve-StableRelease\n\n    $current = Current-Version\n\n    if ($current -eq $Version) {\n        Log \"sing-box ${Version} já está presente\"\n        return\n    }\n\n    Log \"baixando sing-box oficial ${Version}: $ZipUrl\"\n\n    Remove-Item `\n        -Force `\n        -LiteralPath $ZipPath `\n        -ErrorAction SilentlyContinue\n\n    Remove-Item `\n        -Recurse `\n        -Force `\n        -LiteralPath $ExtractRoot `\n        -ErrorAction SilentlyContinue\n\n    Invoke-WebRequest `\n        -UseBasicParsing `\n        -Headers @{\n            \"User-Agent\" = \"GoLiveDeQueijo/1.8.3\"\n        } `\n        -Uri $ZipUrl `\n        -OutFile $ZipPath\n\n    New-Item `\n        -ItemType Directory `\n        -Force `\n        -Path $ExtractRoot |\n        Out-Null\n\n    Expand-Archive `\n        -LiteralPath $ZipPath `\n        -DestinationPath $ExtractRoot `\n        -Force\n\n    $found =\n        Get-ChildItem `\n            -LiteralPath $ExtractRoot `\n            -Recurse `\n            -Filter \"sing-box.exe\" |\n        Select-Object -First 1\n\n    if (-not $found) {\n        throw \"sing-box.exe não foi encontrado no ZIP oficial\"\n    }\n\n    Copy-Item `\n        -Force `\n        -LiteralPath $found.FullName `\n        -Destination $Exe\n\n    $installed = Current-Version\n\n    if ($installed -ne $Version) {\n        throw \"versão instalada '$installed', esperada '$Version'\"\n    }\n\n    Log \"sing-box ${Version} instalado\"\n\n    Remove-Item `\n        -Force `\n        -LiteralPath $ZipPath `\n        -ErrorAction SilentlyContinue\n\n    Remove-Item `\n        -Recurse `\n        -Force `\n        -LiteralPath $ExtractRoot `\n        -ErrorAction SilentlyContinue\n}\n\nfunction Validate-Config {\n    if (-not (Test-Path -LiteralPath $Config)) {\n        throw \"config ausente: $Config\"\n    }\n\n    $output = & $Exe check -c $Config 2>&1 | Out-String\n\n    if ($LASTEXITCODE -ne 0) {\n        throw \"sing-box check falhou:`n$output\"\n    }\n\n    Log \"config sing-box validada\"\n}\n\nfunction Write-Runner {\n    $runnerBody = @'\nparam(\n    [string]$Exe,\n    [string]$Config,\n    [string]$Log\n)\n\n$ErrorActionPreference = \"Continue\"\n\nfunction Runner-Log([string]$Message) {\n    try {\n        Add-Content `\n            -LiteralPath $Log `\n            -Value (\"{0:o} [runner] {1}\" -f (Get-Date), $Message) `\n            -Encoding UTF8\n    } catch {}\n}\n\nRunner-Log \"runner iniciado\"\n\nwhile ($true) {\n    try {\n        if (-not (Test-Path -LiteralPath $Exe)) {\n            Runner-Log \"sing-box.exe ausente; aguardando\"\n            Start-Sleep -Seconds 5\n            continue\n        }\n\n        if (-not (Test-Path -LiteralPath $Config)) {\n            Runner-Log \"config ausente; aguardando\"\n            Start-Sleep -Seconds 5\n            continue\n        }\n\n        Runner-Log \"iniciando sing-box oculto\"\n\n        $process = Start-Process `\n            -FilePath $Exe `\n            -ArgumentList @(\n                \"run\",\n                \"-c\",\n                ('\"' + $Config + '\"')\n            ) `\n            -WindowStyle Hidden `\n            -PassThru `\n            -Wait\n\n        $code = [int]$process.ExitCode\n\n        Runner-Log \"sing-box terminou com ExitCode=$code; reiniciando em 2s\"\n    } catch {\n        Runner-Log \"erro ao iniciar sing-box: $($_.Exception.Message)\"\n    }\n\n    Start-Sleep -Seconds 2\n}\n'@\n\n    $encoding = New-Object System.Text.UTF8Encoding($false)\n    [System.IO.File]::WriteAllText(\n        $Runner,\n        $runnerBody,\n        $encoding\n    )\n\n    Log \"runner oculto gravado em $Runner\"\n}\n\nfunction Register-Task {\n    $identity =\n        [System.Security.Principal.WindowsIdentity]::GetCurrent().Name\n\n    try {\n        Stop-ScheduledTask `\n            -TaskName $TaskName `\n            -ErrorAction SilentlyContinue\n    } catch {}\n\n    try {\n        Unregister-ScheduledTask `\n            -TaskName $TaskName `\n            -Confirm:$false `\n            -ErrorAction SilentlyContinue\n    } catch {}\n\n    Write-Runner\n\n    $runnerArgs =\n        \"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden \" +\n        \"-File `\"$Runner`\" \" +\n        \"-Exe `\"$Exe`\" \" +\n        \"-Config `\"$Config`\" \" +\n        \"-Log `\"$RunnerLog`\"\"\n\n    $action =\n        New-ScheduledTaskAction `\n            -Execute $PowerShellExe `\n            -Argument $runnerArgs\n\n    $trigger =\n        New-ScheduledTaskTrigger `\n            -AtLogOn `\n            -User $identity\n\n    $principal =\n        New-ScheduledTaskPrincipal `\n            -UserId $identity `\n            -LogonType Interactive `\n            -RunLevel Highest\n\n    $settings =\n        New-ScheduledTaskSettingsSet `\n            -AllowStartIfOnBatteries `\n            -DontStopIfGoingOnBatteries `\n            -ExecutionTimeLimit ([TimeSpan]::Zero) `\n            -MultipleInstances IgnoreNew\n\n    Register-ScheduledTask `\n        -TaskName $TaskName `\n        -Action $action `\n        -Trigger $trigger `\n        -Principal $principal `\n        -Settings $settings `\n        -Force |\n        Out-Null\n\n    Start-ScheduledTask `\n        -TaskName $TaskName\n\n    Log \"tarefa $TaskName criada com runner oculto/background\"\n}\n\nfunction Wait-Ready {\n    $deadline = (Get-Date).AddSeconds(20)\n\n    while ((Get-Date) -lt $deadline) {\n        $proc = Get-Process -Name \"sing-box\" -ErrorAction SilentlyContinue |\n            Select-Object -First 1\n\n        $adapter = Get-NetAdapter -ErrorAction SilentlyContinue |\n            Where-Object {\n                $_.Name -like \"$TunName*\" -or\n                $_.InterfaceDescription -like \"*sing-box*\" -or\n                $_.InterfaceDescription -like \"*Wintun*\"\n            } |\n            Select-Object -First 1\n\n        if ($proc -and $adapter -and $adapter.Status -eq \"Up\") {\n            return @{\n                processRunning = $true\n                pid = [int]$proc.Id\n                tunUp = $true\n                interfaceName = [string]$adapter.Name\n                interfaceDescription = [string]$adapter.InterfaceDescription\n            }\n        }\n\n        Start-Sleep -Milliseconds 500\n    }\n\n    $proc = Get-Process -Name \"sing-box\" -ErrorAction SilentlyContinue |\n        Select-Object -First 1\n\n    $adapter = Get-NetAdapter -ErrorAction SilentlyContinue |\n        Where-Object {\n            $_.Name -like \"$TunName*\" -or\n            $_.InterfaceDescription -like \"*sing-box*\" -or\n            $_.InterfaceDescription -like \"*Wintun*\"\n        } |\n        Select-Object -First 1\n\n    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue\n    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue\n\n    $p = if ($proc) { \"running\" } else { \"missing\" }\n    $a = if ($adapter) { [string]$adapter.Status } else { \"missing\" }\n    $t = if ($task) { [string]$task.State } else { \"missing\" }\n    $r = if ($taskInfo) { [string]$taskInfo.LastTaskResult } else { \"?\" }\n\n    throw \"sing-box/TUN não ficou pronto: process=$p adapter=$a task=$t lastTaskResult=$r\"\n}\n\ntry {\n    Stop-OldWireGuard\n    Stop-OldSingBox\n    Ensure-Binary\n    Validate-Config\n    Register-Task\n\n    Write-Status @{\n        version = \"2.0.9\"\n        updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n        bootstrapOk = $true\n        stage = \"background-runner-created\"\n        singBoxVersion = $Version\n        singBoxExe = $Exe\n        taskName = $TaskName\n        processRunning = $false\n        tunUp = $false\n        lastError = $null\n    }\n\n    Log \"bootstrap concluído: binário/config/tarefa prontos\"\n    exit 0\n} catch {\n    $message = $_.Exception.Message\n\n    Log \"ERRO: $message\"\n\n    Write-Status @{\n        version = \"2.0.9\"\n        updatedAt = (Get-Date).ToUniversalTime().ToString(\"o\")\n        bootstrapOk = $false\n        stage = \"failed\"\n        singBoxVersion = (Current-Version)\n        singBoxExe = $Exe\n        taskName = $TaskName\n        processRunning = $false\n        tunUp = $false\n        lastError = $message\n    }\n\n    exit 1\n}\n";
const NATIVE_HOOK_SOURCE = "/*\n * GoLiveBypassBD Native Main Hook\n * Loaded in Discord's main process before BetterDiscord.\n * SPDX-License-Identifier: GPL-3.0-or-later\n *\n * Purpose:\n * - create a localhost SOCKS router\n * - find/test a non-excluded SOCKS5 exit\n * - apply an Electron PAC directly with session.defaultSession.setProxy()\n * - route ONLY Discord gateway hosts through the local router\n * - leave voice/video/CDN/direct traffic alone\n */\n\n\"use strict\";\n\nconst {app, session} = require(\"electron\");\nconst net = require(\"net\");\nconst tls = require(\"tls\");\nconst https = require(\"https\");\nconst dgram = require(\"dgram\");\nconst fs = require(\"fs\");\nconst path = require(\"path\");\nconst childProcess = require(\"child_process\");\n\nconst BASE = process.env.LOCALAPPDATA\n    ? path.join(process.env.LOCALAPPDATA, \"GoLiveBypassBD\")\n    : path.join(__dirname, \"GoLiveBypassBD\");\n\nconst SETTINGS = path.join(BASE, \"settings.json\");\nconst CONSENT_CONFIG = path.join(BASE, \"GoLiveBypassBD.config.json\");\nconst STATUS = path.join(BASE, \"native-status.json\");\nconst LOG = path.join(BASE, \"native.log\");\nconst PROXY_CACHE = path.join(BASE, \"proxy-cache.json\");\nconst AUTO_BEST_CACHE = path.join(BASE, \"best-proxies.json\");\nconst AUTO_PROXY_CATALOG = path.join(BASE, \"proxy-catalog.json\");\nconst BEST_ROUTES = path.join(BASE, \"best-routes.json\");\nconst VOICE_PRELOAD = path.join(BASE, \"voice-preload.js\");\nconst VOICE_STATUS = path.join(BASE, \"voice-status.json\");\nconst ROUTE_TARGETS = path.join(BASE, \"route-targets.json\");\nconst WG_STATUS = path.join(BASE, \"wg-route-status.json\");\nconst WG_COMMAND = path.join(BASE, \"wg-command.json\");\nconst WG_COMMAND_RESULT = path.join(BASE, \"wg-command-result.json\");\nconst WG_BOOTSTRAP = path.join(BASE, \"wg-bootstrap.ps1\");\nconst SINGBOX_COMMAND = path.join(BASE, \"singbox-command.json\");\nconst SINGBOX_COMMAND_RESULT = path.join(BASE, \"singbox-command-result.json\");\nconst SINGBOX_BOOTSTRAP = path.join(BASE, \"singbox-bootstrap.ps1\");\nconst SINGBOX_INSTALL_STATUS = path.join(BASE, \"singbox-install-status.json\");\nconst WINDOWS_ROOT =\n    process.env.SystemRoot ||\n    process.env.WINDIR ||\n    \"C:\\\\Windows\";\n\nconst POWERSHELL_EXE = (() => {\n    const candidates = [\n        path.join(\n            WINDOWS_ROOT,\n            \"System32\",\n            \"WindowsPowerShell\",\n            \"v1.0\",\n            \"powershell.exe\"\n        ),\n        path.join(\n            WINDOWS_ROOT,\n            \"Sysnative\",\n            \"WindowsPowerShell\",\n            \"v1.0\",\n            \"powershell.exe\"\n        ),\n        path.join(\n            process.env.ProgramFiles || \"C:\\\\Program Files\",\n            \"PowerShell\",\n            \"7\",\n            \"pwsh.exe\"\n        )\n    ];\n\n    for (const candidate of candidates) {\n        try {\n            if (fs.existsSync(candidate)) {\n                return candidate;\n            }\n        } catch {}\n    }\n\n    return \"powershell.exe\";\n})();\n\nconst SINGBOX_CONFIG = path.join(BASE, \"singbox-config.json\");\nconst SINGBOX_LOG = path.join(BASE, \"singbox.log\");\n\nconst INTERNAL_PROXY_SOURCES = [\n    {\n        type: \"structured-json\",\n        priority: 0,\n        country: null,\n        url: \"https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/socks5/data.json\"\n    },\n    {\n        type: \"proxifly-json\",\n        priority: 0,\n        country: null,\n        url: \"https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.json\"\n    },\n    {\n        type: \"plain\",\n        priority: 0,\n        country: null,\n        url: \"https://raw.githubusercontent.com/proxio-io/proxy-list/main/socks5.txt\"\n    },\n    {\n        type: \"plain\",\n        priority: 1,\n        country: null,\n        url: \"https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/socks5.txt\"\n    },\n    {\n        type: \"plain\",\n        priority: 1,\n        country: null,\n        url: \"https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/socks5.txt\"\n    },\n    {\n        type: \"plain\",\n        priority: 1,\n        country: null,\n        url: \"https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks5.txt\"\n    },\n    {\n        type: \"plain\",\n        priority: 2,\n        country: null,\n        url: \"https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt\"\n    },\n    {\n        type: \"plain\",\n        priority: 2,\n        country: null,\n        url: \"https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt\"\n    }\n];\n\nconst REMOTE_ROUTE_JSON_URLS = [\n    \"https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/routes.json\",\n    \"https://cdn.jsdelivr.net/gh/paodequeijo616/GoLiveBypass_BetterDiscord@main/routes.json\"\n];\n\nconst REMOTE_ROUTE_TXT_URLS = [\n    \"https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/routes.txt\",\n    \"https://cdn.jsdelivr.net/gh/paodequeijo616/GoLiveBypass_BetterDiscord@main/routes.txt\"\n];\n\nconst REMOTE_ROUTE_JSON_CACHE = path.join(BASE, \"routes-data-cache.json\");\nconst REMOTE_ROUTE_TXT_CACHE = path.join(BASE, \"routes-data-cache.txt\");\n\nconst REMOTE_ROUTE_DATA_TIMEOUT = 25000;\nconst ROUTE_SOURCE_DOWNLOAD_WORKERS = 12;\n\n// Shards explícitos por país. Se não houver SOCKS5 naquele país,\n// jsDelivr responde 404 e a busca simplesmente continua.\nconst AUTO_NEAR_COUNTRY_SHARDS = [\n    \"ar\", \"uy\", \"py\", \"bo\", \"cl\",\n    \"pe\", \"co\", \"ec\", \"ve\",\n    \"pa\", \"cr\", \"mx\",\n    \"us\", \"ca\",\n    \"pt\", \"es\", \"gb\", \"fr\", \"nl\", \"de\"\n];\n\nconst PROBE_TIMEOUT = 5500;\nconst SOURCE_TIMEOUT = 12000;\nconst SELECTION_BUDGET = 18000;\nconst HOLD_GATEWAY_MS = 12000;\nconst POOL_SIZE = 4;\nconst MAX_CANDIDATES = 180;\nconst HEARTBEAT_MS = 20000;\nconst AUTO_UDP_TIMEOUT = 3200;\nconst AUTO_PROXY_BUDGET = 70000;\nconst AUTO_PROXY_WORKERS = 28;\nconst AUTO_PROXY_MAX = 0; // 0 = sem limite no modo automático.\n\nconst AUTO_INSTANT_UDP_MS = 150;\nconst AUTO_TARGET_UDP_MS = 200;\nconst AUTO_STAGE2_UDP_MS = 300;\nconst AUTO_STAGE3_UDP_MS = 450;\nconst AUTO_HARD_MAX_UDP_MS = 750;\nconst AUTO_GATEWAY_MAX_MS = 1800;\n\nconst AUTO_STAGE1_AFTER_MS = 18000;\nconst AUTO_STAGE2_AFTER_MS = 32000;\nconst AUTO_STAGE3_AFTER_MS = 48000;\nconst AUTO_FORCE_AFTER_MS = 65000;\n\nconst AUTO_BEST_CACHE_MAX = 24;\nconst AUTO_BEST_CACHE_TEST_MAX = 12;\nconst AUTO_BEST_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;\n\n// Media Route Race - Go Live + câmera.\n// Menor é melhor; não existe limite mínimo de 70ms.\nconst ROUTE_ELITE_MS = 90;\nconst ROUTE_EXCELLENT_MS = 120;\nconst ROUTE_TARGET_MS = 150;\nconst ROUTE_ACCEPTABLE_MS = 200;\n\nconst ROUTE_DIRECT_SWITCH_RTT_MS = 190;\nconst ROUTE_MIN_IMPROVEMENT_MS = 40;\nconst ROUTE_MAX_JITTER_MS = 35;\nconst ROUTE_MAX_LOSS_PCT = 5;\n\nconst ROUTE_FAST_WORKERS = 48;\nconst ROUTE_FAST_BUDGET_MS = 40000;\nconst ROUTE_FAST_MAX_TESTS = 2200;\nconst ROUTE_FAST_SHORTLIST_MAX = 16;\nconst ROUTE_FAST_UDP_TIMEOUT_MS = 1900;\n\nconst ROUTE_QUALITY_ROUNDS = 5;\nconst ROUTE_QUALITY_WORKERS = 4;\nconst ROUTE_MEMORY_MAX = 20;\nconst ROUTE_MEMORY_MAX_AGE = 14 * 24 * 60 * 60 * 1000;\n\nlet routeOptimizerBusy = false;\nlet routeOptimizerBest = null;\nlet routeOptimizerTimer = null;\nlet routeOptimizerPromise = null;\n\nconst AUTO_COUNTRY_TIERS = [\n    [\"AR\", \"UY\", \"PY\", \"BO\", \"CL\"],\n    [\"PE\", \"CO\", \"EC\", \"VE\", \"GY\", \"SR\", \"GF\"],\n    [\"PA\", \"CR\", \"GT\", \"HN\", \"NI\", \"SV\", \"BZ\", \"MX\", \"PR\", \"DO\", \"US\"],\n    [\"CA\"],\n    [\"PT\", \"ES\", \"GB\", \"IE\", \"FR\", \"NL\", \"BE\", \"DE\", \"CH\", \"IT\", \"LU\"],\n    [\"AT\", \"CZ\", \"PL\", \"DK\", \"NO\", \"SE\", \"FI\", \"EE\", \"LV\", \"LT\", \"SK\", \"SI\", \"HR\", \"HU\", \"RO\", \"BG\", \"GR\", \"RS\", \"BA\", \"MK\", \"AL\", \"MD\", \"UA\"],\n    [\"ZA\", \"AO\", \"MZ\", \"NA\", \"BW\", \"ZM\", \"ZW\", \"KE\", \"NG\", \"GH\", \"MA\", \"TN\", \"EG\"],\n    [\"TR\", \"IL\", \"AE\", \"SA\", \"QA\", \"AM\", \"GE\", \"KZ\"],\n    [\"IN\", \"PK\", \"BD\", \"LK\", \"TH\", \"VN\", \"MY\", \"SG\", \"ID\", \"PH\", \"HK\", \"TW\", \"CN\", \"KR\", \"JP\"],\n    [\"AU\", \"NZ\"]\n];\n\nconst AUTO_COUNTRY_RANK = (() => {\n    const map = new Map();\n    AUTO_COUNTRY_TIERS.forEach((countries, tier) => {\n        for (const country of countries) map.set(country, tier);\n    });\n    return map;\n})();\n\nconst AUTO_CATALOG_FLUSH_MS = 1200;\nconst AUTO_RECENT_FAIL_DEFER_MS = 30 * 60 * 1000;\nconst AUTO_RETRY_OLD_FAIL_MS = 6 * 60 * 60 * 1000;\nlet autoCatalogMap = null;\nlet autoCatalogFlushTimer = null;\n\nlet directMonitorBusy = false;\nlet directFallbackTriggered = false;\nlet directFallbackPromise = null;\nlet directMonitorTimer = null;\nlet uninstallInProgress = false;\nconst DIRECT_REMOTE_FAIL_MS = 12000;\nconst DIRECT_STATUS_INTERVAL_MS = 1500;\nconst sleep = ms => new Promise(resolve => setTimeout(resolve, ms));\n\nlet router = null;\nlet routerPort = 0;\nlet pool = [];\nlet selecting = null;\nlet current = null;\nlet shuttingDown = false;\nlet lastGatewayViaProxy = false;\nlet lastRecoveryReconnectAt = 0;\nlet selectionAttempt = 0;\nlet manualHeartbeatFailures = 0;\nlet autoProxyCurrent = null;\nlet autoProxySelectionBusy = false;\nlet streamHeartbeatFailures = 0;\nlet gatewayRouteSeq = 0;\nlet mediaRouteSeq = 0;\nconst activeGatewayPairs = new Set();\nlet heartbeatTimer = null;\nlet repairTimer = null;\nlet startupRepairTimer = null;\nconst activeSockets = new Set();\nconst NATIVE_SINGLETON_KEY = \"__GO_LIVE_DE_QUEIJO_NATIVE_STARTED__\";\nconst VOICE_PRELOAD_SOURCE = \"\\\"use strict\\\";\\n\\n(() => {\\n    if (globalThis.__GLQ_VOICE_209__) return;\\n    globalThis.__GLQ_VOICE_209__ = true;\\n\\n    const fs = require(\\\"fs\\\");\\n    const path = require(\\\"path\\\");\\n    const {webFrame} = require(\\\"electron\\\");\\n\\n    const BASE = process.env.LOCALAPPDATA\\n        ? path.join(process.env.LOCALAPPDATA, \\\"GoLiveBypassBD\\\")\\n        : path.join(process.cwd(), \\\"GoLiveBypassBD\\\");\\n\\n    const LOG = path.join(BASE, \\\"native.log\\\");\\n    const STATUS = path.join(BASE, \\\"voice-status.json\\\");\\n    const COMMAND = path.join(BASE, \\\"voice-command.json\\\");\\n    const SETTINGS = path.join(BASE, \\\"settings.json\\\");\\n    const ROUTE_TARGETS = path.join(BASE, \\\"route-targets.json\\\");\\n    const WG_STATUS = path.join(BASE, \\\"wg-route-status.json\\\");\\n\\n    const STREAM_WARMUP_MS = 20_000;\\n    const INPUT_ALIVE_MS = 15_000;\\n    const OUTPUT_STALL_MS = 20_000;\\n    const DEMAND_FRESH_MS = 45_000;\\n    const RECOVERY_COOLDOWN_MS = 30_000;\\n    const RECOVERY_WINDOW_MS = 30 * 60_000;\\n    const RECOVERY_MAX = 2;\\n    const VIEWER_TIMEOUT_MS = 6500;\\n    const VIEWER_RECOVERY_COOLDOWN_MS = 30000;\\n    const VIEWER_RECOVERY_WINDOW_MS = 30 * 60_000;\\n    const VIEWER_RECOVERY_MAX = 2;\\n\\n    const state = {\\n        instanceId: Date.now(),\\n        installed: false,\\n        moduleSeen: false,\\n        hookError: null,\\n        nextId: 1,\\n        pendingKind: null,\\n        connections: [],\\n        seen: new WeakMap(),\\n        modules: new WeakSet(),\\n        demandKnown: false,\\n        demandActive: false,\\n        demandAt: 0,\\n        demandChangedAt: 0,\\n        commandNonce: null,\\n        recoveryAttempts: [],\\n        lastRecoveryAt: 0,\\n        lastRecoveryResult: null,\\n        lastRecoveryStreamId: null,\\n        viewerRecoveryAttempts: [],\\n        lastViewerRecoveryAt: 0,\\n        lastViewerRecoveryResult: null,\\n        lastViewerRecoveryId: null,\\n        lastRemoteFailure: null\\n    };\\n\\n    function mkdir() {\\n        try { fs.mkdirSync(BASE, {recursive: true}); } catch {}\\n    }\\n\\n    function log(message) {\\n        mkdir();\\n        try {\\n            fs.appendFileSync(\\n                LOG,\\n                `${new Date().toISOString()} [voice] ${message}\\\\n`,\\n                \\\"utf8\\\"\\n            );\\n        } catch {}\\n    }\\n\\n    function readJson(file, fallback = null) {\\n        try { return JSON.parse(fs.readFileSync(file, \\\"utf8\\\")); }\\n        catch { return fallback; }\\n    }\\n\\n    function finite(value) {\\n        return typeof value === \\\"number\\\" && Number.isFinite(value) ? value : null;\\n    }\\n\\n    function safeKey(key) {\\n        key = String(key);\\n        if (/^[0-9]{10,}$/.test(key)) return \\\"<numeric>\\\";\\n        if (/^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/.test(key)) return key;\\n        return \\\"<dynamic>\\\";\\n    }\\n\\n    function shape(value, depth = 0, seen = new WeakSet()) {\\n        if (value === null) return \\\"null\\\";\\n        if (value === undefined) return \\\"undefined\\\";\\n        if (depth > 3) return typeof value;\\n        if (Array.isArray(value)) return {type: \\\"array\\\", length: value.length};\\n        if (typeof value !== \\\"object\\\") return typeof value;\\n        if (seen.has(value)) return \\\"circular\\\";\\n        seen.add(value);\\n\\n        const out = {};\\n        let keys = [];\\n        try { keys = Object.keys(value).slice(0, 80); }\\n        catch { return \\\"inacessivel\\\"; }\\n\\n        for (const key of keys) {\\n            const clean = safeKey(key);\\n            try {\\n                out[clean] = shape(value[key], depth + 1, seen);\\n            } catch {\\n                out[clean] = \\\"getter-error\\\";\\n            }\\n        }\\n\\n        return out;\\n    }\\n\\n\\n    const MEDIA_SHIM_SOURCE = `\\n(() => {\\n    if (window.__GLQ_MEDIA_1610__) return;\\n    window.__GLQ_MEDIA_1610__ = true;\\n\\n    const OriginalWebSocket = window.WebSocket;\\n    const media = new Set();\\n    let lastOpenAt = 0;\\n    let lastCloseAt = 0;\\n\\n    function isMedia(url) {\\n        try {\\n            return /(^|\\\\\\\\.)discord\\\\\\\\.media$/i.test(new URL(String(url)).hostname);\\n        } catch {\\n            return false;\\n        }\\n    }\\n\\n    function WrappedWebSocket(url, protocols) {\\n        const ws = protocols === undefined\\n            ? new OriginalWebSocket(url)\\n            : new OriginalWebSocket(url, protocols);\\n\\n        try {\\n            if (isMedia(url)) {\\n                media.add(ws);\\n                ws.addEventListener(\\\"open\\\", () => { lastOpenAt = Date.now(); });\\n                ws.addEventListener(\\\"close\\\", () => {\\n                    media.delete(ws);\\n                    lastCloseAt = Date.now();\\n                });\\n            }\\n        } catch {}\\n\\n        return ws;\\n    }\\n\\n    try {\\n        Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);\\n        WrappedWebSocket.prototype = OriginalWebSocket.prototype;\\n        window.WebSocket = WrappedWebSocket;\\n    } catch {}\\n\\n    window.__glqMediaResumo = () => ({\\n        open: Array.from(media).filter(ws => ws.readyState === 1).length,\\n        lastOpenAt,\\n        lastCloseAt\\n    });\\n\\n    window.__glqMediaFechar = () => {\\n        let n = 0;\\n        media.forEach(ws => {\\n            try {\\n                if (ws.readyState === 1) {\\n                    ws.close(4000, \\\"golive-revive-voz\\\");\\n                    n++;\\n                }\\n            } catch {}\\n        });\\n        return n;\\n    };\\n})();\\n`;\\n\\n    function installMediaShim() {\\n        try {\\n            if (!webFrame || typeof webFrame.executeJavaScript !== \\\"function\\\") {\\n                log(\\\"viewer.media | webFrame indisponível\\\");\\n                return;\\n            }\\n\\n            webFrame.executeJavaScript(MEDIA_SHIM_SOURCE)\\n                .then(() => log(\\\"viewer.media | shim *.discord.media instalado\\\"))\\n                .catch(e => log(`viewer.media | shim falhou: ${e?.message || e}`));\\n        } catch (e) {\\n            log(`viewer.media | shim falhou: ${e?.message || e}`);\\n        }\\n    }\\n\\n    function viewerSettings() {\\n        return readJson(SETTINGS, {}) || {};\\n    }\\n\\n    function cleanupViewerAttempts() {\\n        const now = Date.now();\\n        state.viewerRecoveryAttempts = state.viewerRecoveryAttempts.filter(\\n            t => t >= now - VIEWER_RECOVERY_WINDOW_MS\\n        );\\n    }\\n\\n    function recoverViewer(rec, reason) {\\n        const settings = viewerSettings();\\n        if (settings.autoRecoverViewer === false) return false;\\n\\n        cleanupViewerAttempts();\\n\\n        const now = Date.now();\\n\\n        if (now - state.lastViewerRecoveryAt < VIEWER_RECOVERY_COOLDOWN_MS) {\\n            return false;\\n        }\\n\\n        if (state.viewerRecoveryAttempts.length >= VIEWER_RECOVERY_MAX) {\\n            state.lastViewerRecoveryResult = \\\"limit\\\";\\n            log(\\\"viewer.revive | teto de tentativas atingido\\\");\\n            writeStatus();\\n            return false;\\n        }\\n\\n        state.viewerRecoveryAttempts.push(now);\\n        state.lastViewerRecoveryAt = now;\\n        state.lastViewerRecoveryId = rec?.id || null;\\n        state.lastViewerRecoveryResult = \\\"requested\\\";\\n\\n        log(\\n            `viewer.revive | fechando somente *.discord.media ` +\\n            `id=${rec?.id ?? \\\"?\\\"} reason=${reason}`\\n        );\\n\\n        try {\\n            webFrame.executeJavaScript(\\n                \\\"window.__glqMediaFechar ? window.__glqMediaFechar() : -1\\\"\\n            ).then(value => {\\n                const n = Number(value);\\n                state.lastViewerRecoveryResult =\\n                    n > 0 ? `media-closed:${n}` : \\\"media-no-socket\\\";\\n\\n                log(\\n                    `viewer.revive | discord.media fechados=` +\\n                    `${Number.isFinite(n) ? n : \\\"?\\\"}`\\n                );\\n                writeStatus();\\n            }).catch(e => {\\n                state.lastViewerRecoveryResult = \\\"media-close-error\\\";\\n                log(`viewer.revive | falha: ${e?.message || e}`);\\n                writeStatus();\\n            });\\n\\n            return true;\\n        } catch (e) {\\n            state.lastViewerRecoveryResult = \\\"media-close-error\\\";\\n            log(`viewer.revive | falha: ${e?.message || e}`);\\n            writeStatus();\\n            return false;\\n        }\\n    }\\n\\n\\n    function touchWireGuardTarget(target, source = \\\"voice\\\") {\\n        target = String(target || \\\"\\\").trim();\\n\\n        if (!target) return false;\\n\\n        try {\\n            let body = {\\n                version: 1,\\n                updatedAt: null,\\n                targets: []\\n            };\\n\\n            try {\\n                const parsed = JSON.parse(\\n                    fs.readFileSync(ROUTE_TARGETS, \\\"utf8\\\")\\n                );\\n\\n                if (parsed && Array.isArray(parsed.targets)) {\\n                    body = parsed;\\n                }\\n            } catch {}\\n\\n            const now = Date.now();\\n\\n            body.targets = body.targets\\n                .filter(item => {\\n                    if (!item?.target) return false;\\n\\n                    const touched = Number(item.touchedAt || 0);\\n\\n                    return touched > 0 &&\\n                        now - touched < 15 * 60 * 1000;\\n                })\\n                .filter(\\n                    item => String(item.target) !== target\\n                );\\n\\n            body.targets.push({\\n                target,\\n                source,\\n                touchedAt: now\\n            });\\n\\n            body.updatedAt = new Date().toISOString();\\n\\n            const tmp = ROUTE_TARGETS + \\\".voice.tmp\\\";\\n\\n            fs.writeFileSync(\\n                tmp,\\n                JSON.stringify(body, null, 2),\\n                \\\"utf8\\\"\\n            );\\n\\n            try {\\n                fs.renameSync(tmp, ROUTE_TARGETS);\\n            } catch {\\n                fs.copyFileSync(tmp, ROUTE_TARGETS);\\n                try { fs.unlinkSync(tmp); } catch {}\\n            }\\n\\n            return true;\\n        } catch (e) {\\n            log(\\n                `wireguard.target.error | ${e?.message || e}`\\n            );\\n\\n            return false;\\n        }\\n    }\\n\\n    function wireGuardTargetReady(target) {\\n        try {\\n            const status = JSON.parse(\\n                fs.readFileSync(WG_STATUS, \\\"utf8\\\")\\n            );\\n\\n            return !!(\\n                status?.tunnelUp &&\\n                Array.isArray(status.readyTargets) &&\\n                status.readyTargets.includes(String(target))\\n            );\\n        } catch {\\n            return false;\\n        }\\n    }\\n\\n    function waitWireGuardTargetSync(target, timeoutMs = 1400) {\\n        const settings = readJson(SETTINGS, {});\\n\\n        if (\\n            String(settings?.networkMode || \\\"\\\").toLowerCase() !==\\n            \\\"wireguard\\\"\\n        ) {\\n            return true;\\n        }\\n\\n        const end = Date.now() + timeoutMs;\\n        let sleeper = null;\\n\\n        try {\\n            sleeper = new Int32Array(\\n                new SharedArrayBuffer(4)\\n            );\\n        } catch {}\\n\\n        while (Date.now() < end) {\\n            if (wireGuardTargetReady(target)) {\\n                return true;\\n            }\\n\\n            if (sleeper) {\\n                try {\\n                    Atomics.wait(\\n                        sleeper,\\n                        0,\\n                        0,\\n                        45\\n                    );\\n                    continue;\\n                } catch {}\\n            }\\n\\n            const until = Date.now() + 20;\\n\\n            while (Date.now() < until) {}\\n        }\\n\\n        return wireGuardTargetReady(target);\\n    }\\n\\n    function metricMs(key, value) {\\n        if (\\n            typeof value !== \\\"number\\\" ||\\n            !Number.isFinite(value) ||\\n            value < 0\\n        ) {\\n            return null;\\n        }\\n\\n        const clean =\\n            String(key || \\\"\\\")\\n                .toLowerCase();\\n\\n        if (\\n            /interval|timeout|target|buffer|bitrate|frame/.test(clean)\\n        ) {\\n            return null;\\n        }\\n\\n        let ms =\\n            value;\\n\\n        // RTC libraries frequently expose RTT/jitter in seconds.\\n        if (\\n            !/ms|millisecond/.test(clean) &&\\n            value > 0 &&\\n            value <= 10\\n        ) {\\n            ms =\\n                value * 1000;\\n        }\\n\\n        if (\\n            ms <= 0 ||\\n            ms > 5000\\n        ) {\\n            return null;\\n        }\\n\\n        return Math.round(\\n            ms * 10\\n        ) / 10;\\n    }\\n\\n    function lossPercent(key, value) {\\n        if (\\n            typeof value !== \\\"number\\\" ||\\n            !Number.isFinite(value) ||\\n            value < 0\\n        ) {\\n            return null;\\n        }\\n\\n        const clean =\\n            String(key || \\\"\\\")\\n                .toLowerCase();\\n\\n        if (\\n            !/(lossrate|loss_rate|packetloss|packet_loss|fractionlost|fraction_lost|losspercent|loss_percent)/.test(clean)\\n        ) {\\n            return null;\\n        }\\n\\n        let pct =\\n            value;\\n\\n        if (\\n            pct >= 0 &&\\n            pct <= 1\\n        ) {\\n            pct *= 100;\\n        }\\n\\n        if (\\n            pct < 0 ||\\n            pct > 100\\n        ) {\\n            return null;\\n        }\\n\\n        return Math.round(\\n            pct * 100\\n        ) / 100;\\n    }\\n\\n    function extractNetworkMetrics(\\n        root\\n    ) {\\n        const rtts = [];\\n        const jitters = [];\\n        const losses = [];\\n\\n        const seen =\\n            new WeakSet();\\n\\n        function walk(\\n            value,\\n            depth = 0\\n        ) {\\n            if (\\n                !value ||\\n                typeof value !== \\\"object\\\" ||\\n                depth > 7\\n            ) {\\n                return;\\n            }\\n\\n            if (\\n                seen.has(\\n                    value\\n                )\\n            ) {\\n                return;\\n            }\\n\\n            seen.add(\\n                value\\n            );\\n\\n            let entries = [];\\n\\n            try {\\n                entries =\\n                    Object.entries(\\n                        value\\n                    );\\n            } catch {\\n                return;\\n            }\\n\\n            for (\\n                const [key, child] of\\n                entries\\n            ) {\\n                const clean =\\n                    String(key)\\n                        .toLowerCase();\\n\\n                if (\\n                    typeof child === \\\"number\\\"\\n                ) {\\n                    if (\\n                        /(round.?trip|rtt|ping)/.test(clean)\\n                    ) {\\n                        const ms =\\n                            metricMs(\\n                                key,\\n                                child\\n                            );\\n\\n                        if (\\n                            ms !== null\\n                        ) {\\n                            rtts.push(\\n                                ms\\n                            );\\n                        }\\n                    }\\n\\n                    if (\\n                        /jitter/.test(clean)\\n                    ) {\\n                        const ms =\\n                            metricMs(\\n                                key,\\n                                child\\n                            );\\n\\n                        if (\\n                            ms !== null\\n                        ) {\\n                            jitters.push(\\n                                ms\\n                            );\\n                        }\\n                    }\\n\\n                    const loss =\\n                        lossPercent(\\n                            key,\\n                            child\\n                        );\\n\\n                    if (\\n                        loss !== null\\n                    ) {\\n                        losses.push(\\n                            loss\\n                        );\\n                    }\\n                } else if (\\n                    child &&\\n                    typeof child === \\\"object\\\"\\n                ) {\\n                    walk(\\n                        child,\\n                        depth + 1\\n                    );\\n                }\\n            }\\n        }\\n\\n        walk(\\n            root\\n        );\\n\\n        const pick =\\n            values => {\\n                const clean =\\n                    values\\n                        .filter(\\n                            value =>\\n                                Number.isFinite(\\n                                    value\\n                                )\\n                        )\\n                        .sort(\\n                            (a, b) =>\\n                                a - b\\n                        );\\n\\n                if (!clean.length) {\\n                    return null;\\n                }\\n\\n                // Use median rather than min to avoid unrelated tiny counters.\\n                return clean[\\n                    Math.floor(\\n                        clean.length /\\n                        2\\n                    )\\n                ];\\n            };\\n\\n        return {\\n            rttMs:\\n                pick(\\n                    rtts\\n                ),\\n            jitterMs:\\n                pick(\\n                    jitters\\n                ),\\n            packetLossPct:\\n                pick(\\n                    losses\\n                )\\n        };\\n    }\\n\\n    function normalizeStats(raw) {\\n        let parsed = raw;\\n\\n        if (typeof parsed === \\\"string\\\") {\\n            try { parsed = JSON.parse(parsed); }\\n            catch {\\n                return {ok: false, reason: \\\"json\\\"};\\n            }\\n        }\\n\\n        if (!parsed || typeof parsed !== \\\"object\\\") {\\n            return {ok: false, reason: \\\"formato\\\"};\\n        }\\n\\n        const outbound = parsed.outbound;\\n        let video = outbound && outbound.video;\\n\\n        if ((!video || typeof video !== \\\"object\\\") &&\\n            outbound &&\\n            Array.isArray(outbound.videos)) {\\n            for (const candidate of outbound.videos) {\\n                if (!candidate || typeof candidate !== \\\"object\\\") continue;\\n\\n                if (\\n                    !video ||\\n                    (finite(candidate.framesEncoded) || 0) >\\n                    (finite(video.framesEncoded) || 0)\\n                ) {\\n                    video = candidate;\\n                }\\n            }\\n        }\\n\\n        const screenshare = parsed.screenshare;\\n        let captureFrames = null;\\n\\n        if (screenshare && typeof screenshare === \\\"object\\\") {\\n            let total = 0;\\n            let found = false;\\n\\n            for (const key of Object.keys(screenshare)) {\\n                if (\\n                    !/frames$/i.test(key) ||\\n                    /(drop|fail|encode|sent|receive)/i.test(key)\\n                ) {\\n                    continue;\\n                }\\n\\n                const value = finite(screenshare[key]);\\n                if (value === null) continue;\\n\\n                total += value;\\n                found = true;\\n            }\\n\\n            if (found) captureFrames = total;\\n        }\\n\\n        if (!video || typeof video !== \\\"object\\\") {\\n            return {\\n                ok: false,\\n                reason: \\\"sem-video\\\"\\n            };\\n        }\\n\\n        const inputFrameRate = finite(video.inputFrameRate);\\n        const framesEncoded = finite(video.framesEncoded);\\n        const encodeFrameRate = finite(video.encodeFrameRate);\\n\\n        if (\\n            (captureFrames === null && inputFrameRate === null) ||\\n            framesEncoded === null ||\\n            encodeFrameRate === null\\n        ) {\\n            return {\\n                ok: false,\\n                reason: \\\"campos\\\"\\n            };\\n        }\\n\\n        const network =\\n            extractNetworkMetrics(\\n                parsed\\n            );\\n\\n        const mediaType =\\n            screenshare &&\\n            typeof screenshare === \\\"object\\\"\\n                ? \\\"golive\\\"\\n                : \\\"camera\\\";\\n\\n        return {\\n            ok: true,\\n            mediaType,\\n            rttMs:\\n                network.rttMs,\\n            jitterMs:\\n                network.jitterMs,\\n            packetLossPct:\\n                network.packetLossPct,\\n            captureFrames,\\n            inputFrameRate,\\n            framesEncoded,\\n            encodeFrameRate,\\n            mediaBitrate: finite(video.mediaBitrate),\\n            targetMediaBitrate: finite(video.targetMediaBitrate),\\n            width:\\n                Array.isArray(video.substreams) && video.substreams[0]\\n                    ? finite(video.substreams[0].width)\\n                    : null,\\n            height:\\n                Array.isArray(video.substreams) && video.substreams[0]\\n                    ? finite(video.substreams[0].height)\\n                    : null,\\n            suspended: video.suspended === true\\n        };\\n    }\\n\\n    function updateProgress(rec, stats) {\\n        const now = Date.now();\\n\\n        if (!rec.progress) {\\n            rec.progress = {\\n                inputValue: stats.captureFrames,\\n                outputValue: stats.framesEncoded,\\n                inputAt: now,\\n                outputAt: now\\n            };\\n        } else {\\n            if (\\n                (\\n                    stats.captureFrames !== null &&\\n                    stats.captureFrames !== rec.progress.inputValue\\n                ) ||\\n                (\\n                    stats.inputFrameRate !== null &&\\n                    stats.inputFrameRate > 0\\n                )\\n            ) {\\n                rec.progress.inputAt = now;\\n            }\\n\\n            if (\\n                stats.framesEncoded !== rec.progress.outputValue ||\\n                (\\n                    stats.encodeFrameRate !== null &&\\n                    stats.encodeFrameRate > 0\\n                )\\n            ) {\\n                rec.progress.outputAt = now;\\n            }\\n\\n            rec.progress.inputValue = stats.captureFrames;\\n            rec.progress.outputValue = stats.framesEncoded;\\n        }\\n\\n        return {\\n            statsOk: true,\\n            mediaType:\\n                stats.mediaType ||\\n                null,\\n            rttMs:\\n                stats.rttMs ??\\n                null,\\n            jitterMs:\\n                stats.jitterMs ??\\n                null,\\n            packetLossPct:\\n                stats.packetLossPct ??\\n                null,\\n            captureFrames: stats.captureFrames,\\n            framesEncoded: stats.framesEncoded,\\n            inputFrameRate: stats.inputFrameRate,\\n            encodeFrameRate: stats.encodeFrameRate,\\n            mediaBitrate: stats.mediaBitrate,\\n            targetMediaBitrate: stats.targetMediaBitrate,\\n            width: stats.width,\\n            height: stats.height,\\n            suspended: stats.suspended,\\n            inputAgeMs: now - rec.progress.inputAt,\\n            outputAgeMs: now - rec.progress.outputAt\\n        };\\n    }\\n\\n    function registerConnection(kind, creator, options, conn, meta = {}) {\\n        if (!conn || (typeof conn !== \\\"object\\\" && typeof conn !== \\\"function\\\")) {\\n            return conn;\\n        }\\n\\n        const existing = state.seen.get(conn);\\n\\n        if (existing) {\\n            if (\\n                (kind === \\\"stream\\\" || kind === \\\"remote-stream\\\") &&\\n                existing.kind !== kind\\n            ) {\\n                existing.kind = kind;\\n                existing.creator = creator;\\n                log(`voice.classify | id=${existing.id} -> ${kind} via=${creator}`);\\n            }\\n            return conn;\\n        }\\n\\n        const rec = {\\n            id: state.nextId++,\\n            kind,\\n            creator,\\n            createdAt: Date.now(),\\n            destroyedAt: 0,\\n            optionShape: shape(options),\\n            conn,\\n            progress: null,\\n            stats: null,\\n            statsError: null,\\n            promotedByStats: false,\\n            remoteStream: kind === \\\"remote-stream\\\",\\n            hasStreamUserId: options?.streamUserId != null,\\n            streamParametersCount:\\n                Array.isArray(options?.streamParameters)\\n                    ? options.streamParameters.length\\n                    : null,\\n            videoSupportedBefore:\\n                typeof meta.videoSupportedBefore === \\\"boolean\\\"\\n                    ? meta.videoSupportedBefore\\n                    : null,\\n            videoSupportedAfter:\\n                typeof options?.videoSupported === \\\"boolean\\\"\\n                    ? options.videoSupported\\n                    : null,\\n            firstFrameHooked: false,\\n            firstFrameAt: 0,\\n            decoderFallbackAt: 0\\n        };\\n\\n        state.seen.set(conn, rec);\\n        state.connections.push(rec);\\n\\n        if (state.connections.length > 40) {\\n            state.connections.shift();\\n        }\\n\\n        log(\\n            [\\n                \\\"voice.conn\\\",\\n                `id=${rec.id}`,\\n                `kind=${kind}`,\\n                `creator=${creator}`,\\n                `streamUser=${rec.hasStreamUserId ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                `videoSupported=${rec.videoSupportedBefore ?? \\\"?\\\"}->${rec.videoSupportedAfter ?? \\\"?\\\"}`,\\n                `streamParams=${rec.streamParametersCount ?? \\\"?\\\"}`,\\n                `shape=${JSON.stringify(rec.optionShape)}`\\n            ].join(\\\" | \\\")\\n        );\\n\\n        if (rec.remoteStream) {\\n            try {\\n                if (typeof conn.setOnFirstFrameCallback === \\\"function\\\") {\\n                    const original = conn.setOnFirstFrameCallback;\\n\\n                    conn.setOnFirstFrameCallback = function (callback) {\\n                        rec.firstFrameHooked = true;\\n\\n                        const wrapped =\\n                            typeof callback === \\\"function\\\"\\n                                ? function (...args) {\\n                                    if (!rec.firstFrameAt) {\\n                                        rec.firstFrameAt = Date.now();\\n                                        log(\\n                                            `viewer.first-frame | id=${rec.id} ` +\\n                                            `after=${rec.firstFrameAt - rec.createdAt}ms`\\n                                        );\\n                                        writeStatus();\\n                                    }\\n                                    return callback.apply(this, args);\\n                                }\\n                                : callback;\\n\\n                        return original.call(this, wrapped);\\n                    };\\n                }\\n            } catch (e) {\\n                log(`viewer.first-frame.hook.error | id=${rec.id} ${e?.message || e}`);\\n            }\\n\\n            try {\\n                if (typeof conn.setOnVideoDecoderFallbackCallback === \\\"function\\\") {\\n                    const original = conn.setOnVideoDecoderFallbackCallback;\\n\\n                    conn.setOnVideoDecoderFallbackCallback = function (callback) {\\n                        const wrapped =\\n                            typeof callback === \\\"function\\\"\\n                                ? function (...args) {\\n                                    rec.decoderFallbackAt = Date.now();\\n                                    log(`viewer.decoder-fallback | id=${rec.id}`);\\n                                    writeStatus();\\n                                    return callback.apply(this, args);\\n                                }\\n                                : callback;\\n\\n                        return original.call(this, wrapped);\\n                    };\\n                }\\n            } catch {}\\n\\n            // Healthy viewing normally produces a first frame in a few seconds.\\n            // The user's current build tears the receiver down around ~8s.\\n            setTimeout(() => {\\n                if (rec.destroyedAt || rec.firstFrameAt) return;\\n\\n                const age = Date.now() - rec.createdAt;\\n                if (age < VIEWER_TIMEOUT_MS) return;\\n\\n                log(\\n                    `viewer.stall | id=${rec.id} age=${age}ms ` +\\n                    `firstFrame=nao videoSupported=${rec.videoSupportedAfter ?? \\\"?\\\"}`\\n                );\\n\\n                recoverViewer(rec, \\\"sem-primeiro-frame\\\");\\n                writeStatus();\\n            }, VIEWER_TIMEOUT_MS);\\n        }\\n\\n        try {\\n            if (typeof conn.destroy === \\\"function\\\") {\\n                const originalDestroy = conn.destroy;\\n\\n                conn.destroy = function (...args) {\\n                    if (!rec.destroyedAt) {\\n                        rec.destroyedAt = Date.now();\\n                        const age = rec.destroyedAt - rec.createdAt;\\n\\n                        log(\\n                            `voice.conn.destroy | id=${rec.id} kind=${rec.kind} ` +\\n                            `creator=${rec.creator} age=${age}ms ` +\\n                            `firstFrame=${rec.firstFrameAt ? \\\"sim\\\" : \\\"nao\\\"}`\\n                        );\\n\\n                        if (\\n                            rec.remoteStream &&\\n                            !rec.firstFrameAt &&\\n                            age >= 1500\\n                        ) {\\n                            state.lastRemoteFailure = {\\n                                id: rec.id,\\n                                at: rec.destroyedAt,\\n                                ageMs: age,\\n                                videoSupportedBefore: rec.videoSupportedBefore,\\n                                videoSupportedAfter: rec.videoSupportedAfter\\n                            };\\n\\n                            log(\\n                                `viewer.fail | id=${rec.id} age=${age}ms ` +\\n                                `sem primeiro frame`\\n                            );\\n                        }\\n\\n                        writeStatus();\\n                    }\\n\\n                    return originalDestroy.apply(this, args);\\n                };\\n            }\\n        } catch {}\\n\\n        writeStatus();\\n        return conn;\\n    }\\n\\n    function hookVoiceModule(voice) {\\n        if (\\n            !voice ||\\n            (typeof voice !== \\\"object\\\" && typeof voice !== \\\"function\\\")\\n        ) {\\n            return voice;\\n        }\\n\\n        if (state.modules.has(voice)) return voice;\\n        state.modules.add(voice);\\n\\n        let wrappedFactories = 0;\\n\\n        for (const [name, kind] of [\\n            [\\\"createVoiceConnectionWithOptions\\\", \\\"voice\\\"],\\n            [\\\"createOwnStreamConnectionWithOptions\\\", \\\"stream\\\"]\\n        ]) {\\n            let original;\\n\\n            try { original = voice[name]; }\\n            catch { continue; }\\n\\n            if (typeof original !== \\\"function\\\") continue;\\n\\n            voice[name] = function (...args) {\\n                const options =\\n                    args[1] && typeof args[1] === \\\"object\\\"\\n                        ? args[1]\\n                        : null;\\n\\n                let effectiveKind = kind;\\n\\n                const meta = {\\n                    videoSupportedBefore:\\n                        typeof options?.videoSupported === \\\"boolean\\\"\\n                            ? options.videoSupported\\n                            : null\\n                };\\n\\n                // Confirmed by the user's real v1.8.0 log:\\n                // watching somebody else's Live is created by\\n                // createVoiceConnectionWithOptions + streamUserId.\\n                if (\\n                    name === \\\"createVoiceConnectionWithOptions\\\" &&\\n                    options?.streamUserId != null\\n                ) {\\n                    effectiveKind = \\\"remote-stream\\\";\\n\\n                    const settings = viewerSettings();\\n\\n                    if (\\n                        settings.forceViewerVideoSupported !== false &&\\n                        options.videoSupported !== true\\n                    ) {\\n                        try {\\n                            options.videoSupported = true;\\n                            log(\\n                                `viewer.patch | videoSupported ` +\\n                                `${meta.videoSupportedBefore ?? \\\"?\\\"}->true`\\n                            );\\n                        } catch (e) {\\n                            log(\\n                                `viewer.patch | falhou videoSupported: ` +\\n                                `${e?.message || e}`\\n                            );\\n                        }\\n                    }\\n                }\\n\\n                const currentNetwork =\\n                    readJson(\\n                        SETTINGS,\\n                        {}\\n                    );\\n\\n                if (\\n                    String(\\n                        currentNetwork\\n                            ?.networkMode ||\\n                        \\\"\\\"\\n                    ).toLowerCase() ===\\n                    \\\"singbox\\\"\\n                ) {\\n                    log(\\n                        `singbox.voice-route | ` +\\n                        `kind=${effectiveKind} ` +\\n                        \\\"process-tun=sim\\\"\\n                    );\\n                }\\n\\n                state.pendingKind = effectiveKind;\\n\\n                let conn;\\n\\n                try {\\n                    conn = original.apply(this, args);\\n                } finally {\\n                    state.pendingKind = null;\\n                }\\n\\n                return registerConnection(\\n                    effectiveKind,\\n                    name,\\n                    options,\\n                    conn,\\n                    meta\\n                );\\n            };\\n\\n            wrappedFactories++;\\n        }\\n\\n        // Important for the current Discord desktop: some bundles cache the\\n        // factory before our preload gets the module. They still construct\\n        // VoiceConnection dynamically later, so this catches that path.\\n        try {\\n            const OriginalVoiceConnection = voice.VoiceConnection;\\n\\n            if (typeof OriginalVoiceConnection === \\\"function\\\") {\\n                function GoLiveVoiceConnection(...args) {\\n                    const instance = Reflect.construct(\\n                        OriginalVoiceConnection,\\n                        args,\\n                        OriginalVoiceConnection\\n                    );\\n\\n                    if (!state.pendingKind) {\\n                        registerConnection(\\n                            \\\"unknown\\\",\\n                            \\\"VoiceConnection\\\",\\n                            args[1],\\n                            instance\\n                        );\\n                    }\\n\\n                    return instance;\\n                }\\n\\n                Object.setPrototypeOf(\\n                    GoLiveVoiceConnection,\\n                    OriginalVoiceConnection\\n                );\\n\\n                GoLiveVoiceConnection.prototype =\\n                    OriginalVoiceConnection.prototype;\\n\\n                voice.VoiceConnection = GoLiveVoiceConnection;\\n            }\\n        } catch (e) {\\n            log(`voice.constructor.hook.error | ${e?.message || e}`);\\n        }\\n\\n        state.moduleSeen = true;\\n        state.installed = true;\\n        state.hookError = null;\\n\\n        log(\\n            `voice.hook | factories=${wrappedFactories} ` +\\n            `constructor=${typeof voice.VoiceConnection === \\\"function\\\" ? \\\"sim\\\" : \\\"nao\\\"}`\\n        );\\n\\n        return voice;\\n    }\\n\\n    function installHook() {\\n        try {\\n            const nm =\\n                globalThis.DiscordNative?.nativeModules ||\\n                globalThis.window?.DiscordNative?.nativeModules;\\n\\n            if (!nm || typeof nm.requireModule !== \\\"function\\\") {\\n                state.hookError = \\\"requireModule indisponível\\\";\\n                return false;\\n            }\\n\\n            if (!nm.__glq209RequireWrapped) {\\n                const originalRequire = nm.requireModule;\\n\\n                nm.requireModule = function (...args) {\\n                    const loaded = originalRequire.apply(this, args);\\n\\n                    if (args[0] === \\\"discord_voice\\\") {\\n                        return hookVoiceModule(loaded);\\n                    }\\n\\n                    return loaded;\\n                };\\n\\n                try {\\n                    Object.defineProperty(\\n                        nm,\\n                        \\\"__glq209RequireWrapped\\\",\\n                        {\\n                            value: true,\\n                            configurable: true\\n                        }\\n                    );\\n                } catch {}\\n\\n                log(\\\"voice.hook | requireModule interceptado\\\");\\n            }\\n\\n            // If Discord itself already required the addon before our preload,\\n            // requireModule returns the cached instance and we patch it now.\\n            try {\\n                hookVoiceModule(\\n                    nm.requireModule(\\\"discord_voice\\\")\\n                );\\n            } catch {}\\n\\n            state.installed = true;\\n            state.hookError = null;\\n            return true;\\n        } catch (e) {\\n            state.hookError = e?.stack || e?.message || String(e);\\n            log(`voice.hook.error | ${state.hookError}`);\\n            return false;\\n        }\\n    }\\n\\n    function noteDemand(args) {\\n        try {\\n            const joined = Array.prototype\\n                .map.call(\\n                    args,\\n                    value => typeof value === \\\"string\\\" ? value : \\\"\\\"\\n                )\\n                .join(\\\" \\\");\\n\\n            const marker = \\\"Remote media sink wants:\\\";\\n            const at = joined.indexOf(marker);\\n\\n            if (at < 0) return;\\n\\n            const payload = JSON.parse(\\n                joined.slice(at + marker.length).trim()\\n            );\\n\\n            let positive = false;\\n\\n            function walk(value) {\\n                if (positive || value == null) return;\\n\\n                if (typeof value === \\\"number\\\") {\\n                    if (value > 0) positive = true;\\n                    return;\\n                }\\n\\n                if (typeof value === \\\"object\\\") {\\n                    for (const child of Object.values(value)) {\\n                        walk(child);\\n                    }\\n                }\\n            }\\n\\n            walk(payload?.pixelCounts);\\n\\n            if (!positive && payload && typeof payload === \\\"object\\\") {\\n                for (const [key, value] of Object.entries(payload)) {\\n                    if (\\n                        key !== \\\"any\\\" &&\\n                        key !== \\\"pixelCounts\\\" &&\\n                        typeof value === \\\"number\\\" &&\\n                        value > 0\\n                    ) {\\n                        positive = true;\\n                    }\\n                }\\n            }\\n\\n            const now = Date.now();\\n\\n            if (\\n                !state.demandKnown ||\\n                state.demandActive !== positive\\n            ) {\\n                state.demandChangedAt = now;\\n                log(\\n                    `voice.demand | active=${positive ? \\\"sim\\\" : \\\"nao\\\"}`\\n                );\\n            }\\n\\n            state.demandKnown = true;\\n            state.demandActive = positive;\\n\\n            if (positive) state.demandAt = now;\\n        } catch {}\\n    }\\n\\n    for (const method of [\\\"log\\\", \\\"info\\\", \\\"debug\\\"]) {\\n        try {\\n            const original = console[method];\\n            if (typeof original !== \\\"function\\\") continue;\\n\\n            console[method] = function (...args) {\\n                noteDemand(args);\\n                return original.apply(this, args);\\n            };\\n        } catch {}\\n    }\\n\\n    function sampleConnection(rec) {\\n        return new Promise(resolve => {\\n            if (rec.destroyedAt > 0 || !rec.conn) {\\n                resolve({statsOk: false, reason: \\\"destruida\\\"});\\n                return;\\n            }\\n\\n            const conn = rec.conn;\\n\\n            let method = null;\\n            let filtered = false;\\n\\n            if (typeof conn.getFilteredStats === \\\"function\\\") {\\n                method = conn.getFilteredStats;\\n                filtered = true;\\n            } else if (typeof conn.getStats === \\\"function\\\") {\\n                method = conn.getStats;\\n            }\\n\\n            if (!method) {\\n                resolve({statsOk: false, reason: \\\"sem-metodo\\\"});\\n                return;\\n            }\\n\\n            let done = false;\\n            let timer = null;\\n\\n            const finish = raw => {\\n                if (done) return;\\n                done = true;\\n\\n                if (timer) clearTimeout(timer);\\n\\n                const normalized = normalizeStats(raw);\\n\\n                if (!normalized.ok) {\\n                    resolve({\\n                        statsOk: false,\\n                        reason: normalized.reason\\n                    });\\n                    return;\\n                }\\n\\n                // This is the missing piece from v1.8.0:\\n                // if a cached Discord factory bypassed our exact wrapper, a\\n                // VoiceConnection with real outbound-video counters is enough\\n                // to classify it as the Go Live stream.\\n                if (\\n                    rec.kind !== \\\"stream\\\" &&\\n                    rec.kind !== \\\"stream-auto\\\" &&\\n                    rec.kind !== \\\"remote-stream\\\"\\n                ) {\\n                    rec.kind = \\\"stream-auto\\\";\\n                    rec.promotedByStats = true;\\n\\n                    log(\\n                        `voice.classify | id=${rec.id} -> stream-auto ` +\\n                        `via=video-stats creator=${rec.creator}`\\n                    );\\n                }\\n\\n                resolve(updateProgress(rec, normalized));\\n            };\\n\\n            timer = setTimeout(() => {\\n                finish({});\\n            }, 2500);\\n\\n            try {\\n                const returned = filtered\\n                    ? method.call(\\n                        conn,\\n                        2,\\n                        raw => finish(raw)\\n                    )\\n                    : method.call(\\n                        conn,\\n                        raw => finish(raw)\\n                    );\\n\\n                if (\\n                    returned &&\\n                    typeof returned.then === \\\"function\\\"\\n                ) {\\n                    returned.then(\\n                        finish,\\n                        () => finish({})\\n                    );\\n                }\\n            } catch {\\n                finish({});\\n            }\\n        });\\n    }\\n\\n    function activeRemoteStreamRecord() {\\n        let best = null;\\n\\n        for (const rec of state.connections) {\\n            if (\\n                !rec ||\\n                rec.destroyedAt > 0 ||\\n                rec.kind !== \\\"remote-stream\\\"\\n            ) {\\n                continue;\\n            }\\n\\n            if (!best || rec.id > best.id) best = rec;\\n        }\\n\\n        return best;\\n    }\\n\\n    function activeStreamRecord() {\\n        let best = null;\\n\\n        for (const rec of state.connections) {\\n            if (\\n                !rec ||\\n                rec.destroyedAt > 0 ||\\n                (\\n                    rec.kind !== \\\"stream\\\" &&\\n                    rec.kind !== \\\"stream-auto\\\"\\n                )\\n            ) {\\n                continue;\\n            }\\n\\n            if (!best || rec.id > best.id) {\\n                best = rec;\\n            }\\n        }\\n\\n        return best;\\n    }\\n\\n    function recoveryAllowed() {\\n        const settings = readJson(SETTINGS, {});\\n        return settings?.autoRecoverVideo !== false;\\n    }\\n\\n    function cleanupRecoveryWindow() {\\n        const now = Date.now();\\n\\n        state.recoveryAttempts =\\n            state.recoveryAttempts.filter(\\n                at => at >= now - RECOVERY_WINDOW_MS\\n            );\\n    }\\n\\n    function destroyStream(rec, reason) {\\n        cleanupRecoveryWindow();\\n\\n        if (!rec || typeof rec.conn?.destroy !== \\\"function\\\") {\\n            state.lastRecoveryResult = \\\"no-stream\\\";\\n            return false;\\n        }\\n\\n        if (\\n            Date.now() - state.lastRecoveryAt <\\n            RECOVERY_COOLDOWN_MS\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            state.recoveryAttempts.length >=\\n            RECOVERY_MAX\\n        ) {\\n            state.lastRecoveryResult = \\\"limit\\\";\\n            log(\\\"gw.revive | video nativo: teto de tentativas atingido\\\");\\n            return false;\\n        }\\n\\n        try {\\n            state.recoveryAttempts.push(Date.now());\\n            state.lastRecoveryAt = Date.now();\\n            state.lastRecoveryStreamId = rec.id;\\n            state.lastRecoveryResult = \\\"requested\\\";\\n\\n            log(\\n                `gw.revive | video nativo nivel=1 ` +\\n                `destroy stream id=${rec.id} kind=${rec.kind} ` +\\n                `reason=${reason}`\\n            );\\n\\n            rec.conn.destroy();\\n\\n            state.lastRecoveryResult = \\\"stream-destroyed\\\";\\n            return true;\\n        } catch (e) {\\n            state.lastRecoveryResult = \\\"failed\\\";\\n\\n            log(\\n                `gw.revive | video nativo falhou id=${rec.id}: ` +\\n                `${e?.message || e}`\\n            );\\n\\n            return false;\\n        }\\n    }\\n\\n    function maybeAutoRecover(rec) {\\n        if (!recoveryAllowed()) return false;\\n        if (!rec || !rec.stats?.statsOk) return false;\\n\\n        const now = Date.now();\\n        const age = now - rec.createdAt;\\n        const s = rec.stats;\\n\\n        if (age < STREAM_WARMUP_MS) return false;\\n\\n        // Demand is the strongest guard against recovering a stream that has\\n        // nobody watching. If Discord does not expose the marker on this build,\\n        // automatic recovery stays off, but the manual button still works.\\n        if (\\n            !state.demandKnown ||\\n            !state.demandActive ||\\n            state.demandAt <= 0 ||\\n            now - state.demandAt > DEMAND_FRESH_MS\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            s.inputAgeMs > INPUT_ALIVE_MS ||\\n            s.outputAgeMs < OUTPUT_STALL_MS\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            !(\\n                typeof s.captureFrames === \\\"number\\\" ||\\n                s.inputFrameRate > 0\\n            )\\n        ) {\\n            return false;\\n        }\\n\\n        if (\\n            typeof s.framesEncoded !== \\\"number\\\" ||\\n            typeof s.encodeFrameRate !== \\\"number\\\"\\n        ) {\\n            return false;\\n        }\\n\\n        return destroyStream(\\n            rec,\\n            \\\"capture-viva-output-parada\\\"\\n        );\\n    }\\n\\n    function statusConnection(rec) {\\n        return {\\n            id: rec.id,\\n            kind: rec.kind,\\n            creator: rec.creator,\\n            createdAt: rec.createdAt,\\n            destroyedAt: rec.destroyedAt || null,\\n            promotedByStats: rec.promotedByStats === true,\\n            remoteStream: rec.remoteStream === true,\\n            hasStreamUserId: rec.hasStreamUserId === true,\\n            videoSupportedBefore: rec.videoSupportedBefore,\\n            videoSupportedAfter: rec.videoSupportedAfter,\\n            streamParametersCount: rec.streamParametersCount,\\n            firstFrameHooked: rec.firstFrameHooked === true,\\n            firstFrameAt: rec.firstFrameAt || null,\\n            decoderFallbackAt: rec.decoderFallbackAt || null,\\n            optionShape: rec.optionShape,\\n            stats: rec.stats,\\n            statsError: rec.statsError\\n        };\\n    }\\n\\n    function writeStatus(extra = {}) {\\n        mkdir();\\n\\n        const active = state.connections.filter(\\n            rec => rec && rec.destroyedAt === 0\\n        );\\n\\n        const stream = activeStreamRecord();\\n\\n        const body = {\\n            version: \\\"2.0.9\\\",\\n            updatedAt: new Date().toISOString(),\\n            preloadLoaded: true,\\n            installed: state.installed,\\n            moduleSeen: state.moduleSeen,\\n            hookError: state.hookError,\\n            demandKnown: state.demandKnown,\\n            demandActive: state.demandActive,\\n            demandAgeMs:\\n                state.demandAt > 0\\n                    ? Date.now() - state.demandAt\\n                    : -1,\\n            activeConnections: active.length,\\n            activeStreams: active.filter(\\n                rec =>\\n                    rec.kind === \\\"stream\\\" ||\\n                    rec.kind === \\\"stream-auto\\\"\\n            ).length,\\n            activeRemoteStreams: active.filter(\\n                rec => rec.kind === \\\"remote-stream\\\"\\n            ).length,\\n            latestStream:\\n                stream\\n                    ? statusConnection(stream)\\n                    : null,\\n            latestRemoteStream:\\n                activeRemoteStreamRecord()\\n                    ? statusConnection(activeRemoteStreamRecord())\\n                    : null,\\n            lastRemoteFailure: state.lastRemoteFailure,\\n            lastViewerRecoveryAt: state.lastViewerRecoveryAt || null,\\n            lastViewerRecoveryResult: state.lastViewerRecoveryResult,\\n            lastViewerRecoveryId: state.lastViewerRecoveryId,\\n            viewerRecoveryAttempts: state.viewerRecoveryAttempts.length,\\n            connections: active\\n                .slice(-12)\\n                .map(statusConnection),\\n            lastRecoveryAt:\\n                state.lastRecoveryAt || null,\\n            lastRecoveryResult:\\n                state.lastRecoveryResult,\\n            lastRecoveryStreamId:\\n                state.lastRecoveryStreamId,\\n            recoveryAttempts:\\n                state.recoveryAttempts.length,\\n            ...extra\\n        };\\n\\n        try {\\n            fs.writeFileSync(\\n                STATUS,\\n                JSON.stringify(body, null, 2),\\n                \\\"utf8\\\"\\n            );\\n        } catch {}\\n    }\\n\\n    async function probeAll() {\\n        const active = state.connections.filter(\\n            rec => rec && rec.destroyedAt === 0\\n        );\\n\\n        for (const rec of active) {\\n            if (rec.kind === \\\"remote-stream\\\") {\\n                log(\\n                    [\\n                        \\\"viewer.probe\\\",\\n                        `id=${rec.id}`,\\n                        `age=${Date.now() - rec.createdAt}ms`,\\n                        `firstFrame=${rec.firstFrameAt ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                        `firstFrameHook=${rec.firstFrameHooked ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                        `decoderFallback=${rec.decoderFallbackAt ? \\\"sim\\\" : \\\"nao\\\"}`,\\n                        `videoSupported=${rec.videoSupportedBefore ?? \\\"?\\\"}->${rec.videoSupportedAfter ?? \\\"?\\\"}`,\\n                        `streamParams=${rec.streamParametersCount ?? \\\"?\\\"}`\\n                    ].join(\\\" | \\\")\\n                );\\n                continue;\\n            }\\n\\n            const sampled = await sampleConnection(rec);\\n\\n            rec.stats = sampled;\\n            rec.statsError =\\n                sampled.statsOk\\n                    ? null\\n                    : sampled.reason;\\n\\n            if (\\n                rec.kind === \\\"stream\\\" ||\\n                rec.kind === \\\"stream-auto\\\"\\n            ) {\\n                log(\\n                    [\\n                        \\\"voice.probe\\\",\\n                        `id=${rec.id}`,\\n                        `kind=${rec.kind}`,\\n                        `capture=${sampled.captureFrames ?? \\\"?\\\"}`,\\n                        `fps_in=${sampled.inputFrameRate ?? \\\"?\\\"}`,\\n                        `encoded=${sampled.framesEncoded ?? \\\"?\\\"}`,\\n                        `fps_out=${sampled.encodeFrameRate ?? \\\"?\\\"}`,\\n                        `media=${sampled.mediaType ?? \\\"?\\\"}`,\\n                        `rtt=${sampled.rttMs ?? \\\"?\\\"}ms`,\\n                        `jitter=${sampled.jitterMs ?? \\\"?\\\"}ms`,\\n                        `loss=${sampled.packetLossPct ?? \\\"?\\\"}%`,\\n                        `bitrate=${sampled.mediaBitrate ?? \\\"?\\\"}`,\\n                        `size=${sampled.width ?? \\\"?\\\"}x${sampled.height ?? \\\"?\\\"}`,\\n                        `in_age=${sampled.inputAgeMs ?? \\\"?\\\"}`,\\n                        `out_age=${sampled.outputAgeMs ?? \\\"?\\\"}`,\\n                        `demand=${state.demandKnown ? (state.demandActive ? \\\"sim\\\" : \\\"nao\\\") : \\\"?\\\"}`\\n                    ].join(\\\" | \\\")\\n                );\\n\\n                maybeAutoRecover(rec);\\n            }\\n        }\\n\\n        writeStatus();\\n    }\\n\\n    function pollCommand() {\\n        const cmd = readJson(COMMAND, null);\\n        if (!cmd || typeof cmd !== \\\"object\\\") return;\\n\\n        const nonce = String(cmd.nonce || \\\"\\\");\\n\\n        if (\\n            !nonce ||\\n            nonce === state.commandNonce\\n        ) {\\n            return;\\n        }\\n\\n        state.commandNonce = nonce;\\n\\n        if (cmd.type === \\\"destroy-stream\\\") {\\n            const stream = activeStreamRecord();\\n\\n            if (!stream) {\\n                state.lastRecoveryResult = \\\"no-stream\\\";\\n                log(\\n                    \\\"gw.revive | video nativo: comando manual sem stream classificada\\\"\\n                );\\n                writeStatus();\\n                return;\\n            }\\n\\n            destroyStream(\\n                stream,\\n                \\\"manual-plugin\\\"\\n            );\\n\\n            writeStatus();\\n            return;\\n        }\\n\\n        if (cmd.type === \\\"recover-viewer\\\") {\\n            const remote = activeRemoteStreamRecord();\\n\\n            if (!remote) {\\n                state.lastViewerRecoveryResult = \\\"no-remote-stream\\\";\\n                log(\\\"viewer.revive | comando manual sem remote-stream ativa\\\");\\n                writeStatus();\\n                return;\\n            }\\n\\n            recoverViewer(remote, \\\"manual-plugin\\\");\\n            writeStatus();\\n        }\\n    }\\n\\n    mkdir();\\n    log(\\\"voice.preload | v2.0.9 carregado\\\");\\n\\n    installMediaShim();\\n    installHook();\\n    writeStatus({state: \\\"preload-start\\\"});\\n\\n    let attempts = 0;\\n\\n    const hookTimer = setInterval(() => {\\n        attempts++;\\n\\n        if (\\n            state.moduleSeen ||\\n            attempts >= 200\\n        ) {\\n            clearInterval(hookTimer);\\n            return;\\n        }\\n\\n        installHook();\\n    }, 25);\\n\\n    setInterval(() => {\\n        probeAll().catch(\\n            e => log(\\n                `voice.probe.error | ${e?.message || e}`\\n            )\\n        );\\n    }, 3000);\\n\\n    setInterval(() => {\\n        try { pollCommand(); } catch {}\\n    }, 500);\\n})();\\n\";\n\n\nfunction registerVoicePreload() {\n    mkdir();\n\n    try {\n        fs.writeFileSync(VOICE_PRELOAD, VOICE_PRELOAD_SOURCE, \"utf8\");\n    } catch (e) {\n        log(`voice.preload.write falhou: ${e.message}`);\n        writeStatus({\n            voicePreloadRegistered: false,\n            voicePreloadError: e.message\n        });\n        return false;\n    }\n\n    try {\n        if (typeof session.defaultSession.registerPreloadScript === \"function\") {\n            try {\n                session.defaultSession.unregisterPreloadScript?.(\n                    \"go-live-de-queijo-voice-v209\"\n                );\n            } catch {}\n\n            session.defaultSession.registerPreloadScript({\n                type: \"frame\",\n                id: \"go-live-de-queijo-voice-v209\",\n                filePath: VOICE_PRELOAD\n            });\n\n            log(\"voice.preload registrado via registerPreloadScript\");\n            writeStatus({\n                voicePreloadRegistered: true,\n                voicePreloadMode: \"registerPreloadScript\",\n                voicePreloadError: null\n            });\n            return true;\n        }\n\n        if (\n            typeof session.defaultSession.getPreloads === \"function\" &&\n            typeof session.defaultSession.setPreloads === \"function\"\n        ) {\n            const old = session.defaultSession.getPreloads() || [];\n            session.defaultSession.setPreloads(\n                [...new Set([...old, VOICE_PRELOAD])]\n            );\n\n            log(\"voice.preload registrado via setPreloads\");\n            writeStatus({\n                voicePreloadRegistered: true,\n                voicePreloadMode: \"setPreloads\",\n                voicePreloadError: null\n            });\n            return true;\n        }\n\n        throw new Error(\"API de preload da sessão indisponível\");\n    } catch (e) {\n        log(`voice.preload.register falhou: ${e.message}`);\n        writeStatus({\n            voicePreloadRegistered: false,\n            voicePreloadError: e.message\n        });\n        return false;\n    }\n}\n\nfunction activeNativeStream() {\n    try {\n        const body = JSON.parse(fs.readFileSync(VOICE_STATUS, \"utf8\"));\n        return Number(body?.activeStreams || 0) > 0;\n    } catch {\n        return false;\n    }\n}\n\n\nfunction readVoiceStatusDirect() {\n    return readJsonNoBom(\n        VOICE_STATUS,\n        null\n    );\n}\n\nfunction directMediaSnapshot() {\n    const voice =\n        readVoiceStatusDirect();\n\n    if (!voice) {\n        return {\n            voice: null,\n            outboundActive: false,\n            mediaType: null,\n            mediaRttMs: null,\n            mediaJitterMs: null,\n            mediaLossPct: null,\n            remoteActive: false,\n            remoteFirstFrame: false,\n            remoteFailure: false,\n            remoteAgeMs: 0,\n            reason: null\n        };\n    }\n\n    const latestStream =\n        voice.latestStream ||\n        null;\n\n    const latestRemote =\n        voice.latestRemoteStream ||\n        null;\n\n    const stats =\n        latestStream?.stats ||\n        null;\n\n    const outboundActive =\n        Number(\n            voice.activeStreams ||\n            0\n        ) > 0 &&\n        Number(\n            stats?.framesEncoded ||\n            0\n        ) > 0 &&\n        Number(\n            stats?.mediaBitrate ||\n            0\n        ) > 0 &&\n        Number(\n            stats?.width ||\n            0\n        ) > 0 &&\n        Number(\n            stats?.height ||\n            0\n        ) > 0;\n\n    const mediaType =\n        stats?.mediaType ===\n            \"camera\"\n            ? \"camera\"\n            : (\n                outboundActive\n                    ? \"golive\"\n                    : null\n            );\n\n    const mediaRttMs =\n        Number.isFinite(\n            Number(\n                stats?.rttMs\n            )\n        )\n            ? Number(\n                stats.rttMs\n            )\n            : null;\n\n    const mediaJitterMs =\n        Number.isFinite(\n            Number(\n                stats?.jitterMs\n            )\n        )\n            ? Number(\n                stats.jitterMs\n            )\n            : null;\n\n    const mediaLossPct =\n        Number.isFinite(\n            Number(\n                stats?.packetLossPct\n            )\n        )\n            ? Number(\n                stats.packetLossPct\n            )\n            : null;\n\n    const remoteActive =\n        Number(\n            voice.activeRemoteStreams ||\n            0\n        ) > 0 ||\n        latestRemote?.remoteStream ===\n            true;\n\n    const remoteFirstFrame =\n        !!latestRemote?.firstFrameAt;\n\n    const remoteAgeMs =\n        latestRemote?.createdAt\n            ? Math.max(\n                0,\n                Date.now() -\n                Number(\n                    latestRemote.createdAt\n                )\n            )\n            : 0;\n\n    const recentRemoteFailure =\n        voice.lastRemoteFailure &&\n        (\n            !voice.lastRemoteFailure.at ||\n            Date.now() -\n                Number(\n                    voice.lastRemoteFailure.at\n                ) <\n                30000\n        );\n\n    const remoteFailure =\n        !!recentRemoteFailure ||\n        (\n            remoteActive &&\n            !remoteFirstFrame &&\n            remoteAgeMs >=\n                DIRECT_REMOTE_FAIL_MS\n        );\n\n    let reason =\n        null;\n\n    if (recentRemoteFailure) {\n        reason =\n            voice.lastRemoteFailure.reason ||\n            voice.lastRemoteFailure.message ||\n            \"falha remote-stream\";\n    } else if (remoteFailure) {\n        reason =\n            `remote-stream sem first-frame por ${remoteAgeMs}ms`;\n    }\n\n    return {\n        voice,\n        outboundActive,\n        mediaType,\n        mediaRttMs,\n        mediaJitterMs,\n        mediaLossPct,\n        remoteActive,\n        remoteFirstFrame,\n        remoteFailure,\n        remoteAgeMs,\n        reason\n    };\n}\n\nfunction clearLegacyAutoBootstrapCommand() {\n    const command =\n        readSingBoxCommand();\n\n    if (\n        !command ||\n        ![\n            \"auto-bootstrap\",\n            \"bootstrap\"\n        ].includes(\n            command.type\n        )\n    ) {\n        return false;\n    }\n\n    try {\n        fs.unlinkSync(\n            SINGBOX_COMMAND\n        );\n\n        log(\n            `DIRECT-FIRST: comando legado ${command.type} removido; não haverá scan no startup`\n        );\n\n        return true;\n    } catch {\n        return false;\n    }\n}\n\nasync function activateDirectFallback(\n    reason = \"falha direta\"\n) {\n    if (\n        directFallbackPromise\n    ) {\n        return directFallbackPromise;\n    }\n\n    directFallbackTriggered =\n        true;\n\n    directFallbackPromise =\n        (async () => {\n            log(\n                `DIRECT-FIRST -> FALLBACK TUN: ${reason}`\n            );\n\n            writeStatus({\n                state:\n                    \"auto-proxy-search\",\n                networkMode:\n                    \"direct-first\",\n                proxyMode:\n                    \"fallback-socks5-auto\",\n                fallbackTriggered:\n                    true,\n                fallbackReason:\n                    reason,\n                directFallback:\n                    true,\n                directReason:\n                    reason\n            });\n\n            // Reaproveita o pipeline maduro da 1.9.8:\n            // converte temporariamente para auto-bootstrap.\n            const nonce =\n                `${Date.now()}-${Math.random().toString(16).slice(2)}`;\n\n            writeJsonAtomic(\n                SINGBOX_COMMAND,\n                {\n                    version:\n                        \"1.9.15\",\n                    type:\n                        \"auto-bootstrap\",\n                    nonce,\n                    reason,\n                    at:\n                        new Date()\n                            .toISOString()\n                }\n            );\n\n            const ok =\n                await processSingBoxCommand();\n\n            if (!ok) {\n                try {\n                    fs.unlinkSync(\n                        SINGBOX_COMMAND\n                    );\n                } catch {}\n\n                writeStatus({\n                    state:\n                        \"direct-ready\",\n                    networkMode:\n                        \"direct-first\",\n                    proxyMode:\n                        \"fallback-idle\",\n                    fallbackTriggered:\n                        true,\n                    fallbackFailed:\n                        true,\n                    fallbackReason:\n                        reason,\n                    directFallback:\n                        true,\n                    directReason:\n                        \"fallback TUN não encontrou saída; mantendo DIRECT\"\n                });\n\n                log(\n                    \"FALLBACK TUN não encontrou saída; DIRECT continua ativo\"\n                );\n\n                return false;\n            }\n\n            const runtime =\n                await ensureSingBoxTaskRunning();\n\n            if (\n                !runtime?.processRunning ||\n                !runtime?.tunUp\n            ) {\n                writeStatus({\n                    state:\n                        \"direct-ready\",\n                    networkMode:\n                        \"direct-first\",\n                    fallbackTriggered:\n                        true,\n                    fallbackFailed:\n                        true,\n                    fallbackReason:\n                        reason,\n                    singBoxReady:\n                        false,\n                    directFallback:\n                        true,\n                    directReason:\n                        \"fallback encontrou proxy, mas o TUN não subiu\"\n                });\n\n                return false;\n            }\n\n            writeStatus({\n                state:\n                    \"fallback-tun-ready\",\n                networkMode:\n                    \"direct-first\",\n                proxyMode:\n                    \"fallback-socks5-auto\",\n                singBoxReady:\n                    true,\n                singBoxRunning:\n                    true,\n                singBoxPid:\n                    runtime.pid ??\n                    null,\n                singBoxTunUp:\n                    true,\n                singBoxTunName:\n                    runtime.tunName ||\n                    \"GoLiveDeQueijo\",\n                singBoxTaskState:\n                    runtime.taskState ||\n                    null,\n                fallbackTriggered:\n                    true,\n                fallbackFailed:\n                    false,\n                fallbackReason:\n                    reason,\n                directFallback:\n                    true,\n                directReason:\n                    \"TUN ativado após falha do DIRECT\"\n            });\n\n            try {\n                await session.defaultSession\n                    .closeAllConnections();\n\n                log(\n                    \"fallback TUN pronto; conexões fechadas para renegociar Discord\"\n                );\n            } catch (e) {\n                log(\n                    `fallback closeAllConnections: ${e.message}`\n                );\n            }\n\n            return true;\n        })()\n        .finally(\n            () => {\n                directFallbackPromise =\n                    null;\n            }\n        );\n\n    return directFallbackPromise;\n}\n\nfunction isSafePluginPathForUninstall(\n    pluginPath\n) {\n    try {\n        if (\n            !pluginPath ||\n            typeof pluginPath !==\n                \"string\"\n        ) {\n            return false;\n        }\n\n        const resolved =\n            path.resolve(\n                pluginPath\n            );\n\n        const pluginsRoot =\n            path.resolve(\n                path.join(\n                    process.env.APPDATA ||\n                    \"\",\n                    \"BetterDiscord\",\n                    \"plugins\"\n                )\n            );\n\n        if (\n            !pluginsRoot ||\n            !resolved\n                .toLowerCase()\n                .startsWith(\n                    pluginsRoot\n                        .toLowerCase() +\n                    path.sep\n                )\n        ) {\n            return false;\n        }\n\n        if (\n            !resolved\n                .toLowerCase()\n                .endsWith(\n                    \".plugin.js\"\n                )\n        ) {\n            return false;\n        }\n\n        if (\n            !fs.existsSync(\n                resolved\n            )\n        ) {\n            return true;\n        }\n\n        const content =\n            fs.readFileSync(\n                resolved,\n                \"utf8\"\n            );\n\n        return (\n            content.includes(\n                \"@name Go Live De Queijo\"\n            ) ||\n            content.includes(\n                \"GoLiveDeQueijo\"\n            )\n        );\n    } catch {\n        return false;\n    }\n}\n\nfunction removeOwnCoreInjectionForUninstall() {\n    const settings =\n        readSettings();\n\n    const coreIndex =\n        String(\n            settings.coreIndex ||\n            \"\"\n        ).trim();\n\n    if (\n        !coreIndex ||\n        !fs.existsSync(\n            coreIndex\n        )\n    ) {\n        return {\n            removed:\n                false,\n            coreIndex:\n                coreIndex ||\n                null,\n            reason:\n                \"coreIndex ausente\"\n        };\n    }\n\n    try {\n        const original =\n            fs.readFileSync(\n                coreIndex,\n                \"utf8\"\n            );\n\n        const clean =\n            stripSelfMarker(\n                original\n            );\n\n        if (\n            clean !==\n            original\n        ) {\n            fs.writeFileSync(\n                coreIndex,\n                clean,\n                \"utf8\"\n            );\n        }\n\n        try {\n            const backup =\n                coreIndex +\n                \".glbbd-backup\";\n\n            if (\n                fs.existsSync(\n                    backup\n                )\n            ) {\n                fs.unlinkSync(\n                    backup\n                );\n            }\n        } catch {}\n\n        return {\n            removed:\n                clean !==\n                original,\n            coreIndex\n        };\n    } catch (e) {\n        return {\n            removed:\n                false,\n            coreIndex,\n            error:\n                e?.message ||\n                String(e)\n        };\n    }\n}\n\nasync function stopAndRemoveSingBoxTaskForUninstall() {\n    const ps = [\n        \"$ErrorActionPreference='SilentlyContinue';\",\n        \"$taskName='GoLiveDeQueijo-SingBox';\",\n        \"$target=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'GoLiveBypassBD\\\\sing-box\\\\sing-box.exe'));\",\n        \"Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue;\",\n        \"Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue;\",\n        \"Start-Sleep -Milliseconds 200;\",\n        \"$killed=0;\",\n        \"$procs=Get-CimInstance Win32_Process -Filter \\\\\\\"Name='sing-box.exe'\\\\\\\" -ErrorAction SilentlyContinue;\",\n        \"foreach($p in $procs){\",\n        \"  $exe=$null;\",\n        \"  try{$exe=[IO.Path]::GetFullPath([string]$p.ExecutablePath)}catch{};\",\n        \"  if($exe -and $exe -ieq $target){\",\n        \"    try{\",\n        \"      $r=Invoke-CimMethod -InputObject $p -MethodName Terminate -ErrorAction Stop;\",\n        \"      if($r.ReturnValue -eq 0){$killed++}\",\n        \"    }catch{}\",\n        \"  }\",\n        \"};\",\n        \"$obj=[ordered]@{killed=[int]$killed; taskExists=[bool](Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)};\",\n        \"$obj | ConvertTo-Json -Compress;\"\n    ].join(\" \");\n\n    try {\n        const result =\n            await execFilePromise(\n                POWERSHELL_EXE,\n                [\n                    \"-NoProfile\",\n                    \"-ExecutionPolicy\",\n                    \"Bypass\",\n                    \"-Command\",\n                    ps\n                ],\n                {\n                    windowsHide:\n                        true,\n                    timeout:\n                        10000\n                }\n            );\n\n        return JSON.parse(\n            String(\n                result.stdout ||\n                \"{}\"\n            )\n                .trim()\n                .replace(\n                    /^\\uFEFF/,\n                    \"\"\n                )\n        );\n    } catch (e) {\n        return {\n            error:\n                e?.message ||\n                String(e)\n        };\n    }\n}\n\nasync function performFullUninstall(\n    command\n) {\n    if (\n        uninstallInProgress\n    ) {\n        return;\n    }\n\n    uninstallInProgress =\n        true;\n\n    shuttingDown =\n        true;\n\n    log(\n        \"UNINSTALL: iniciando remoção completa\"\n    );\n\n    clearNativeTimers();\n    destroyActiveSockets();\n\n    try {\n        await session.defaultSession\n            .setProxy({\n                mode:\n                    \"system\"\n            });\n\n        await session.defaultSession\n            .closeAllConnections();\n    } catch {}\n\n    const coreResult =\n        removeOwnCoreInjectionForUninstall();\n\n    log(\n        `UNINSTALL: core hook removido=${coreResult.removed} path=${coreResult.coreIndex || \"-\"}`\n    );\n\n    const taskResult =\n        await stopAndRemoveSingBoxTaskForUninstall();\n\n    log(\n        `UNINSTALL: sing-box/task ${JSON.stringify(taskResult)}`\n    );\n\n    log(\n        \"UNINSTALL: arquivo .plugin.js preservado no BetterDiscord\"\n    );\n\n    // Apaga toda a instalação local. O código deste hook já está\n    // carregado em memória, então é seguro remover os arquivos do disco.\n    try {\n        fs.rmSync(\n            BASE,\n            {\n                recursive:\n                    true,\n                force:\n                    true\n            }\n        );\n    } catch (e) {\n        log(\n            `UNINSTALL: falha removendo ${BASE}: ${e.message}`\n        );\n    }\n\n    // Pequeno atraso para o filesystem terminar antes do relaunch.\n    setTimeout(\n        () => {\n            try {\n                app.relaunch();\n            } catch {}\n\n            try {\n                app.exit(\n                    0\n                );\n            } catch {\n                try {\n                    app.quit();\n                } catch {}\n            }\n        },\n        400\n    );\n}\n\nasync function directFirstMonitorTick() {\n    if (\n        directMonitorBusy\n    ) {\n        return;\n    }\n\n    directMonitorBusy =\n        true;\n\n    try {\n        const command =\n            readSingBoxCommand();\n\n        if (\n            command?.type ===\n            \"uninstall-now\"\n        ) {\n            await performFullUninstall(\n                command\n            );\n\n            return;\n        }\n\n        if (\n            command?.type ===\n            \"fallback-now\"\n        ) {\n            const reason =\n                command.reason ||\n                \"fallback solicitado pelo renderer\";\n\n            try {\n                fs.unlinkSync(\n                    SINGBOX_COMMAND\n                );\n            } catch {}\n\n            if (\n                !directFallbackTriggered\n            ) {\n                activateDirectFallback(\n                    reason\n                ).catch(\n                    e => log(\n                        `fallback solicitado falhou: ${e.message}`\n                    )\n                );\n            }\n        }\n\n        const media =\n            directMediaSnapshot();\n\n        const current =\n            readJsonNoBom(\n                STATUS,\n                {}\n            );\n\n        // Se o fallback já subiu, não sobrescreve status de TUN ativo.\n        if (\n            current?.state ===\n                \"fallback-tun-ready\" ||\n            current?.singBoxReady ===\n                true\n        ) {\n            return;\n        }\n\n        if (\n            media.remoteFirstFrame\n        ) {\n            writeStatus({\n                state:\n                    \"direct-media-ok\",\n                networkMode:\n                    \"direct-first\",\n                proxyMode:\n                    \"fallback-idle\",\n                directRemoteFirstFrame:\n                    true,\n                directOutboundActive:\n                    media.outboundActive,\n                directMediaType:\n                    media.mediaType,\n                directMediaRttMs:\n                    media.mediaRttMs,\n                directMediaJitterMs:\n                    media.mediaJitterMs,\n                directMediaLossPct:\n                    media.mediaLossPct,\n                directRemoteActive:\n                    true,\n                directFallback:\n                    true,\n                directReason:\n                    \"remote-stream recebeu first-frame diretamente\"\n            });\n\n            return;\n        }\n\n        if (\n            media.remoteFailure &&\n            !directFallbackTriggered\n        ) {\n            activateDirectFallback(\n                media.reason ||\n                \"remote-stream direto falhou\"\n            ).catch(\n                e => log(\n                    `fallback automático: ${e.message}`\n                )\n            );\n\n            return;\n        }\n\n        if (\n            media.outboundActive\n        ) {\n            const stats =\n                media.voice?.latestStream?.stats ||\n                {};\n\n            const directRtt =\n                Number(\n                    media.mediaRttMs\n                );\n\n            const bestRoute =\n                routeOptimizerBest;\n\n            // Go Live e câmera usam a mesma lógica de vídeo.\n            // Só troca o DIRECT se o RTT da mídia estiver ruim E a rota\n            // preparada tiver margem real de melhoria.\n            if (\n                !directFallbackTriggered &&\n                Number.isFinite(\n                    directRtt\n                ) &&\n                directRtt >=\n                    ROUTE_DIRECT_SWITCH_RTT_MS &&\n                bestRoute &&\n                Number(\n                    bestRoute.avgMs\n                ) <=\n                    ROUTE_TARGET_MS &&\n                Number(\n                    bestRoute.jitterMs\n                ) <=\n                    ROUTE_MAX_JITTER_MS &&\n                Number(\n                    bestRoute.lossPct\n                ) <=\n                    ROUTE_MAX_LOSS_PCT &&\n                directRtt -\n                    Number(\n                        bestRoute.avgMs\n                    ) >=\n                    ROUTE_MIN_IMPROVEMENT_MS\n            ) {\n                const mediaName =\n                    media.mediaType ===\n                        \"camera\"\n                        ? \"câmera\"\n                        : \"Go Live\";\n\n                activateDirectFallback(\n                    `${mediaName}: RTT direto ${directRtt}ms; ` +\n                    `rota preparada ${bestRoute.country} ${bestRoute.avgMs}ms`\n                ).catch(\n                    e => log(\n                        `Media Route Race fallback: ${e.message}`\n                    )\n                );\n\n                return;\n            }\n\n            writeStatus({\n                state:\n                    \"direct-stream-active\",\n                networkMode:\n                    \"direct-first\",\n                proxyMode:\n                    \"fallback-idle\",\n                directRemoteFirstFrame:\n                    false,\n                directOutboundActive:\n                    true,\n                directRemoteActive:\n                    media.remoteActive,\n                directMediaType:\n                    media.mediaType,\n                directMediaRttMs:\n                    media.mediaRttMs,\n                directMediaJitterMs:\n                    media.mediaJitterMs,\n                directMediaLossPct:\n                    media.mediaLossPct,\n                directStreamWidth:\n                    Number(\n                        stats.width\n                    ) || null,\n                directStreamHeight:\n                    Number(\n                        stats.height\n                    ) || null,\n                directStreamFps:\n                    Number(\n                        stats.encodeFrameRate\n                    ) || null,\n                directStreamBitrate:\n                    Number(\n                        stats.mediaBitrate\n                    ) || null,\n                directFallback:\n                    true,\n                directReason:\n                    media.mediaType === \"camera\"\n                        ? \"câmera direta ativa; Media Route Race em espera\"\n                        : \"Go Live direto ativo; Media Route Race em espera\"\n            });\n\n            return;\n        }\n\n        writeStatus({\n            state:\n                \"direct-ready\",\n            networkMode:\n                \"direct-first\",\n            proxyMode:\n                \"fallback-idle\",\n            directRemoteFirstFrame:\n                false,\n            directOutboundActive:\n                false,\n            directRemoteActive:\n                media.remoteActive,\n            directMediaType:\n                media.mediaType,\n            directMediaRttMs:\n                media.mediaRttMs,\n            directMediaJitterMs:\n                media.mediaJitterMs,\n            directMediaLossPct:\n                media.mediaLossPct,\n            routeMemoryCount:\n                readBestRoutesMemory(\n                    new Set()\n                ).length,\n            directFallback:\n                true,\n            directReason:\n                \"DIRECT ativo; TUN só será usado se necessário\"\n        });\n    } finally {\n        directMonitorBusy =\n            false;\n    }\n}\n\nfunction freshResetNetworkJsonData() {\n    // NÃO apaga settings.json nem best-routes.json.\n    // best-routes.json é a memória persistente das rotas boas.\n    // O restante dos caches/resultados é zerado a cada startup.\n    const targets = [\n        STATUS,\n        VOICE_STATUS,\n        PROXY_CACHE,\n        AUTO_BEST_CACHE,\n        AUTO_PROXY_CATALOG,\n        SINGBOX_COMMAND,\n        SINGBOX_COMMAND_RESULT,\n        SINGBOX_CONFIG,\n        ROUTE_TARGETS,\n        WG_STATUS,\n        WG_COMMAND,\n        WG_COMMAND_RESULT\n    ];\n\n    const deleted = [];\n    const failed = [];\n\n    for (const file of targets) {\n        try {\n            if (fs.existsSync(file)) {\n                fs.unlinkSync(file);\n                deleted.push(\n                    path.basename(file)\n                );\n            }\n        } catch (e) {\n            failed.push({\n                file:\n                    path.basename(file),\n                error:\n                    e?.message ||\n                    String(e)\n            });\n        }\n    }\n\n    // Zera também o estado em memória.\n    autoCatalogMap =\n        null;\n\n    if (autoCatalogFlushTimer) {\n        clearTimeout(\n            autoCatalogFlushTimer\n        );\n\n        autoCatalogFlushTimer =\n            null;\n    }\n\n    autoProxyCurrent =\n        null;\n\n    autoProxySelectionBusy =\n        false;\n\n    directFallbackTriggered =\n        false;\n\n    directFallbackPromise =\n        null;\n\n    pool = [];\n    current = null;\n    selecting = null;\n    selectionAttempt = 0;\n\n    log(\n        `FRESH RESET: ${deleted.length} JSON/configs removidos` +\n        (\n            deleted.length\n                ? ` [${deleted.join(\", \")}]`\n                : \"\"\n        )\n    );\n\n    if (failed.length) {\n        log(\n            `FRESH RESET: ${failed.length} arquivos não puderam ser removidos: ` +\n            failed\n                .map(\n                    item =>\n                        `${item.file}: ${item.error}`\n                )\n                .join(\" | \")\n        );\n    }\n\n    return {\n        deleted,\n        failed\n    };\n}\n\nasync function stopStaleSingBoxForDirect() {\n    // A 1.9.9 restaurava o proxy do Electron, porém uma Scheduled Task\n    // antiga podia continuar mantendo o sing-box/TUN vivo no Windows.\n    // Primeiro encerramos a task; depois tentamos matar SOMENTE o\n    // sing-box instalado dentro de %LOCALAPPDATA%\\GoLiveBypassBD.\n    const ps = [\n        \"$ErrorActionPreference='SilentlyContinue';\",\n        \"$taskName='GoLiveDeQueijo-SingBox';\",\n        \"$target=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'GoLiveBypassBD\\\\sing-box\\\\sing-box.exe'));\",\n        \"$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue;\",\n        \"if($task){ Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue };\",\n        \"Start-Sleep -Milliseconds 250;\",\n        \"$killed=0;\",\n        \"$procs=Get-CimInstance Win32_Process -Filter \\\\\\\"Name='sing-box.exe'\\\\\\\" -ErrorAction SilentlyContinue;\",\n        \"foreach($p in $procs){\",\n        \"  $exe=$null;\",\n        \"  try{$exe=[IO.Path]::GetFullPath([string]$p.ExecutablePath)}catch{};\",\n        \"  if($exe -and $exe -ieq $target){\",\n        \"    try{\",\n        \"      $r=Invoke-CimMethod -InputObject $p -MethodName Terminate -ErrorAction Stop;\",\n        \"      if($r.ReturnValue -eq 0){$killed++}\",\n        \"    }catch{}\",\n        \"  }\",\n        \"};\",\n        \"Start-Sleep -Milliseconds 350;\",\n        \"$left=Get-CimInstance Win32_Process -Filter \\\\\\\"Name='sing-box.exe'\\\\\\\" -ErrorAction SilentlyContinue | Where-Object {\",\n        \"  try{[IO.Path]::GetFullPath([string]$_.ExecutablePath) -ieq $target}catch{$false}\",\n        \"};\",\n        \"$adapter=Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {\",\n        \"  $_.Name -like 'GoLiveDeQueijo*' -or $_.InterfaceDescription -like '*sing-box*'\",\n        \"} | Select-Object -First 1;\",\n        \"$obj=[ordered]@{\",\n        \" taskStopped=[bool]$task;\",\n        \" killed=[int]$killed;\",\n        \" processStillRunning=[bool]$left;\",\n        \" tunStillUp=[bool]($adapter -and $adapter.Status -eq 'Up');\",\n        \" tunName=if($adapter){[string]$adapter.Name}else{$null};\",\n        \"};\",\n        \"$obj | ConvertTo-Json -Compress;\"\n    ].join(\" \");\n\n    try {\n        const result =\n            await execFilePromise(\n                POWERSHELL_EXE,\n                [\n                    \"-NoProfile\",\n                    \"-ExecutionPolicy\",\n                    \"Bypass\",\n                    \"-Command\",\n                    ps\n                ],\n                {\n                    windowsHide:\n                        true,\n                    timeout:\n                        10000\n                }\n            );\n\n        const parsed =\n            JSON.parse(\n                String(\n                    result.stdout ||\n                    \"{}\"\n                )\n                    .trim()\n                    .replace(\n                        /^\\uFEFF/,\n                        \"\"\n                    )\n            );\n\n        log(\n            `DIRECT RESET runtime: taskStop=${parsed.taskStopped} ` +\n            `killed=${parsed.killed} processLeft=${parsed.processStillRunning} ` +\n            `tunLeft=${parsed.tunStillUp} ${parsed.tunName || \"\"}`\n        );\n\n        return parsed;\n    } catch (e) {\n        log(\n            `DIRECT RESET runtime falhou: ${e?.message || e}`\n        );\n\n        return {\n            taskStopped:\n                false,\n            killed:\n                0,\n            processStillRunning:\n                null,\n            tunStillUp:\n                null,\n            tunName:\n                null,\n            error:\n                e?.message ||\n                String(e)\n        };\n    }\n}\n\nfunction writeJsonAtomic(file, value) {\n    try {\n        const tmp = file + \".tmp\";\n\n        fs.writeFileSync(\n            tmp,\n            JSON.stringify(value, null, 2),\n            \"utf8\"\n        );\n\n        fs.renameSync(tmp, file);\n        return true;\n    } catch (e) {\n        log(`writeJsonAtomic falhou ${file}: ${e.message}`);\n        return false;\n    }\n}\n\nfunction execFilePromise(file, args, options = {}) {\n    return new Promise((resolve, reject) => {\n        childProcess.execFile(\n            file,\n            args,\n            Object.assign({\n                windowsHide: true,\n                encoding: \"utf8\",\n                maxBuffer: 2 * 1024 * 1024\n            }, options),\n            (error, stdout, stderr) => {\n                if (error) {\n                    error.stdout = stdout;\n                    error.stderr = stderr;\n                    reject(error);\n                    return;\n                }\n\n                resolve({\n                    stdout: stdout || \"\",\n                    stderr: stderr || \"\"\n                });\n            }\n        );\n    });\n}\n\nfunction readWireGuardCommand() {\n    try {\n        const body = JSON.parse(\n            fs.readFileSync(WG_COMMAND, \"utf8\")\n        );\n\n        return body && typeof body === \"object\"\n            ? body\n            : null;\n    } catch {\n        return null;\n    }\n}\n\nasync function processWireGuardCommand() {\n    const command = readWireGuardCommand();\n\n    if (!command || command.type !== \"bootstrap\") {\n        return false;\n    }\n\n    const nonce = String(command.nonce || \"\");\n\n    if (!nonce) {\n        try { fs.unlinkSync(WG_COMMAND); } catch {}\n        return false;\n    }\n\n    if (!fs.existsSync(WG_BOOTSTRAP)) {\n        const message = `bootstrap ausente: ${WG_BOOTSTRAP}`;\n\n        log(`WireGuard bootstrap: ${message}`);\n\n        writeJsonAtomic(WG_COMMAND_RESULT, {\n            version: \"2.0.9\",\n            nonce,\n            ok: false,\n            at: new Date().toISOString(),\n            error: message\n        });\n\n        try { fs.unlinkSync(WG_COMMAND); } catch {}\n        return false;\n    }\n\n    writeStatus({\n        state: \"wireguard-bootstrap-uac\",\n        wireGuardBootstrapState: \"waiting-uac\",\n        wireGuardBootstrapNonce: nonce,\n        wireGuardBootstrapError: null\n    });\n\n    log(\n        `WireGuard bootstrap ${nonce}: solicitando UAC pelo processo nativo`\n    );\n\n    const escaped = WG_BOOTSTRAP.replace(/'/g, \"''\");\n\n    const psCommand = [\n        \"$p = Start-Process\",\n        \"-FilePath '\" + POWERSHELL_EXE.replace(/'/g, \"''\") + \"'\",\n        \"-Verb RunAs\",\n        \"-ArgumentList @(\",\n        \"'-NoProfile',\",\n        \"'-ExecutionPolicy','Bypass',\",\n        `'-File','${escaped}'`,\n        \")\",\n        \"-Wait -PassThru;\",\n        \"exit $p.ExitCode\"\n    ].join(\" \");\n\n    try {\n        await execFilePromise(\n            POWERSHELL_EXE,\n            [\n                \"-NoProfile\",\n                \"-ExecutionPolicy\",\n                \"Bypass\",\n                \"-Command\",\n                psCommand\n            ],\n            {\n                windowsHide: false,\n                timeout: 180000\n            }\n        );\n\n        writeJsonAtomic(WG_COMMAND_RESULT, {\n            version: \"2.0.9\",\n            nonce,\n            ok: true,\n            at: new Date().toISOString(),\n            error: null\n        });\n\n        writeStatus({\n            wireGuardBootstrapState: \"completed\",\n            wireGuardBootstrapNonce: nonce,\n            wireGuardBootstrapError: null\n        });\n\n        log(`WireGuard bootstrap ${nonce}: concluído`);\n\n        try { fs.unlinkSync(WG_COMMAND); } catch {}\n        return true;\n    } catch (e) {\n        const message = e?.message || String(e);\n\n        writeJsonAtomic(WG_COMMAND_RESULT, {\n            version: \"2.0.9\",\n            nonce,\n            ok: false,\n            at: new Date().toISOString(),\n            error: message,\n            stderr: String(e?.stderr || \"\").slice(-2000)\n        });\n\n        writeStatus({\n            state: \"wireguard-bootstrap-error\",\n            wireGuardBootstrapState: \"failed\",\n            wireGuardBootstrapNonce: nonce,\n            wireGuardBootstrapError: message,\n            directFallback: false\n        });\n\n        log(\n            `WireGuard bootstrap ${nonce} falhou: ${message}`\n        );\n\n        try { fs.unlinkSync(WG_COMMAND); } catch {}\n        return false;\n    }\n}\n\nfunction readJsonNoBom(file, fallback = null) {\n    try {\n        return JSON.parse(\n            fs.readFileSync(\n                file,\n                \"utf8\"\n            ).replace(/^\\uFEFF/, \"\")\n        );\n    } catch {\n        return fallback;\n    }\n}\n\nfunction readSingBoxInstallStatus() {\n    return readJsonNoBom(\n        SINGBOX_INSTALL_STATUS,\n        null\n    );\n}\n\nfunction readSingBoxCommand() {\n    return readJsonNoBom(\n        SINGBOX_COMMAND,\n        null\n    );\n}\n\nasync function processSingBoxCommand() {\n    const command = readSingBoxCommand();\n\n    if (\n        !command ||\n        ![\n            \"bootstrap\",\n            \"auto-bootstrap\"\n        ].includes(\n            command.type\n        )\n    ) {\n        return false;\n    }\n\n    const nonce = String(command.nonce || \"\");\n\n    if (!nonce) {\n        try { fs.unlinkSync(SINGBOX_COMMAND); } catch {}\n        return false;\n    }\n\n    if (!fs.existsSync(SINGBOX_BOOTSTRAP)) {\n        const message = `bootstrap sing-box ausente: ${SINGBOX_BOOTSTRAP}`;\n\n        writeJsonAtomic(SINGBOX_COMMAND_RESULT, {\n            version: \"2.0.9\",\n            nonce,\n            ok: false,\n            at: new Date().toISOString(),\n            error: message\n        });\n\n        try { fs.unlinkSync(SINGBOX_COMMAND); } catch {}\n        return false;\n    }\n\n    if (\n        command.type ===\n        \"auto-bootstrap\"\n    ) {\n        try {\n            const selected =\n                await selectAutoUdpProxy();\n\n            writeAutoSingBoxConfig(\n                selected\n            );\n        } catch (e) {\n            const message =\n                e?.message ||\n                String(e);\n\n            writeJsonAtomic(\n                SINGBOX_COMMAND_RESULT,\n                {\n                    version:\n                        \"1.9.0\",\n                    nonce,\n                    ok: false,\n                    at:\n                        new Date()\n                            .toISOString(),\n                    stage:\n                        \"auto-proxy-search\",\n                    error:\n                        message\n                }\n            );\n\n            // Mantém o comando para tentar automaticamente no próximo\n            // reinício do Discord, quando as listas já podem ter mudado.\n            log(\n                `AUTO UDP seleção falhou: ${message}`\n            );\n\n            return false;\n        }\n    }\n\n    writeStatus({\n        state: \"singbox-bootstrap-running\",\n        networkMode: (readSettings().networkMode === \"direct-first\" ? \"direct-first\" : \"singbox-auto\"),\n        singBoxBootstrapState: \"starting\",\n        singBoxBootstrapError: null,\n        directFallback: false\n    });\n\n    log(\n        `sing-box bootstrap ${nonce}: executando script; o próprio script solicitará UAC`\n    );\n\n    try {\n        await execFilePromise(\n            POWERSHELL_EXE,\n            [\n                \"-NoProfile\",\n                \"-ExecutionPolicy\",\n                \"Bypass\",\n                \"-File\",\n                SINGBOX_BOOTSTRAP\n            ],\n            {\n                windowsHide: false,\n                timeout: 300000\n            }\n        );\n\n        const install = readSingBoxInstallStatus();\n        const ok = install?.bootstrapOk === true;\n\n        writeJsonAtomic(SINGBOX_COMMAND_RESULT, {\n            version: \"2.0.9\",\n            nonce,\n            ok,\n            at: new Date().toISOString(),\n            stage: install?.stage || null,\n            error: install?.lastError || null\n        });\n\n        writeStatus({\n            singBoxBootstrapState: ok ? \"completed\" : \"failed\",\n            singBoxBootstrapError: install?.lastError || null\n        });\n\n        log(\n            `sing-box bootstrap ${nonce}: ${ok ? \"concluído\" : \"terminou sem ficar pronto\"}`\n        );\n\n        try { fs.unlinkSync(SINGBOX_COMMAND); } catch {}\n        return ok;\n    } catch (e) {\n        const install = readSingBoxInstallStatus();\n        const processError = e?.message || String(e);\n        const message = install?.lastError || processError;\n\n        writeJsonAtomic(SINGBOX_COMMAND_RESULT, {\n            version: \"2.0.9\",\n            nonce,\n            ok: false,\n            at: new Date().toISOString(),\n            stage: install?.stage || null,\n            error: message,\n            processError,\n            stderr: String(e?.stderr || \"\").slice(-3000)\n        });\n\n        writeStatus({\n            state: \"singbox-bootstrap-error\",\n            networkMode: (readSettings().networkMode === \"direct-first\" ? \"direct-first\" : \"singbox-auto\"),\n            singBoxBootstrapState: \"failed\",\n            singBoxBootstrapError: message,\n            directFallback: false\n        });\n\n        log(`sing-box bootstrap ${nonce} falhou: ${message}`);\n\n        try { fs.unlinkSync(SINGBOX_COMMAND); } catch {}\n        return false;\n    }\n}\n\nasync function querySingBoxRuntime() {\n    const ps = [\n        \"$proc = Get-Process -Name 'sing-box' -ErrorAction SilentlyContinue | Select-Object -First 1;\",\n        \"$adapter = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'GoLiveDeQueijo*' -or $_.InterfaceDescription -like '*sing-box*' -or $_.InterfaceDescription -like '*Wintun*' } | Select-Object -First 1;\",\n        \"$task = Get-ScheduledTask -TaskName 'GoLiveDeQueijo-SingBox' -ErrorAction SilentlyContinue;\",\n        \"$obj = [ordered]@{\",\n        \"processRunning = [bool]$proc;\",\n        \"pid = if ($proc) { [int]$proc.Id } else { $null };\",\n        \"tunUp = [bool]($adapter -and $adapter.Status -eq 'Up');\",\n        \"tunName = if ($adapter) { [string]$adapter.Name } else { $null };\",\n        \"taskState = if ($task) { [string]$task.State } else { $null };\",\n        \"};\",\n        \"$obj | ConvertTo-Json -Compress\"\n    ].join(\" \");\n\n    try {\n        const result =\n            await execFilePromise(\n            POWERSHELL_EXE,\n                [\n                    \"-NoProfile\",\n                    \"-ExecutionPolicy\",\n                    \"Bypass\",\n                    \"-Command\",\n                    ps\n                ],\n                {\n                    windowsHide: true,\n                    timeout: 8000\n                }\n            );\n\n        return JSON.parse(\n            String(\n                result.stdout || \"\"\n            )\n                .trim()\n                .replace(\n                    /^\\uFEFF/,\n                    \"\"\n                )\n        );\n    } catch (e) {\n        return {\n            processRunning: false,\n            pid: null,\n            tunUp: false,\n            tunName: null,\n            taskState: null,\n            error:\n                e?.message ||\n                String(e)\n        };\n    }\n}\n\nasync function ensureSingBoxTaskRunning() {\n    let runtime =\n        await querySingBoxRuntime();\n\n    if (\n        runtime.processRunning &&\n        runtime.tunUp\n    ) {\n        return runtime;\n    }\n\n    try {\n        await execFilePromise(\n            POWERSHELL_EXE,\n            [\n                \"-NoProfile\",\n                \"-ExecutionPolicy\",\n                \"Bypass\",\n                \"-Command\",\n                \"Start-ScheduledTask -TaskName 'GoLiveDeQueijo-SingBox' -ErrorAction SilentlyContinue\"\n            ],\n            {\n                windowsHide: true,\n                timeout: 8000\n            }\n        );\n    } catch {}\n\n    const started =\n        Date.now();\n\n    while (\n        Date.now() - started <\n        30000\n    ) {\n        await sleep(500);\n\n        runtime =\n            await querySingBoxRuntime();\n\n        if (\n            runtime.processRunning &&\n            runtime.tunUp\n        ) {\n            return runtime;\n        }\n    }\n\n    return runtime;\n}\n\nasync function singBoxHeartbeat() {\n    const runtime =\n        await querySingBoxRuntime();\n\n    const install =\n        readSingBoxInstallStatus();\n\n    let currentSafeProxy =\n        autoProxyCurrent?.proxy\n            ? safeProxy(\n                autoProxyCurrent.proxy\n            )\n            : null;\n\n    if (!currentSafeProxy) {\n        const cfg =\n            readJsonNoBom(\n                SINGBOX_CONFIG,\n                null\n            );\n\n        const socks =\n            Array.isArray(\n                cfg?.outbounds\n            )\n                ? cfg.outbounds.find(\n                    item =>\n                        item?.tag ===\n                        \"discord-socks\"\n                )\n                : null;\n\n        if (\n            socks?.server &&\n            socks?.server_port\n        ) {\n            currentSafeProxy =\n                `socks5://${socks.server}:${socks.server_port}`;\n        }\n    }\n\n    const ready =\n        runtime.processRunning ===\n            true &&\n        runtime.tunUp === true;\n\n    writeStatus({\n        state:\n            ready\n                ? \"singbox-ready\"\n                : \"singbox-not-ready\",\n        networkMode: (readSettings().networkMode === \"direct-first\" ? \"direct-first\" : \"singbox-auto\"),\n        pacActive: false,\n        proxyMode: \"auto-socks5-near-first\",\n        singBoxReady: ready,\n        singBoxRunning:\n            runtime.processRunning ===\n            true,\n        singBoxPid:\n            runtime.pid ?? null,\n        singBoxTunUp:\n            runtime.tunUp === true,\n        singBoxTunName:\n            runtime.tunName || null,\n        singBoxTaskState:\n            runtime.taskState || null,\n        singBoxVersion:\n            install?.singBoxVersion ||\n            \"1.13.20\",\n        singBoxProxy:\n            currentSafeProxy,\n        directFallback: false,\n        directReason:\n            ready\n                ? null\n                : (\n                    install?.lastError ||\n                    runtime.error ||\n                    \"sing-box/TUN não está pronto\"\n                )\n    });\n\n    return {\n        ready,\n        runtime,\n        install\n    };\n}\n\nfunction readWireGuardStatus() {\n    try {\n        const text = fs.readFileSync(\n            WG_STATUS,\n            \"utf8\"\n        ).replace(/^\\uFEFF/, \"\");\n\n        return JSON.parse(text);\n    } catch {\n        return null;\n    }\n}\n\nfunction wireGuardManagerReady() {\n    const status = readWireGuardStatus();\n\n    if (!status?.managerRunning || !status?.tunnelUp) {\n        return false;\n    }\n\n    try {\n        const updated = new Date(status.updatedAt || 0).getTime();\n        return Number.isFinite(updated)\n            && updated > 0\n            && Date.now() - updated < 10000;\n    } catch {\n        return false;\n    }\n}\n\nfunction touchRouteTarget(target, source = \"native\") {\n    target = String(target || \"\").trim();\n\n    if (!target) return false;\n\n    try {\n        mkdir();\n\n        let currentFile = {\n            version: 1,\n            updatedAt: null,\n            targets: []\n        };\n\n        try {\n            const parsed = JSON.parse(\n                fs.readFileSync(ROUTE_TARGETS, \"utf8\")\n            );\n\n            if (parsed && Array.isArray(parsed.targets)) {\n                currentFile = parsed;\n            }\n        } catch {}\n\n        const now = Date.now();\n\n        currentFile.targets = currentFile.targets\n            .filter(item => {\n                if (!item || !item.target) return false;\n                const touched = Number(item.touchedAt || 0);\n                return touched > 0 && now - touched < 15 * 60 * 1000;\n            })\n            .filter(item => String(item.target) !== target);\n\n        currentFile.targets.push({\n            target,\n            source,\n            touchedAt: now\n        });\n\n        currentFile.updatedAt = new Date().toISOString();\n\n        const tmp = ROUTE_TARGETS + \".tmp\";\n\n        fs.writeFileSync(\n            tmp,\n            JSON.stringify(currentFile, null, 2),\n            \"utf8\"\n        );\n\n        fs.renameSync(tmp, ROUTE_TARGETS);\n        return true;\n    } catch (e) {\n        log(`wireguard route target falhou (${target}): ${e.message}`);\n        return false;\n    }\n}\n\nfunction isRouteTargetReady(target) {\n    const status = readWireGuardStatus();\n\n    return !!(\n        status?.tunnelUp &&\n        Array.isArray(status.readyTargets) &&\n        status.readyTargets.includes(String(target))\n    );\n}\n\nasync function waitForRouteTarget(target, timeoutMs = 5000) {\n    const start = Date.now();\n\n    touchRouteTarget(target, \"router\");\n\n    while (Date.now() - start < timeoutMs) {\n        if (isRouteTargetReady(target)) return true;\n        await sleep(80);\n    }\n\n    return false;\n}\n\nasync function openThroughWireGuard(host, port, source = \"gateway\") {\n    if (!wireGuardManagerReady()) {\n        throw new Error(\n            \"WireGuard manager/túnel ainda não está pronto\"\n        );\n    }\n\n    touchRouteTarget(host, source);\n\n    const ready = await waitForRouteTarget(host, 6000);\n\n    if (!ready) {\n        const wg = readWireGuardStatus();\n\n        writeStatus({\n            wireGuardReady: false,\n            wireGuardRouteError:\n                `rota não ficou pronta para ${host}`,\n            wireGuardStatusError: wg?.lastError || null\n        });\n\n        throw new Error(\n            `rota WireGuard não ficou pronta para ${host}`\n        );\n    }\n\n    const socket = await directConnect(host, port);\n\n    const wg = readWireGuardStatus();\n\n    writeStatus({\n        wireGuardReady: true,\n        wireGuardTunnelUp: wg?.tunnelUp === true,\n        wireGuardInterfaceIndex: wg?.interfaceIndex ?? null,\n        wireGuardRouteCount: wg?.routeCount ?? null,\n        wireGuardRouteError: null\n    });\n\n    log(\n        `wireguard route pronta: ${source} ${host}:${port} -> ` +\n        `${wg?.interfaceAlias || \"GLQVPN\"}`\n    );\n\n    return {\n        socket,\n        viaProxy: false,\n        viaWireGuard: true,\n        proxy: null\n    };\n}\n\nasync function wireGuardHeartbeat() {\n    const wg = readWireGuardStatus();\n\n    writeStatus({\n        wireGuardReady: wireGuardManagerReady(),\n        wireGuardManagerRunning: wg?.managerRunning === true,\n        wireGuardTunnelUp: wg?.tunnelUp === true,\n        wireGuardService: wg?.tunnelService || null,\n        wireGuardInterfaceIndex: wg?.interfaceIndex ?? null,\n        wireGuardInterfaceAlias: wg?.interfaceAlias || null,\n        wireGuardRouteCount: wg?.routeCount ?? null,\n        wireGuardManagerError: wg?.lastError || null,\n        networkMode: \"wireguard\"\n    });\n}\n\nfunction trackSocket(socket) {\n    if (!socket || typeof socket.once !== \"function\") return socket;\n\n    activeSockets.add(socket);\n\n    // Keep one permanent no-op error listener on every probe socket.\n    // Individual probes still attach their own error handler, but if a dead\n    // public proxy emits a second/late ETIMEDOUT after that handler is removed,\n    // Node will not turn the EventEmitter \"error\" into an uncaught exception.\n    socket.on(\"error\", () => {});\n\n    socket.once(\"close\", () => {\n        activeSockets.delete(socket);\n    });\n\n    return socket;\n}\n\nfunction clearNativeTimers() {\n    if (heartbeatTimer) {\n        clearInterval(heartbeatTimer);\n        heartbeatTimer = null;\n    }\n\n    if (repairTimer) {\n        clearInterval(repairTimer);\n        repairTimer = null;\n    }\n\n    if (startupRepairTimer) {\n        clearTimeout(startupRepairTimer);\n        startupRepairTimer = null;\n    }\n\n    if (directMonitorTimer) {\n        clearInterval(\n            directMonitorTimer\n        );\n        directMonitorTimer =\n            null;\n    }\n\n    if (routeOptimizerTimer) {\n        clearTimeout(\n            routeOptimizerTimer\n        );\n\n        routeOptimizerTimer =\n            null;\n    }\n}\n\n\nfunction destroyActiveSockets() {\n    for (const socket of [...activeSockets]) {\n        try { socket.destroy(); } catch {}\n    }\n\n    activeSockets.clear();\n}\n\nfunction mkdir() {\n    try { fs.mkdirSync(BASE, {recursive: true}); } catch {}\n}\n\nfunction log(message) {\n    mkdir();\n    const line = `${new Date().toISOString()} ${message}`;\n    try { fs.appendFileSync(LOG, line + \"\\n\"); } catch {}\n    console.log(\"[GoLiveBypassBD/native]\", message);\n}\n\nfunction writeStatus(extra) {\n    mkdir();\n\n    let previous = {};\n\n    try {\n        const parsed = JSON.parse(fs.readFileSync(STATUS, \"utf8\"));\n        if (parsed && typeof parsed === \"object\") previous = parsed;\n    } catch {}\n\n    const body = Object.assign(\n        {},\n        previous,\n        {\n            version: \"2.0.9\",\n            pid: process.pid,\n            updatedAt: new Date().toISOString(),\n            routerPort,\n            pool: pool.map(x => ({\n                proxy: safeProxy(x.proxy),\n                country: x.country || null,\n                ms: x.ms ?? null\n            })),\n            current: current ? {\n                proxy: safeProxy(current.proxy),\n                country: current.country || null,\n                ms: current.ms ?? null\n            } : previous.current || null\n        },\n        extra || {}\n    );\n\n    try {\n        fs.writeFileSync(STATUS, JSON.stringify(body, null, 2), \"utf8\");\n    } catch {}\n}\n\nfunction readConsentConfig() {\n    try {\n        return Object.assign(\n            {\n                version: 1,\n                tutorialVersion: 1,\n                setupAccepted: false,\n                enabled: false\n            },\n            JSON.parse(\n                fs.readFileSync(\n                    CONSENT_CONFIG,\n                    \"utf8\"\n                )\n            )\n        );\n    } catch {\n        return {\n            version: 1,\n            tutorialVersion: 1,\n            setupAccepted: false,\n            enabled: false\n        };\n    }\n}\n\nfunction readSettings() {\n    try {\n        return Object.assign({\n            enabled: false,\n            excludedCountries: \"BR\",\n            manualProxy: \"\"\n        }, JSON.parse(fs.readFileSync(SETTINGS, \"utf8\")));\n    } catch {\n        return {\n            enabled: false,\n            excludedCountries: \"BR\",\n            manualProxy: \"\"\n        };\n    }\n}\n\nfunction excludedSet(settings) {\n    const result = new Set(\n        String(settings.excludedCountries || \"BR\")\n            .split(\",\")\n            .map(x => x.trim().toUpperCase())\n            .filter(x => /^[A-Z]{2}$/.test(x))\n    );\n    if (!result.size) result.add(\"BR\");\n    return result;\n}\n\nfunction parseProxy(value) {\n    const m = /^socks5:\\/\\/(?:(.*?)@)?([^:/?#\\s@]+):(\\d{1,5})$/i.exec(String(value || \"\").trim());\n    if (!m) return null;\n\n    const port = Number(m[3]);\n    if (!(port > 0 && port <= 65535)) return null;\n\n    let user = \"\";\n    let pass = \"\";\n\n    if (m[1]) {\n        const i = m[1].indexOf(\":\");\n        const dec = v => {\n            try { return decodeURIComponent(v); } catch { return v; }\n        };\n        user = dec(i < 0 ? m[1] : m[1].slice(0, i));\n        pass = dec(i < 0 ? \"\" : m[1].slice(i + 1));\n    }\n\n    return {\n        scheme: \"socks5\",\n        host: m[2],\n        port,\n        user,\n        pass,\n        raw: String(value).trim()\n    };\n}\n\nfunction safeProxy(proxy) {\n    if (!proxy) return \"nenhuma\";\n    return `socks5://${proxy.user ? proxy.user + \":***@\" : \"\"}${proxy.host}:${proxy.port}`;\n}\n\nfunction gatewayHost(host) {\n    const h = String(host || \"\").toLowerCase();\n\n    return h === \"gateway.discord.gg\"\n        || h === \"remote-auth-gateway.discord.gg\"\n        || (h.startsWith(\"gateway-\") && h.endsWith(\".discord.gg\"));\n}\n\nfunction mediaSignalingHost(host) {\n    const h = String(host || \"\").toLowerCase();\n\n    return h === \"discord.media\"\n        || h.endsWith(\".discord.media\");\n}\n\nfunction routedHost(host) {\n    return gatewayHost(host) || mediaSignalingHost(host);\n}\n\nfunction socketTimeout(socket, ms, reject) {\n    socket.setTimeout(ms, () => {\n        try { socket.destroy(); } catch {}\n        reject(new Error(\"timeout\"));\n    });\n}\n\nfunction socks5Tunnel(proxy, host, port, timeout = PROBE_TIMEOUT) {\n    return new Promise((resolve, reject) => {\n        const socket = trackSocket(net.connect(proxy.port, proxy.host));\n        let done = false;\n\n        const fail = error => {\n            if (done) return;\n            done = true;\n            try { socket.destroy(); } catch {}\n            reject(error instanceof Error ? error : new Error(String(error)));\n        };\n\n        socketTimeout(socket, timeout, fail);\n        socket.once(\"error\", fail);\n\n        socket.once(\"connect\", () => {\n            const methods = proxy.user ? [0x00, 0x02] : [0x00];\n            socket.write(Buffer.from([0x05, methods.length, ...methods]));\n\n            socket.once(\"data\", methodReply => {\n                if (methodReply.length < 2 || methodReply[0] !== 0x05) {\n                    return fail(new Error(\"SOCKS5 handshake inválido\"));\n                }\n                if (methodReply[1] === 0xff) {\n                    return fail(new Error(\"SOCKS5 sem método compatível\"));\n                }\n\n                const connectTarget = () => {\n                    const hostBuf = Buffer.from(host, \"utf8\");\n                    if (hostBuf.length > 255) return fail(new Error(\"hostname grande demais\"));\n\n                    const req = Buffer.concat([\n                        Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),\n                        hostBuf,\n                        Buffer.from([(port >> 8) & 255, port & 255])\n                    ]);\n\n                    socket.write(req);\n                    socket.once(\"data\", reply => {\n                        if (reply.length < 2 || reply[1] !== 0x00) {\n                            return fail(new Error(`SOCKS5 CONNECT recusado (${reply[1] ?? \"?\"})`));\n                        }\n\n                        if (done) return;\n                        done = true;\n                        socket.setTimeout(0);\n                        socket.removeListener(\"error\", fail);\n                        resolve(socket);\n                    });\n                };\n\n                if (methodReply[1] === 0x02) {\n                    const u = Buffer.from(proxy.user, \"utf8\");\n                    const p = Buffer.from(proxy.pass, \"utf8\");\n\n                    if (u.length > 255 || p.length > 255) {\n                        return fail(new Error(\"credencial SOCKS5 longa demais\"));\n                    }\n\n                    socket.write(Buffer.concat([\n                        Buffer.from([0x01, u.length]),\n                        u,\n                        Buffer.from([p.length]),\n                        p\n                    ]));\n\n                    socket.once(\"data\", authReply => {\n                        if (authReply.length < 2 || authReply[1] !== 0x00) {\n                            return fail(new Error(\"autenticação SOCKS5 recusada\"));\n                        }\n                        connectTarget();\n                    });\n                } else {\n                    connectTarget();\n                }\n            });\n        });\n    });\n}\n\nasync function tlsProbe(proxy, hostname, timeout = PROBE_TIMEOUT) {\n    const start = Date.now();\n    const raw = await socks5Tunnel(proxy, hostname, 443, timeout);\n\n    return await new Promise((resolve, reject) => {\n        let settled = false;\n\n        const secure = tls.connect({\n            socket: raw,\n            servername: hostname,\n            rejectUnauthorized: true\n        });\n\n        const fail = e => {\n            if (settled) return;\n            settled = true;\n            try { secure.destroy(); } catch {}\n            reject(e instanceof Error ? e : new Error(String(e)));\n        };\n\n        socketTimeout(secure, timeout, fail);\n        secure.once(\"error\", fail);\n        secure.once(\"secureConnect\", () => {\n            if (settled) return;\n            settled = true;\n            secure.setTimeout(0);\n            secure.destroy();\n            resolve(Date.now() - start);\n        });\n    });\n}\n\nfunction readSocketBytes(socket, minBytes, timeout) {\n    return new Promise((resolve, reject) => {\n        let buffer = Buffer.alloc(0);\n        let settled = false;\n\n        const finish = (error, value) => {\n            if (settled) return;\n            settled = true;\n            clearTimeout(timer);\n            socket.removeListener(\"data\", onData);\n            socket.removeListener(\"error\", onError);\n            socket.removeListener(\"close\", onClose);\n\n            if (error) {\n                try { socket.destroy(); } catch {}\n                reject(error);\n            } else {\n                resolve(value);\n            }\n        };\n\n        const onData = chunk => {\n            buffer =\n                Buffer.concat([\n                    buffer,\n                    chunk\n                ]);\n\n            if (\n                buffer.length >=\n                minBytes\n            ) {\n                finish(\n                    null,\n                    buffer\n                );\n            }\n        };\n\n        const onError = error =>\n            finish(\n                error instanceof Error\n                    ? error\n                    : new Error(String(error))\n            );\n\n        const onClose = () =>\n            finish(\n                new Error(\n                    \"SOCKS5 controle fechou\"\n                )\n            );\n\n        const timer =\n            setTimeout(\n                () =>\n                    finish(\n                        new Error(\n                            \"timeout SOCKS5\"\n                        )\n                    ),\n                timeout\n            );\n\n        socket.on(\n            \"data\",\n            onData\n        );\n        socket.once(\n            \"error\",\n            onError\n        );\n        socket.once(\n            \"close\",\n            onClose\n        );\n    });\n}\n\nasync function openSocksControl(\n    proxy,\n    timeout = AUTO_UDP_TIMEOUT\n) {\n    const socket =\n        trackSocket(\n            net.connect(\n                proxy.port,\n                proxy.host\n            )\n        );\n\n    try {\n        await new Promise(\n            (resolve, reject) => {\n                let settled = false;\n\n                const finish = error => {\n                    if (settled) return;\n                    settled = true;\n                    clearTimeout(timer);\n                    socket.removeListener(\n                        \"connect\",\n                        onConnect\n                    );\n                    socket.removeListener(\n                        \"error\",\n                        onError\n                    );\n\n                    if (error) {\n                        try {\n                            socket.destroy();\n                        } catch {}\n\n                        reject(error);\n                    } else {\n                        resolve();\n                    }\n                };\n\n                const onConnect =\n                    () => finish();\n\n                const onError =\n                    error =>\n                        finish(\n                            error instanceof Error\n                                ? error\n                                : new Error(String(error))\n                        );\n\n                const timer =\n                    setTimeout(\n                        () =>\n                            finish(\n                                new Error(\n                                    \"timeout conectando à SOCKS5\"\n                                )\n                            ),\n                        timeout\n                    );\n\n                socket.once(\n                    \"connect\",\n                    onConnect\n                );\n\n                socket.once(\n                    \"error\",\n                    onError\n                );\n            }\n        );\n\n        const methods =\n            proxy.user\n                ? [0x00, 0x02]\n                : [0x00];\n\n        socket.write(\n            Buffer.from([\n                0x05,\n                methods.length,\n                ...methods\n            ])\n        );\n\n        const methodReply =\n            await readSocketBytes(\n                socket,\n                2,\n                timeout\n            );\n\n        if (\n            methodReply[0] !== 0x05 ||\n            methodReply[1] === 0xff\n        ) {\n            throw new Error(\n                \"SOCKS5 sem método compatível\"\n            );\n        }\n\n        if (\n            methodReply[1] ===\n            0x02\n        ) {\n            const user =\n                Buffer.from(\n                    proxy.user || \"\",\n                    \"utf8\"\n                );\n\n            const pass =\n                Buffer.from(\n                    proxy.pass || \"\",\n                    \"utf8\"\n                );\n\n            socket.write(\n                Buffer.concat([\n                    Buffer.from([\n                        0x01,\n                        user.length\n                    ]),\n                    user,\n                    Buffer.from([\n                        pass.length\n                    ]),\n                    pass\n                ])\n            );\n\n            const authReply =\n                await readSocketBytes(\n                    socket,\n                    2,\n                    timeout\n                );\n\n            if (\n                authReply[0] !== 0x01 ||\n                authReply[1] !== 0x00\n            ) {\n                throw new Error(\n                    \"autenticação SOCKS5 recusada\"\n                );\n            }\n        }\n\n        return socket;\n    } catch (e) {\n        try {\n            socket.destroy();\n        } catch {}\n\n        throw e;\n    }\n}\n\nfunction parseSocksUdpReply(reply) {\n    if (\n        !reply ||\n        reply.length < 7 ||\n        reply[0] !== 0x05\n    ) {\n        throw new Error(\n            \"reply SOCKS5 UDP inválido\"\n        );\n    }\n\n    if (reply[1] !== 0x00) {\n        throw new Error(\n            `SOCKS5 UDP ASSOCIATE recusado (${reply[1]})`\n        );\n    }\n\n    const atyp =\n        reply[3];\n\n    let offset = 4;\n    let host = \"\";\n\n    if (atyp === 0x01) {\n        if (\n            reply.length < 10\n        ) {\n            throw new Error(\n                \"reply UDP IPv4 curto\"\n            );\n        }\n\n        host = [\n            reply[offset],\n            reply[offset + 1],\n            reply[offset + 2],\n            reply[offset + 3]\n        ].join(\".\");\n\n        offset += 4;\n    } else if (\n        atyp === 0x03\n    ) {\n        const length =\n            reply[offset];\n\n        offset += 1;\n\n        if (\n            !length ||\n            reply.length <\n                offset +\n                length +\n                2\n        ) {\n            throw new Error(\n                \"reply UDP hostname curto\"\n            );\n        }\n\n        host =\n            reply\n                .subarray(\n                    offset,\n                    offset + length\n                )\n                .toString(\n                    \"utf8\"\n                );\n\n        offset +=\n            length;\n    } else {\n        throw new Error(\n            `ATYP UDP não suportado (${atyp})`\n        );\n    }\n\n    if (\n        reply.length <\n        offset + 2\n    ) {\n        throw new Error(\n            \"reply UDP sem porta\"\n        );\n    }\n\n    return {\n        host,\n        port:\n            (reply[offset] << 8) |\n            reply[offset + 1]\n    };\n}\n\nfunction createDnsUdpProbe() {\n    const id =\n        Math.floor(\n            Math.random() *\n            65535\n        );\n\n    const labels =\n        \"cloudflare.com\"\n            .split(\".\")\n            .map(label => {\n                const raw =\n                    Buffer.from(\n                        label,\n                        \"ascii\"\n                    );\n\n                return Buffer.concat([\n                    Buffer.from([\n                        raw.length\n                    ]),\n                    raw\n                ]);\n            });\n\n    const dns =\n        Buffer.concat([\n            Buffer.from([\n                (id >> 8) & 0xff,\n                id & 0xff,\n                0x01, 0x00,\n                0x00, 0x01,\n                0x00, 0x00,\n                0x00, 0x00,\n                0x00, 0x00\n            ]),\n            ...labels,\n            Buffer.from([\n                0x00,\n                0x00, 0x01,\n                0x00, 0x01\n            ])\n        ]);\n\n    return {\n        id,\n        packet:\n            Buffer.concat([\n                Buffer.from([\n                    0x00, 0x00,\n                    0x00,\n                    0x01,\n                    1, 1, 1, 1,\n                    0x00, 0x35\n                ]),\n                dns\n            ])\n    };\n}\n\nfunction socksUdpPayloadOffset(\n    message\n) {\n    if (\n        !message ||\n        message.length < 7 ||\n        message[0] !== 0x00 ||\n        message[1] !== 0x00 ||\n        message[2] !== 0x00\n    ) {\n        return -1;\n    }\n\n    if (\n        message[3] === 0x01\n    ) {\n        return 10;\n    }\n\n    if (\n        message[3] === 0x03\n    ) {\n        return (\n            5 +\n            message[4] +\n            2\n        );\n    }\n\n    return -1;\n}\n\nasync function socks5UdpProbe(\n    proxy,\n    timeout = AUTO_UDP_TIMEOUT\n) {\n    const control =\n        await openSocksControl(\n            proxy,\n            timeout\n        );\n\n    let udp = null;\n\n    try {\n        control.write(\n            Buffer.from([\n                0x05,\n                0x03,\n                0x00,\n                0x01,\n                0, 0, 0, 0,\n                0, 0\n            ])\n        );\n\n        const reply =\n            await readSocketBytes(\n                control,\n                10,\n                timeout\n            );\n\n        const relay =\n            parseSocksUdpReply(\n                reply\n            );\n\n        const relayHost =\n            !relay.host ||\n            relay.host ===\n                \"0.0.0.0\"\n                ? proxy.host\n                : relay.host;\n\n        if (\n            !relay.port ||\n            relay.port < 1\n        ) {\n            throw new Error(\n                \"relay UDP sem porta\"\n            );\n        }\n\n        udp =\n            dgram.createSocket(\n                \"udp4\"\n            );\n\n        const probe =\n            createDnsUdpProbe();\n\n        const udpStartedAt =\n            Date.now();\n\n        const udpRttMs =\n            await new Promise(\n            (resolve, reject) => {\n                let settled = false;\n\n                const finish =\n                    (error, value) => {\n                        if (settled) {\n                            return;\n                        }\n\n                        settled =\n                            true;\n\n                        clearTimeout(\n                            timer\n                        );\n\n                        if (error) {\n                            reject(error);\n                        } else {\n                            resolve(value);\n                        }\n                    };\n\n                const timer =\n                    setTimeout(\n                        () =>\n                            finish(\n                                new Error(\n                                    \"timeout UDP ASSOCIATE\"\n                                )\n                            ),\n                        timeout\n                    );\n\n                udp.once(\n                    \"error\",\n                    finish\n                );\n\n                udp.on(\n                    \"message\",\n                    message => {\n                        const offset =\n                            socksUdpPayloadOffset(\n                                message\n                            );\n\n                        if (\n                            offset < 0 ||\n                            message.length <\n                                offset +\n                                2\n                        ) {\n                            return;\n                        }\n\n                        const responseId =\n                            (message[offset] << 8) |\n                            message[offset + 1];\n\n                        if (\n                            responseId ===\n                            probe.id\n                        ) {\n                            finish(\n                                null,\n                                Date.now() -\n                                    udpStartedAt\n                            );\n                        }\n                    }\n                );\n\n                udp.bind(\n                    0,\n                    \"0.0.0.0\",\n                    () => {\n                        udp.send(\n                            probe.packet,\n                            relay.port,\n                            relayHost,\n                            error => {\n                                if (error) {\n                                    finish(\n                                        error\n                                    );\n                                }\n                            }\n                        );\n                    }\n                );\n            }\n        );\n\n        return {\n            ok: true,\n            rttMs:\n                Number(\n                    udpRttMs\n                ) || 9999\n        };\n    } finally {\n        try {\n            udp?.close();\n        } catch {}\n\n        try {\n            control.destroy();\n        } catch {}\n    }\n}\n\nfunction average(\n    values\n) {\n    const clean =\n        values.filter(\n            value =>\n                Number.isFinite(\n                    value\n                )\n        );\n\n    if (!clean.length) {\n        return null;\n    }\n\n    return clean.reduce(\n        (sum, value) =>\n            sum + value,\n        0\n    ) / clean.length;\n}\n\nfunction median(\n    values\n) {\n    const clean =\n        values\n            .filter(\n                value =>\n                    Number.isFinite(\n                        value\n                    )\n            )\n            .sort(\n                (a, b) =>\n                    a - b\n            );\n\n    if (!clean.length) {\n        return null;\n    }\n\n    const middle =\n        Math.floor(\n            clean.length /\n            2\n        );\n\n    if (\n        clean.length %\n        2\n    ) {\n        return clean[\n            middle\n        ];\n    }\n\n    return (\n        clean[\n            middle - 1\n        ] +\n        clean[\n            middle\n        ]\n    ) / 2;\n}\n\nfunction routeJitter(\n    values\n) {\n    const clean =\n        values.filter(\n            value =>\n                Number.isFinite(\n                    value\n                )\n        );\n\n    if (\n        clean.length <\n        2\n    ) {\n        return 0;\n    }\n\n    const diffs = [];\n\n    for (\n        let i = 1;\n        i < clean.length;\n        i++\n    ) {\n        diffs.push(\n            Math.abs(\n                clean[i] -\n                clean[i - 1]\n            )\n        );\n    }\n\n    return (\n        average(\n            diffs\n        ) || 0\n    );\n}\n\nfunction routeQualityScore(\n    result\n) {\n    if (!result) {\n        return Number.MAX_SAFE_INTEGER;\n    }\n\n    const avg =\n        Number(\n            result.avgMs ??\n            result.udpMs\n        ) || 9999;\n\n    const jitter =\n        Number(\n            result.jitterMs\n        ) || 0;\n\n    const loss =\n        Number(\n            result.lossPct\n        ) || 0;\n\n    const gateway =\n        Number(\n            result.gatewayMs\n        ) || 9999;\n\n    return Math.round(\n        (\n            avg +\n            (\n                jitter *\n                2\n            ) +\n            (\n                loss *\n                8\n            ) +\n            (\n                gateway *\n                0.12\n            )\n        ) *\n        10\n    ) / 10;\n}\n\nfunction routeQualityLabel(\n    result\n) {\n    const avg =\n        Number(\n            result?.avgMs ??\n            result?.udpMs\n        ) || 9999;\n\n    if (\n        avg <=\n        ROUTE_ELITE_MS\n    ) {\n        return \"ELITE\";\n    }\n\n    if (\n        avg <=\n        ROUTE_EXCELLENT_MS\n    ) {\n        return \"EXCELENTE\";\n    }\n\n    if (\n        avg <=\n        ROUTE_TARGET_MS\n    ) {\n        return \"BOA\";\n    }\n\n    if (\n        avg <=\n        ROUTE_ACCEPTABLE_MS\n    ) {\n        return \"ACEITÁVEL\";\n    }\n\n    return \"LENTA\";\n}\n\nfunction readBestRoutesMemory(\n    excluded = new Set()\n) {\n    try {\n        const parsed =\n            JSON.parse(\n                fs.readFileSync(\n                    BEST_ROUTES,\n                    \"utf8\"\n                )\n            );\n\n        const entries =\n            Array.isArray(\n                parsed?.entries\n            )\n                ? parsed.entries\n                : [];\n\n        const now =\n            Date.now();\n\n        return entries\n            .map(\n                item => {\n                    const proxy =\n                        parseProxy(\n                            item?.raw ||\n                            \"\"\n                        );\n\n                    if (!proxy) {\n                        return null;\n                    }\n\n                    const country =\n                        String(\n                            item?.country ||\n                            \"\"\n                        )\n                            .trim()\n                            .toUpperCase();\n\n                    if (\n                        country &&\n                        excluded.has(\n                            country\n                        )\n                    ) {\n                        return null;\n                    }\n\n                    const savedAt =\n                        Number(\n                            item?.savedAt\n                        ) || 0;\n\n                    if (\n                        !savedAt ||\n                        now -\n                            savedAt >\n                            ROUTE_MEMORY_MAX_AGE\n                    ) {\n                        return null;\n                    }\n\n                    return {\n                        proxy,\n                        raw:\n                            proxy.raw,\n                        country:\n                            country ||\n                            null,\n                        avgMs:\n                            Number(\n                                item?.avgMs\n                            ) || null,\n                        medianMs:\n                            Number(\n                                item?.medianMs\n                            ) || null,\n                        minMs:\n                            Number(\n                                item?.minMs\n                            ) || null,\n                        maxMs:\n                            Number(\n                                item?.maxMs\n                            ) || null,\n                        jitterMs:\n                            Number(\n                                item?.jitterMs\n                            ) || 0,\n                        lossPct:\n                            Number(\n                                item?.lossPct\n                            ) || 0,\n                        gatewayMs:\n                            Number(\n                                item?.gatewayMs\n                            ) || null,\n                        score:\n                            Number(\n                                item?.score\n                            ) || null,\n                        label:\n                            item?.label ||\n                            null,\n                        savedAt\n                    };\n                }\n            )\n            .filter(\n                Boolean\n            )\n            .sort(\n                (a, b) =>\n                    routeQualityScore(a) -\n                    routeQualityScore(b)\n            );\n    } catch {\n        return [];\n    }\n}\n\nfunction saveBestRoutesMemory(\n    results\n) {\n    if (\n        !Array.isArray(\n            results\n        ) ||\n        !results.length\n    ) {\n        return;\n    }\n\n    const existing =\n        readBestRoutesMemory(\n            new Set()\n        );\n\n    const map =\n        new Map();\n\n    for (\n        const item of [\n            ...results,\n            ...existing\n        ]\n    ) {\n        const proxy =\n            item?.proxy ||\n            parseProxy(\n                item?.raw ||\n                \"\"\n            );\n\n        if (!proxy) {\n            continue;\n        }\n\n        const raw =\n            proxy.raw ||\n            `socks5://${proxy.host}:${proxy.port}`;\n\n        const entry = {\n            raw,\n            country:\n                String(\n                    item?.country ||\n                    \"\"\n                )\n                    .trim()\n                    .toUpperCase() ||\n                null,\n            avgMs:\n                Number(\n                    item?.avgMs ??\n                    item?.udpMs\n                ) || null,\n            medianMs:\n                Number(\n                    item?.medianMs ??\n                    item?.udpMs\n                ) || null,\n            minMs:\n                Number(\n                    item?.minMs ??\n                    item?.udpMs\n                ) || null,\n            maxMs:\n                Number(\n                    item?.maxMs ??\n                    item?.udpMs\n                ) || null,\n            jitterMs:\n                Number(\n                    item?.jitterMs\n                ) || 0,\n            lossPct:\n                Number(\n                    item?.lossPct\n                ) || 0,\n            gatewayMs:\n                Number(\n                    item?.gatewayMs\n                ) || null,\n            score:\n                routeQualityScore(\n                    item\n                ),\n            label:\n                routeQualityLabel(\n                    item\n                ),\n            savedAt:\n                Date.now()\n        };\n\n        const old =\n            map.get(\n                raw\n            );\n\n        if (\n            !old ||\n            entry.score <\n                old.score\n        ) {\n            map.set(\n                raw,\n                entry\n            );\n        }\n    }\n\n    const entries =\n        [...map.values()]\n            .filter(\n                item =>\n                    item.avgMs &&\n                    item.country\n            )\n            .sort(\n                (a, b) =>\n                    a.score -\n                    b.score\n            )\n            .slice(\n                0,\n                ROUTE_MEMORY_MAX\n            );\n\n    try {\n        fs.writeFileSync(\n            BEST_ROUTES,\n            JSON.stringify(\n                {\n                    version:\n                        \"1.9.15\",\n                    updatedAt:\n                        new Date()\n                            .toISOString(),\n                    note:\n                        \"Persistente de propósito: não é apagado pelo fresh reset.\",\n                    entries\n                },\n                null,\n                2\n            ),\n            \"utf8\"\n        );\n\n        writeStatus({\n            routeMemoryCount:\n                entries.length\n        });\n    } catch {}\n}\n\nasync function probeRouteQuality(\n    proxy,\n    excluded,\n    rounds =\n        ROUTE_QUALITY_ROUNDS\n) {\n    const started =\n        Date.now();\n\n    const samples = [];\n    let failed =\n        0;\n\n    for (\n        let i = 0;\n        i < rounds;\n        i++\n    ) {\n        try {\n            const udp =\n                await socks5UdpProbe(\n                    proxy,\n                    AUTO_UDP_TIMEOUT\n                );\n\n            const value =\n                Number(\n                    udp?.rttMs\n                );\n\n            if (\n                Number.isFinite(\n                    value\n                )\n            ) {\n                samples.push(\n                    value\n                );\n            } else {\n                failed++;\n            }\n        } catch {\n            failed++;\n        }\n    }\n\n    if (\n        samples.length <\n        Math.max(\n            2,\n            Math.ceil(\n                rounds *\n                0.6\n            )\n        )\n    ) {\n        throw new Error(\n            `qualidade UDP insuficiente ${samples.length}/${rounds}`\n        );\n    }\n\n    const avgMs =\n        average(\n            samples\n        );\n\n    const medianMs =\n        median(\n            samples\n        );\n\n    const jitterMs =\n        routeJitter(\n            samples\n        );\n\n    const lossPct =\n        (\n            failed /\n            rounds\n        ) *\n        100;\n\n    const gatewayMs =\n        await tlsProbe(\n            proxy,\n            \"gateway.discord.gg\",\n            AUTO_UDP_TIMEOUT\n        );\n\n    const country =\n        await countryThrough(\n            proxy\n        );\n\n    const normalized =\n        String(\n            country ||\n            \"\"\n        )\n            .trim()\n            .toUpperCase();\n\n    if (\n        !normalized ||\n        excluded.has(\n            normalized\n        )\n    ) {\n        throw new Error(\n            `país inválido/bloqueado ${normalized || \"?\"}`\n        );\n    }\n\n    const result = {\n        proxy,\n        country:\n            normalized,\n        samples,\n        avgMs:\n            Math.round(\n                avgMs *\n                10\n            ) / 10,\n        medianMs:\n            Math.round(\n                medianMs *\n                10\n            ) / 10,\n        minMs:\n            Math.min(\n                ...samples\n            ),\n        maxMs:\n            Math.max(\n                ...samples\n            ),\n        jitterMs:\n            Math.round(\n                jitterMs *\n                10\n            ) / 10,\n        lossPct:\n            Math.round(\n                lossPct *\n                10\n            ) / 10,\n        gatewayMs,\n        ms:\n            Date.now() -\n            started\n    };\n\n    result.score =\n        routeQualityScore(\n            result\n        );\n\n    result.label =\n        routeQualityLabel(\n            result\n        );\n\n    return result;\n}\n\nfunction routeCandidateGoodEnough(\n    result\n) {\n    if (!result) {\n        return false;\n    }\n\n    return (\n        Number(\n            result.avgMs\n        ) <=\n            ROUTE_TARGET_MS &&\n        Number(\n            result.jitterMs\n        ) <=\n            ROUTE_MAX_JITTER_MS &&\n        Number(\n            result.lossPct\n        ) <=\n            ROUTE_MAX_LOSS_PCT\n    );\n}\n\nfunction publishRouteWinner(\n    result,\n    state =\n        \"ready\"\n) {\n    if (!result) {\n        return;\n    }\n\n    routeOptimizerBest =\n        result;\n\n    saveBestRoutesMemory([\n        result\n    ]);\n\n    writeStatus({\n        routeRaceState:\n            state,\n        routeBestCountry:\n            result.country ||\n            null,\n        routeBestAvgMs:\n            result.avgMs ??\n            null,\n        routeBestMedianMs:\n            result.medianMs ??\n            null,\n        routeBestJitterMs:\n            result.jitterMs ??\n            null,\n        routeBestLossPct:\n            result.lossPct ??\n            null,\n        routeBestGatewayMs:\n            result.gatewayMs ??\n            null,\n        routeBestScore:\n            result.score ??\n            routeQualityScore(\n                result\n            ),\n        routeBestLabel:\n            result.label ||\n            routeQualityLabel(\n                result\n            ),\n        routeMemoryCount:\n            readBestRoutesMemory(\n                new Set()\n            ).length\n    });\n\n    log(\n        `ROUTE WINNER ${result.country || \"?\"} ` +\n        `avg=${result.avgMs}ms median=${result.medianMs}ms ` +\n        `jitter=${result.jitterMs}ms loss=${result.lossPct}% ` +\n        `gateway=${result.gatewayMs}ms score=${result.score}`\n    );\n}\n\nasync function validateRememberedRoutes(\n    excluded\n) {\n    const remembered =\n        readBestRoutesMemory(\n            excluded\n        )\n            .slice(\n                0,\n                6\n            );\n\n    if (!remembered.length) {\n        return null;\n    }\n\n    writeStatus({\n        routeRaceState:\n            `validando memória ${remembered.length}`,\n        routeMemoryCount:\n            remembered.length\n    });\n\n    for (\n        const item of remembered\n    ) {\n        try {\n            const quality =\n                await probeRouteQuality(\n                    item.proxy,\n                    excluded,\n                    3\n                );\n\n            if (\n                !routeOptimizerBest ||\n                quality.score <\n                    routeQualityScore(\n                        routeOptimizerBest\n                    )\n            ) {\n                publishRouteWinner(\n                    quality,\n                    \"memória validada\"\n                );\n            }\n\n            if (\n                routeCandidateGoodEnough(\n                    quality\n                )\n            ) {\n                return quality;\n            }\n        } catch (e) {\n            log(\n                `ROUTE MEMORY rejeitada ${safeProxy(item.proxy)}: ${e?.message || e}`\n            );\n        }\n    }\n\n    return routeOptimizerBest;\n}\n\nasync function runRouteOptimizer() {\n    if (\n        routeOptimizerBusy\n    ) {\n        return routeOptimizerPromise;\n    }\n\n    routeOptimizerBusy =\n        true;\n\n    routeOptimizerPromise =\n        (async () => {\n            const settings =\n                Object.assign(\n                    {},\n                    readSettings(),\n                    {\n                        manualProxy:\n                            \"\"\n                    }\n                );\n\n            const excluded =\n                excludedSet(\n                    settings\n                );\n\n            const remembered =\n                await validateRememberedRoutes(\n                    excluded\n                );\n\n            if (\n                remembered &&\n                routeCandidateGoodEnough(\n                    remembered\n                ) &&\n                remembered.avgMs <=\n                    ROUTE_EXCELLENT_MS\n            ) {\n                publishRouteWinner(\n                    remembered,\n                    \"memória excelente\"\n                );\n\n                return remembered;\n            }\n\n            writeStatus({\n                routeRaceState:\n                    \"fast race\",\n                routeRaceTested:\n                    0,\n                routeRaceValid:\n                    0\n            });\n\n            let fresh;\n\n            try {\n                fresh =\n                    await proxyCandidates(\n                        settings,\n                        0\n                    );\n            } catch (e) {\n                writeStatus({\n                    routeRaceState:\n                        \"fontes falharam\",\n                    routeRaceError:\n                        e?.message ||\n                        String(e)\n                });\n\n                return routeOptimizerBest;\n            }\n\n            const catalog =\n                loadAutoCatalog();\n\n            const catalogProxies =\n                [...catalog.values()]\n                    .map(\n                        catalogEntryToProxy\n                    )\n                    .filter(\n                        Boolean\n                    );\n\n            const unique =\n                new Map();\n\n            for (\n                const proxy of [\n                    ...fresh,\n                    ...catalogProxies\n                ]\n            ) {\n                const key =\n                    autoProxyKey(\n                        proxy\n                    );\n\n                if (\n                    !unique.has(\n                        key\n                    )\n                ) {\n                    unique.set(\n                        key,\n                        proxy\n                    );\n                }\n            }\n\n            const candidates =\n                sortAutoCandidatesNearBrazil(\n                    [...unique.values()],\n                    excluded\n                );\n\n            const started =\n                Date.now();\n\n            let cursor = 0;\n            let tested = 0;\n            let stopped =\n                false;\n\n            const fastValid = [];\n\n            const worker =\n                async () => {\n                    while (\n                        !stopped &&\n                        cursor <\n                            candidates.length &&\n                        tested <\n                            ROUTE_FAST_MAX_TESTS &&\n                        Date.now() -\n                            started <\n                            ROUTE_FAST_BUDGET_MS\n                    ) {\n                        const proxy =\n                            candidates[\n                                cursor++\n                            ];\n\n                        try {\n                            const fast =\n                                await probeRouteFastUdp(\n                                    proxy\n                                );\n\n                            tested++;\n\n                            if (\n                                fast.udpMs <=\n                                260\n                            ) {\n                                fastValid.push(\n                                    fast\n                                );\n\n                                fastValid.sort(\n                                    (a, b) =>\n                                        a.udpMs -\n                                        b.udpMs\n                                );\n\n                                if (\n                                    fastValid.length >\n                                    ROUTE_FAST_SHORTLIST_MAX\n                                ) {\n                                    fastValid.length =\n                                        ROUTE_FAST_SHORTLIST_MAX;\n                                }\n                            }\n\n                            if (\n                                fast.udpMs <=\n                                ROUTE_ELITE_MS\n                            ) {\n                                try {\n                                    const quality =\n                                        await probeRouteQuality(\n                                            proxy,\n                                            excluded\n                                        );\n\n                                    if (\n                                        !routeOptimizerBest ||\n                                        quality.score <\n                                            routeQualityScore(\n                                                routeOptimizerBest\n                                            )\n                                    ) {\n                                        publishRouteWinner(\n                                            quality,\n                                            \"elite confirmada\"\n                                        );\n                                    }\n\n                                    if (\n                                        routeCandidateGoodEnough(\n                                            quality\n                                        ) &&\n                                        quality.avgMs <=\n                                            ROUTE_EXCELLENT_MS\n                                    ) {\n                                        stopped =\n                                            true;\n                                    }\n                                } catch {}\n                            }\n                        } catch {\n                            tested++;\n                        }\n\n                        if (\n                            tested %\n                            20 ===\n                            0\n                        ) {\n                            writeStatus({\n                                routeRaceState:\n                                    \"fast race\",\n                                routeRaceTested:\n                                    tested,\n                                routeRaceValid:\n                                    fastValid.length,\n                                routeRaceCandidates:\n                                    candidates.length\n                            });\n                        }\n                    }\n                };\n\n            await Promise.all(\n                Array.from(\n                    {\n                        length:\n                            Math.min(\n                                ROUTE_FAST_WORKERS,\n                                candidates.length\n                            )\n                    },\n                    worker\n                )\n            );\n\n            if (\n                routeOptimizerBest &&\n                routeCandidateGoodEnough(\n                    routeOptimizerBest\n                ) &&\n                routeOptimizerBest.avgMs <=\n                    ROUTE_EXCELLENT_MS\n            ) {\n                return routeOptimizerBest;\n            }\n\n            const shortlist =\n                fastValid\n                    .sort(\n                        (a, b) =>\n                            a.udpMs -\n                            b.udpMs\n                    )\n                    .slice(\n                        0,\n                        10\n                    );\n\n            writeStatus({\n                routeRaceState:\n                    `quality race ${shortlist.length}`,\n                routeRaceTested:\n                    tested,\n                routeRaceValid:\n                    shortlist.length\n            });\n\n            let qCursor =\n                0;\n\n            const qualityResults = [];\n\n            const qWorker =\n                async () => {\n                    while (\n                        qCursor <\n                        shortlist.length\n                    ) {\n                        const fast =\n                            shortlist[\n                                qCursor++\n                            ];\n\n                        try {\n                            const quality =\n                                await probeRouteQuality(\n                                    fast.proxy,\n                                    excluded\n                                );\n\n                            qualityResults.push(\n                                quality\n                            );\n\n                            if (\n                                !routeOptimizerBest ||\n                                quality.score <\n                                    routeQualityScore(\n                                        routeOptimizerBest\n                                    )\n                            ) {\n                                publishRouteWinner(\n                                    quality,\n                                    \"quality race\"\n                                );\n                            }\n                        } catch (e) {\n                            log(\n                                `ROUTE QUALITY rejeitada ${safeProxy(fast.proxy)}: ${e?.message || e}`\n                            );\n                        }\n                    }\n                };\n\n            await Promise.all(\n                Array.from(\n                    {\n                        length:\n                            Math.min(\n                                ROUTE_QUALITY_WORKERS,\n                                shortlist.length\n                            )\n                    },\n                    qWorker\n                )\n            );\n\n            const combined =\n                [\n                    ...qualityResults,\n                    ...(routeOptimizerBest\n                        ? [\n                            routeOptimizerBest\n                        ]\n                        : [])\n                ]\n                    .sort(\n                        (a, b) =>\n                            routeQualityScore(\n                                a\n                            ) -\n                            routeQualityScore(\n                                b\n                            )\n                    );\n\n            if (\n                combined.length\n            ) {\n                saveBestRoutesMemory(\n                    combined\n                );\n\n                publishRouteWinner(\n                    combined[0],\n                    routeCandidateGoodEnough(\n                        combined[0]\n                    )\n                        ? \"pronta\"\n                        : \"melhor disponível\"\n                );\n\n                return combined[0];\n            }\n\n            writeStatus({\n                routeRaceState:\n                    \"nenhuma rota UDP boa\",\n                routeRaceTested:\n                    tested\n            });\n\n            return routeOptimizerBest;\n        })()\n        .catch(\n            e => {\n                writeStatus({\n                    routeRaceState:\n                        \"erro\",\n                    routeRaceError:\n                        e?.message ||\n                        String(e)\n                });\n\n                log(\n                    `ROUTE OPTIMIZER erro: ${e?.message || e}`\n                );\n\n                return routeOptimizerBest;\n            }\n        )\n        .finally(\n            () => {\n                routeOptimizerBusy =\n                    false;\n\n                routeOptimizerPromise =\n                    null;\n            }\n        );\n\n    return routeOptimizerPromise;\n}\n\nfunction startRouteOptimizerSoon() {\n    if (\n        routeOptimizerTimer\n    ) {\n        clearTimeout(\n            routeOptimizerTimer\n        );\n    }\n\n    routeOptimizerTimer =\n        setTimeout(\n            () => {\n                routeOptimizerTimer =\n                    null;\n\n                runRouteOptimizer();\n            },\n            1800\n        );\n}\n\nasync function bestPreparedRouteForFallback(\n    excluded\n) {\n    if (\n        routeOptimizerBest &&\n        routeOptimizerBest.country &&\n        !excluded.has(\n            routeOptimizerBest.country\n        )\n    ) {\n        try {\n            const quality =\n                await probeRouteQuality(\n                    routeOptimizerBest.proxy,\n                    excluded,\n                    3\n                );\n\n            if (\n                quality.avgMs <=\n                ROUTE_ACCEPTABLE_MS &&\n                quality.lossPct <=\n                10\n            ) {\n                publishRouteWinner(\n                    quality,\n                    \"fallback validada\"\n                );\n\n                return quality;\n            }\n        } catch {}\n    }\n\n    const remembered =\n        readBestRoutesMemory(\n            excluded\n        )\n            .slice(\n                0,\n                5\n            );\n\n    for (\n        const item of remembered\n    ) {\n        try {\n            const quality =\n                await probeRouteQuality(\n                    item.proxy,\n                    excluded,\n                    3\n                );\n\n            if (\n                quality.avgMs <=\n                ROUTE_ACCEPTABLE_MS &&\n                quality.lossPct <=\n                10\n            ) {\n                publishRouteWinner(\n                    quality,\n                    \"fallback memória\"\n                );\n\n                return quality;\n            }\n        } catch {}\n    }\n\n    return null;\n}\n\nasync function probeAutoUdpExit(\n    proxy,\n    excluded\n) {\n    const started =\n        Date.now();\n\n    // UDP primeiro: é o que importa para voz/live e elimina rápido\n    // proxies que só suportam TCP.\n    const udp =\n        await socks5UdpProbe(\n            proxy\n        );\n\n    const udpMs =\n        Number(\n            udp?.rttMs\n        ) || 9999;\n\n    if (\n        udpMs >\n        AUTO_HARD_MAX_UDP_MS\n    ) {\n        throw new Error(\n            `UDP RTT alto: ${udpMs}ms`\n        );\n    }\n\n    // Depois confirma que o Gateway Discord passa por TCP/TLS.\n    const gatewayMs =\n        await tlsProbe(\n            proxy,\n            \"gateway.discord.gg\",\n            AUTO_UDP_TIMEOUT\n        );\n\n    if (\n        gatewayMs >\n        AUTO_GATEWAY_MAX_MS\n    ) {\n        throw new Error(\n            `Gateway TLS alto: ${gatewayMs}ms`\n        );\n    }\n\n    // País fica por último. Assim não desperdiçamos consulta de país\n    // em milhares de SOCKS mortas ou TCP-only.\n    const country =\n        await countryThrough(\n            proxy\n        );\n\n    const normalized =\n        String(\n            country || \"\"\n        ).toUpperCase();\n\n    if (\n        !normalized ||\n        excluded.has(\n            normalized\n        )\n    ) {\n        throw new Error(\n            `país inválido/bloqueado: ${normalized || \"?\"}`\n        );\n    }\n\n    return {\n        proxy,\n        country:\n            normalized,\n        ms:\n            Date.now() -\n            started,\n        gatewayMs,\n        udpMs,\n        udp: true,\n        instant:\n            udpMs <=\n            AUTO_INSTANT_UDP_MS,\n        target:\n            udpMs <=\n            AUTO_TARGET_UDP_MS\n    };\n}\n\nfunction autoProxyScore(\n    result\n) {\n    if (!result) {\n        return Number.MAX_SAFE_INTEGER;\n    }\n\n    const udpMs =\n        Number(\n            result.udpMs\n        ) || 9999;\n\n    const gatewayMs =\n        Number(\n            result.gatewayMs\n        ) || 9999;\n\n    const targetPenalty =\n        udpMs <=\n        AUTO_TARGET_UDP_MS\n            ? 0\n            : (\n                udpMs -\n                AUTO_TARGET_UDP_MS\n            ) * 120;\n\n    return (\n        targetPenalty +\n        (udpMs * 100) +\n        gatewayMs\n    );\n}\n\nfunction readAutoBestCache(\n    excluded\n) {\n    try {\n        const parsed =\n            JSON.parse(\n                fs.readFileSync(\n                    AUTO_BEST_CACHE,\n                    \"utf8\"\n                )\n            );\n\n        const entries =\n            Array.isArray(\n                parsed?.entries\n            )\n                ? parsed.entries\n                : [];\n\n        const now =\n            Date.now();\n\n        return entries\n            .map(item => {\n                const proxy =\n                    parseProxy(\n                        item?.raw ||\n                        \"\"\n                    );\n\n                if (!proxy) {\n                    return null;\n                }\n\n                const country =\n                    String(\n                        item?.country ||\n                        \"\"\n                    ).toUpperCase();\n\n                if (\n                    !country ||\n                    excluded.has(\n                        country\n                    )\n                ) {\n                    return null;\n                }\n\n                const savedAt =\n                    Number(\n                        item?.savedAt\n                    ) || 0;\n\n                if (\n                    !savedAt ||\n                    now -\n                        savedAt >\n                        AUTO_BEST_CACHE_MAX_AGE\n                ) {\n                    return null;\n                }\n\n                return {\n                    proxy,\n                    country,\n                    udpMs:\n                        Number(\n                            item?.udpMs\n                        ) || null,\n                    gatewayMs:\n                        Number(\n                            item?.gatewayMs\n                        ) || null,\n                    ms:\n                        Number(\n                            item?.ms\n                        ) || null,\n                    savedAt\n                };\n            })\n            .filter(Boolean)\n            .sort(\n                (a, b) =>\n                    autoProxyScore(a) -\n                    autoProxyScore(b)\n            )\n            .slice(\n                0,\n                AUTO_BEST_CACHE_TEST_MAX\n            );\n    } catch {\n        return [];\n    }\n}\n\nfunction saveAutoBestResults(\n    results\n) {\n    if (\n        !Array.isArray(\n            results\n        ) ||\n        !results.length\n    ) {\n        return;\n    }\n\n    let previous = [];\n\n    try {\n        const parsed =\n            JSON.parse(\n                fs.readFileSync(\n                    AUTO_BEST_CACHE,\n                    \"utf8\"\n                )\n            );\n\n        if (\n            Array.isArray(\n                parsed?.entries\n            )\n        ) {\n            previous =\n                parsed.entries;\n        }\n    } catch {}\n\n    const map =\n        new Map();\n\n    for (\n        const item of [\n            ...results,\n            ...previous\n        ]\n    ) {\n        const proxy =\n            item?.proxy ||\n            parseProxy(\n                item?.raw ||\n                \"\"\n            );\n\n        if (!proxy) {\n            continue;\n        }\n\n        const raw =\n            proxy.raw ||\n            `socks5://${proxy.host}:${proxy.port}`;\n\n        const country =\n            String(\n                item?.country ||\n                \"\"\n            ).toUpperCase();\n\n        const udpMs =\n            Number(\n                item?.udpMs\n            ) || null;\n\n        if (\n            !country ||\n            !udpMs\n        ) {\n            continue;\n        }\n\n        const entry = {\n            raw,\n            country,\n            udpMs,\n            gatewayMs:\n                Number(\n                    item?.gatewayMs\n                ) || null,\n            ms:\n                Number(\n                    item?.ms\n                ) || null,\n            savedAt:\n                Date.now()\n        };\n\n        const old =\n            map.get(\n                raw\n            );\n\n        if (\n            !old ||\n            autoProxyScore(\n                entry\n            ) <\n            autoProxyScore(\n                old\n            )\n        ) {\n            map.set(\n                raw,\n                entry\n            );\n        }\n    }\n\n    const entries =\n        [...map.values()]\n            .sort(\n                (a, b) =>\n                    autoProxyScore(a) -\n                    autoProxyScore(b)\n            )\n            .slice(\n                0,\n                AUTO_BEST_CACHE_MAX\n            );\n\n    try {\n        fs.writeFileSync(\n            AUTO_BEST_CACHE,\n            JSON.stringify(\n                {\n                    version:\n                        \"1.9.15\",\n                    updatedAt:\n                        new Date()\n                            .toISOString(),\n                    entries\n                },\n                null,\n                2\n            ),\n            \"utf8\"\n        );\n\n        writeStatus({\n            autoBestCacheCount:\n                entries.length\n        });\n    } catch {}\n}\n\nasync function tryAutoBestCache(\n    excluded\n) {\n    const cached =\n        readAutoBestCache(\n            excluded\n        );\n\n    writeStatus({\n        autoBestCacheCount:\n            cached.length,\n        autoBestCacheTesting:\n            cached.length > 0\n    });\n\n    if (\n        !cached.length\n    ) {\n        return null;\n    }\n\n    log(\n        `AUTO CACHE: testando ${cached.length} melhores saídas salvas`\n    );\n\n    const validated =\n        [];\n\n    for (\n        const item of cached\n    ) {\n        try {\n            const result =\n                await probeAutoUdpExit(\n                    item.proxy,\n                    excluded\n                );\n\n            validated.push(\n                result\n            );\n\n            log(\n                `AUTO CACHE ok: ${safeProxy(result.proxy)} ` +\n                `país=${result.country} UDP=${result.udpMs}ms ` +\n                `gateway=${result.gatewayMs}ms`\n            );\n\n            // <=200 ms ainda é excelente para evitar a busca completa.\n            if (\n                result.udpMs <=\n                AUTO_TARGET_UDP_MS\n            ) {\n                saveAutoBestResults(\n                    validated\n                );\n\n                writeStatus({\n                    autoProxyFromBestCache:\n                        true,\n                    autoBestCacheTesting:\n                        false\n                });\n\n                return result;\n            }\n        } catch (e) {\n            log(\n                `AUTO CACHE descartada ${safeProxy(item.proxy)}: ${e?.message || e}`\n            );\n        }\n    }\n\n    saveAutoBestResults(\n        validated\n    );\n\n    writeStatus({\n        autoProxyFromBestCache:\n            false,\n        autoBestCacheTesting:\n            false\n    });\n\n    return null;\n}\n\nfunction chooseBestAutoProxy(\n    results\n) {\n    return [...results]\n        .sort(\n            (a, b) =>\n                autoProxyScore(a) -\n                autoProxyScore(b)\n        )[0] || null;\n}\n\nfunction writeAutoSingBoxConfig(\n    result\n) {\n    const proxy =\n        result?.proxy;\n\n    if (!proxy) {\n        throw new Error(\n            \"proxy automática ausente\"\n        );\n    }\n\n    const socks = {\n        type: \"socks\",\n        tag: \"discord-socks\",\n        server:\n            proxy.host,\n        server_port:\n            proxy.port,\n        version: \"5\"\n    };\n\n    if (proxy.user) {\n        socks.username =\n            proxy.user;\n    }\n\n    if (proxy.pass) {\n        socks.password =\n            proxy.pass;\n    }\n\n    const config = {\n        $schema:\n            \"https://sing-box.sagernet.org/schema.json\",\n        log: {\n            level: \"info\",\n            timestamp: true,\n            output:\n                SINGBOX_LOG\n        },\n        inbounds: [\n            {\n                type: \"tun\",\n                tag: \"tun-in\",\n                interface_name:\n                    \"GoLiveDeQueijo\",\n                address: [\n                    \"172.19.0.1/30\"\n                ],\n                mtu: 1500,\n                auto_route:\n                    true,\n                strict_route:\n                    false,\n                stack:\n                    \"system\"\n            }\n        ],\n        outbounds: [\n            socks,\n            {\n                type:\n                    \"direct\",\n                tag:\n                    \"direct\"\n            }\n        ],\n        route: {\n            auto_detect_interface:\n                true,\n            rules: [\n                {\n                    process_name: [\n                        \"Discord.exe\",\n                        \"DiscordCanary.exe\",\n                        \"DiscordPTB.exe\"\n                    ],\n                    action:\n                        \"route\",\n                    outbound:\n                        \"discord-socks\"\n                }\n            ],\n            final:\n                \"direct\"\n        }\n    };\n\n    fs.writeFileSync(\n        SINGBOX_CONFIG,\n        JSON.stringify(\n            config,\n            null,\n            2\n        ),\n        \"utf8\"\n    );\n\n    autoProxyCurrent =\n        result;\n\n    rememberExit(\n        result\n    );\n\n    saveAutoBestResults([\n        result\n    ]);\n\n    updateAutoCatalogResult(\n        proxy,\n        result\n    );\n\n    flushAutoCatalogNow();\n\n    writeStatus({\n        state:\n            \"auto-proxy-ready\",\n        networkMode:\n            \"singbox-auto\",\n        proxyMode:\n            \"auto-socks5-udp\",\n        singBoxProxy:\n            safeProxy(proxy),\n        autoProxyCountry:\n            result.country,\n        autoProxyUdpOk:\n            true,\n        autoProxyUdpMs:\n            result.udpMs,\n        autoProxyGatewayMs:\n            result.gatewayMs,\n        autoProxyProfile:\n            result.udpMs <= AUTO_INSTANT_UDP_MS\n                ? \"NEAR-FIRST INSTANT <=150ms\"\n                : result.udpMs <= AUTO_TARGET_UDP_MS\n                    ? \"NEAR-FIRST <=200ms\"\n                    : result.udpMs <= AUTO_STAGE2_UDP_MS\n                        ? \"NEAR-FIRST <=300ms\"\n                        : result.udpMs <= AUTO_STAGE3_UDP_MS\n                            ? \"NEAR-FIRST <=450ms\"\n                            : \"NEAR-FIRST melhor disponível\",\n        autoProxyMs:\n            result.ms,\n        autoProxyJitterMs:\n            result.jitterMs ??\n            null,\n        autoProxyLossPct:\n            result.lossPct ??\n            null,\n        autoProxyQualityScore:\n            result.qualityScore ??\n            result.score ??\n            null,\n        autoProxyQualityLabel:\n            result.qualityLabel ??\n            result.label ??\n            null,\n        proxySelectionError:\n            null\n    });\n\n    log(\n        `AUTO UDP exit pronta: ${safeProxy(proxy)} ` +\n        `país=${result.country || \"?\"} ` +\n        `UDP=${result.udpMs || \"?\"}ms ` +\n        `gateway=${result.gatewayMs || \"?\"}ms`\n    );\n\n    return config;\n}\n\nasync function selectAutoUdpProxy() {\n    if (autoProxySelectionBusy) {\n        throw new Error(\n            \"seleção automática já está em andamento\"\n        );\n    }\n\n    autoProxySelectionBusy = true;\n\n    const started = Date.now();\n    let qualityTimer = null;\n\n    try {\n        const settings = Object.assign(\n            {},\n            readSettings(),\n            {manualProxy: \"\"}\n        );\n\n        const excluded = excludedSet(settings);\n\n        // Antes de varrer milhares de proxies, usa a rota de qualidade\n        // já preparada pelo Media Route Race.\n        const prepared =\n            await bestPreparedRouteForFallback(\n                excluded\n            );\n\n        if (prepared) {\n            const normalizedPrepared = {\n                proxy:\n                    prepared.proxy,\n                country:\n                    prepared.country,\n                udpMs:\n                    prepared.avgMs,\n                gatewayMs:\n                    prepared.gatewayMs,\n                ms:\n                    prepared.ms,\n                jitterMs:\n                    prepared.jitterMs,\n                lossPct:\n                    prepared.lossPct,\n                qualityScore:\n                    prepared.score,\n                qualityLabel:\n                    prepared.label,\n                fromMediaRace:\n                    true\n            };\n\n            writeStatus({\n                routeRaceState:\n                    \"usando rota preparada\",\n                autoProxyFromMediaRace:\n                    true\n            });\n\n            return normalizedPrepared;\n        }\n\n        const initialCatalog = loadAutoCatalog();\n\n        writeStatus({\n            state: \"auto-proxy-search\",\n            networkMode: (readSettings().networkMode === \"direct-first\" ? \"direct-first\" : \"singbox-auto\"),\n            proxyMode: \"auto-socks5-near-first\",\n            autoProxyTested: 0,\n            autoProxyValid: 0,\n            autoProxyUdpOk: false,\n            autoProxyUdpMs: null,\n            autoProxyGatewayMs: null,\n            autoProxyCountry: null,\n            autoProxyBestCountry: null,\n            autoProxyBestUdpMs: null,\n            autoProxySearchElapsedMs: 0,\n            autoProxyProfile: \"NEAR-FIRST GLOBAL\",\n            autoProxyFromBestCache: false,\n            autoProxyWorkers: AUTO_PROXY_WORKERS,\n            autoCatalogCount: initialCatalog.size,\n            singBoxProxy: null,\n            country: null,\n            proxy: null,\n            proxySelectionError: null,\n            directFallback: false\n        });\n\n        const cachedBest = await tryAutoBestCache(excluded);\n\n        if (cachedBest) {\n            updateAutoCatalogResult(cachedBest.proxy, cachedBest);\n            flushAutoCatalogNow();\n\n            log(\n                `AUTO CACHE selecionada: ${safeProxy(cachedBest.proxy)} ` +\n                `país=${cachedBest.country} UDP=${cachedBest.udpMs}ms`\n            );\n\n            return cachedBest;\n        }\n\n        log(\n            `AUTO NEAR-FIRST: catálogo completo; ` +\n            `excluídos=[${[...excluded].join(\",\")}] workers=${AUTO_PROXY_WORKERS}`\n        );\n\n        // limit=0 = todos os candidatos, sem o antigo teto de 180.\n        const fresh = await proxyCandidates(settings, 0);\n\n        const catalog = loadAutoCatalog();\n\n        const catalogProxies = [...catalog.values()]\n            .map(catalogEntryToProxy)\n            .filter(Boolean);\n\n        const unique = new Map();\n\n        for (const proxy of [...fresh, ...catalogProxies]) {\n            const key = autoProxyKey(proxy);\n            const old = unique.get(key);\n\n            if (!old) {\n                unique.set(key, proxy);\n                continue;\n            }\n\n            if (!old.countryHint && proxy.countryHint) {\n                old.countryHint = proxy.countryHint;\n            }\n\n            // Sempre copia o histórico do catálogo, inclusive falhas.\n            // Na 1.9.7 isso só acontecia quando catalogValid=true,\n            // então proxies recém-falhadas voltavam para o início a cada restart.\n            if (proxy.catalogLastTestedAt) {\n                old.catalogLastTestedAt = proxy.catalogLastTestedAt;\n            }\n\n            old.catalogFailureCount =\n                proxy.catalogFailureCount || 0;\n\n            old.catalogLastSeenAt =\n                proxy.catalogLastSeenAt || 0;\n\n            if (proxy.catalogUdpMs) {\n                old.catalogUdpMs = proxy.catalogUdpMs;\n            }\n\n            if (proxy.catalogGatewayMs) {\n                old.catalogGatewayMs = proxy.catalogGatewayMs;\n            }\n\n            if (proxy.catalogValid) {\n                old.catalogValid = true;\n            }\n        }\n\n        let candidates = sortAutoCandidatesNearBrazil(\n            [...unique.values()],\n            excluded\n        );\n\n        if (AUTO_PROXY_MAX > 0) {\n            candidates = candidates.slice(0, AUTO_PROXY_MAX);\n        }\n\n        if (!candidates.length) {\n            throw new Error(\"catálogo não retornou candidatos SOCKS5\");\n        }\n\n        const knownCountries = candidates.filter(\n            item => item.countryHint\n        ).length;\n\n        const nowForQueue =\n            Date.now();\n\n        const untestedCount =\n            candidates.filter(\n                item =>\n                    !item.catalogLastTestedAt\n            ).length;\n\n        const deferredFailureCount =\n            candidates.filter(\n                item =>\n                    item.catalogFailureCount > 0 &&\n                    item.catalogLastTestedAt &&\n                    nowForQueue -\n                        item.catalogLastTestedAt <\n                        AUTO_RECENT_FAIL_DEFER_MS\n            ).length;\n\n        writeStatus({\n            autoProxyCandidates: candidates.length,\n            autoCatalogCount: catalog.size,\n            autoCatalogKnownCountry: knownCountries,\n            autoUntestedCount: untestedCount,\n            autoDeferredFailureCount: deferredFailureCount,\n            autoProxyCurrentTier: autoTierLabel(candidates[0])\n        });\n\n        log(\n            `AUTO catálogo pronto: ${candidates.length} candidatos; ` +\n            `${knownCountries} com país; nãoTestadas=${untestedCount}; ` +\n            `falhasAdiados=${deferredFailureCount}; início=${autoTierLabel(candidates[0])}`\n        );\n\n        let cursor = 0;\n        let tested = 0;\n        let lastError = null;\n        let closed = false;\n        let selected = null;\n\n        const valid = [];\n\n        let resolveQuality;\n\n        const qualityPromise = new Promise(resolve => {\n            resolveQuality = resolve;\n        });\n\n        const settleWith = (result, reason) => {\n            if (closed || !result) return false;\n\n            selected = result;\n            closed = true;\n\n            log(\n                `AUTO SELECT (${reason}): ${safeProxy(result.proxy)} ` +\n                `país=${result.country} UDP=${result.udpMs}ms ` +\n                `gateway=${result.gatewayMs}ms`\n            );\n\n            resolveQuality(result);\n            return true;\n        };\n\n        qualityTimer = setInterval(\n            () => {\n                if (closed) return;\n\n                const elapsed = Date.now() - started;\n                const best = chooseBestAutoProxy(valid);\n                const next = candidates[\n                    Math.min(cursor, candidates.length - 1)\n                ];\n\n                writeStatus({\n                    state: \"auto-proxy-search\",\n                    autoProxySearchElapsedMs: elapsed,\n                    autoProxyBestCountry: best?.country || null,\n                    autoProxyBestUdpMs: best?.udpMs ?? null,\n                    autoProxyValid: valid.length,\n                    autoProxyTested: tested,\n                    autoProxyCurrentTier:\n                        next ? autoTierLabel(next) : \"fim da fila\"\n                });\n\n                if (!best) {\n                    if (elapsed >= AUTO_FORCE_AFTER_MS) {\n                        closed = true;\n                        resolveQuality(null);\n                    }\n                    return;\n                }\n\n                if (best.udpMs <= AUTO_INSTANT_UDP_MS) {\n                    settleWith(best, \"<=150ms\");\n                    return;\n                }\n\n                if (\n                    elapsed >= AUTO_STAGE1_AFTER_MS &&\n                    best.udpMs <= AUTO_TARGET_UDP_MS\n                ) {\n                    settleWith(best, \"18s <=200ms\");\n                    return;\n                }\n\n                if (\n                    elapsed >= AUTO_STAGE2_AFTER_MS &&\n                    best.udpMs <= AUTO_STAGE2_UDP_MS\n                ) {\n                    settleWith(best, \"32s <=300ms\");\n                    return;\n                }\n\n                if (\n                    elapsed >= AUTO_STAGE3_AFTER_MS &&\n                    best.udpMs <= AUTO_STAGE3_UDP_MS\n                ) {\n                    settleWith(best, \"48s <=450ms\");\n                    return;\n                }\n\n                if (elapsed >= AUTO_FORCE_AFTER_MS) {\n                    settleWith(best, \"melhor disponível\");\n                }\n            },\n            250\n        );\n\n        const worker = async () => {\n            while (\n                !closed &&\n                cursor < candidates.length &&\n                Date.now() - started < AUTO_PROXY_BUDGET\n            ) {\n                const proxy = candidates[cursor++];\n\n                try {\n                    const result = await probeAutoUdpExit(\n                        proxy,\n                        excluded\n                    );\n\n                    updateAutoCatalogResult(proxy, result);\n\n                    if (closed) return;\n\n                    valid.push(result);\n                    saveAutoBestResults(valid);\n\n                    const best = chooseBestAutoProxy(valid);\n\n                    log(\n                        `AUTO válido: ${safeProxy(proxy)} ` +\n                        `hint=${proxy.countryHint || \"?\"} ` +\n                        `país=${result.country} UDP=${result.udpMs}ms`\n                    );\n\n                    writeStatus({\n                        state: \"auto-proxy-search\",\n                        autoProxyTested: tested,\n                        autoProxyValid: valid.length,\n                        autoProxyBestCountry: best?.country || null,\n                        autoProxyBestUdpMs: best?.udpMs ?? null,\n                        autoProxySearchElapsedMs: Date.now() - started\n                    });\n\n                    if (result.udpMs <= AUTO_INSTANT_UDP_MS) {\n                        settleWith(result, \"instant <=150ms\");\n                        return;\n                    }\n                } catch (e) {\n                    lastError = e;\n                    updateAutoCatalogResult(proxy, null, e);\n                } finally {\n                    tested++;\n\n                    if (\n                        !closed &&\n                        (tested === 1 || tested % 10 === 0)\n                    ) {\n                        const best = chooseBestAutoProxy(valid);\n                        const next = candidates[\n                            Math.min(cursor, candidates.length - 1)\n                        ];\n\n                        writeStatus({\n                            state: \"auto-proxy-search\",\n                            autoProxyTested: tested,\n                            autoProxyCandidates: candidates.length,\n                            autoProxyValid: valid.length,\n                            autoProxyBestCountry: best?.country || null,\n                            autoProxyBestUdpMs: best?.udpMs ?? null,\n                            autoProxySearchElapsedMs: Date.now() - started,\n                            autoProxyCurrentTier:\n                                next ? autoTierLabel(next) : \"fim da fila\",\n                            proxySelectionError:\n                                lastError?.message || null\n                        });\n                    }\n                }\n            }\n        };\n\n        const count = Math.min(\n            AUTO_PROXY_WORKERS,\n            candidates.length\n        );\n\n        const workers = Array.from(\n            {length: count},\n            worker\n        );\n\n        const workersDone = Promise.all(workers).then(() => {\n            if (closed) return selected;\n\n            const best = chooseBestAutoProxy(valid);\n\n            if (best) {\n                selected = best;\n                closed = true;\n                resolveQuality(best);\n                return best;\n            }\n\n            closed = true;\n            resolveQuality(null);\n            return null;\n        });\n\n        await Promise.race([\n            qualityPromise,\n            workersDone\n        ]);\n\n        if (qualityTimer) {\n            clearInterval(qualityTimer);\n            qualityTimer = null;\n        }\n\n        flushAutoCatalogNow();\n\n        const best = selected || chooseBestAutoProxy(valid);\n\n        if (!best) {\n            const reason =\n                `nenhuma SOCKS5 válida encontrada em ` +\n                `${Math.round((Date.now() - started) / 1000)}s ` +\n                `(${tested}/${candidates.length} testadas; catálogo=${catalog.size})`;\n\n            writeStatus({\n                state: \"auto-proxy-search-failed\",\n                networkMode: (readSettings().networkMode === \"direct-first\" ? \"direct-first\" : \"singbox-auto\"),\n                proxyMode: \"auto-socks5-near-first\",\n                autoProxyTested: tested,\n                autoProxyCandidates: candidates.length,\n                autoProxyValid: valid.length,\n                autoProxyUdpOk: false,\n                autoProxyProfile: \"NEAR-FIRST GLOBAL\",\n                autoProxySearchElapsedMs: Date.now() - started,\n                autoCatalogCount: catalog.size,\n                proxySelectionError: reason,\n                directFallback: false,\n                directReason: reason\n            });\n\n            throw new Error(reason);\n        }\n\n        saveAutoBestResults(valid);\n\n        const elapsed = Date.now() - started;\n\n        const profile =\n            best.udpMs <= AUTO_INSTANT_UDP_MS\n                ? \"NEAR-FIRST INSTANT <=150ms\"\n                : best.udpMs <= AUTO_TARGET_UDP_MS\n                    ? \"NEAR-FIRST <=200ms\"\n                    : best.udpMs <= AUTO_STAGE2_UDP_MS\n                        ? \"NEAR-FIRST <=300ms\"\n                        : best.udpMs <= AUTO_STAGE3_UDP_MS\n                            ? \"NEAR-FIRST <=450ms\"\n                            : \"NEAR-FIRST melhor disponível\";\n\n        writeStatus({\n            autoProxyTested: tested,\n            autoProxyCandidates: candidates.length,\n            autoProxyValid: valid.length,\n            autoProxyCountry: best.country,\n            autoProxyUdpMs: best.udpMs,\n            autoProxyGatewayMs: best.gatewayMs,\n            autoProxyProfile: profile,\n            autoProxySearchElapsedMs: elapsed,\n            autoProxyFromBestCache: false,\n            autoCatalogCount: catalog.size\n        });\n\n        log(\n            `AUTO NEAR-FIRST selecionada: ${safeProxy(best.proxy)} ` +\n            `país=${best.country} UDP=${best.udpMs}ms ` +\n            `gateway=${best.gatewayMs}ms ` +\n            `válidas=${valid.length}/${tested} catálogo=${catalog.size}`\n        );\n\n        return best;\n    } finally {\n        if (qualityTimer) {\n            clearInterval(qualityTimer);\n        }\n\n        flushAutoCatalogNow();\n        autoProxySelectionBusy = false;\n    }\n}\n\nasync function countryThrough(proxy) {\n    const raw = await socks5Tunnel(proxy, \"cloudflare.com\", 443);\n\n    return await new Promise((resolve, reject) => {\n        let settled = false;\n        let data = \"\";\n\n        const secure = tls.connect({\n            socket: raw,\n            servername: \"cloudflare.com\",\n            rejectUnauthorized: true\n        });\n\n        const fail = e => {\n            if (settled) return;\n            settled = true;\n            try { secure.destroy(); } catch {}\n            reject(e instanceof Error ? e : new Error(String(e)));\n        };\n\n        socketTimeout(secure, PROBE_TIMEOUT, fail);\n        secure.once(\"error\", fail);\n\n        secure.once(\"secureConnect\", () => {\n            secure.write(\n                \"GET /cdn-cgi/trace HTTP/1.1\\r\\n\" +\n                \"Host: cloudflare.com\\r\\n\" +\n                \"Connection: close\\r\\n\\r\\n\"\n            );\n        });\n\n        secure.on(\"data\", chunk => {\n            data += chunk.toString(\"utf8\");\n            if (data.length > 20000) fail(new Error(\"trace grande demais\"));\n        });\n\n        secure.on(\"end\", () => {\n            if (settled) return;\n            const m = /\\bloc=([A-Z]{2})\\b/.exec(data);\n            if (!m) return fail(new Error(\"país não identificado\"));\n            settled = true;\n            resolve(m[1]);\n        });\n    });\n}\n\nasync function probeExit(proxy, excluded) {\n    const started = Date.now();\n\n    const country = await countryThrough(proxy);\n    if (excluded.has(country)) {\n        throw new Error(`país excluído: ${country}`);\n    }\n\n    await tlsProbe(proxy, \"gateway.discord.gg\");\n\n    return {\n        proxy,\n        country,\n        ms: Date.now() - started\n    };\n}\n\nfunction downloadText(\n    url,\n    timeout = SOURCE_TIMEOUT,\n    redirects = 0\n) {\n    return new Promise(\n        (resolve, reject) => {\n            const req =\n                https.get(\n                    url,\n                    {\n                        headers: {\n                            \"User-Agent\":\n                                \"GoLiveBypassBD/2.0.9\",\n                            \"Accept\":\n                                \"text/plain, application/json, */*\"\n                        }\n                    },\n                    res => {\n                        if (\n                            res.statusCode >= 300 &&\n                            res.statusCode < 400 &&\n                            res.headers.location\n                        ) {\n                            res.resume();\n\n                            if (\n                                redirects >=\n                                4\n                            ) {\n                                reject(\n                                    new Error(\n                                        \"redirecionamentos demais\"\n                                    )\n                                );\n\n                                return;\n                            }\n\n                            let next;\n\n                            try {\n                                next =\n                                    new URL(\n                                        res.headers.location,\n                                        url\n                                    ).toString();\n                            } catch (e) {\n                                reject(\n                                    e\n                                );\n\n                                return;\n                            }\n\n                            downloadText(\n                                next,\n                                timeout,\n                                redirects + 1\n                            )\n                                .then(\n                                    resolve\n                                )\n                                .catch(\n                                    reject\n                                );\n\n                            return;\n                        }\n\n                        if (\n                            res.statusCode <\n                                200 ||\n                            res.statusCode >=\n                                300\n                        ) {\n                            res.resume();\n\n                            reject(\n                                new Error(\n                                    `HTTP ${res.statusCode}`\n                                )\n                            );\n\n                            return;\n                        }\n\n                        let body =\n                            \"\";\n\n                        res.setEncoding(\n                            \"utf8\"\n                        );\n\n                        res.on(\n                            \"data\",\n                            chunk => {\n                                body +=\n                                    chunk;\n\n                                if (\n                                    body.length >\n                                    40_000_000\n                                ) {\n                                    req.destroy(\n                                        new Error(\n                                            \"resposta grande demais\"\n                                        )\n                                    );\n                                }\n                            }\n                        );\n\n                        res.on(\n                            \"end\",\n                            () =>\n                                resolve(\n                                    body\n                                )\n                        );\n                    }\n                );\n\n            req.setTimeout(\n                timeout,\n                () =>\n                    req.destroy(\n                        new Error(\n                            \"timeout da fonte\"\n                        )\n                    )\n            );\n\n            req.on(\n                \"error\",\n                reject\n            );\n        }\n    );\n}\n\nfunction parseRemoteRouteJsonBody(\n    body\n) {\n    const parsed =\n        JSON.parse(\n            body\n        );\n\n    const list =\n        Array.isArray(\n            parsed\n        )\n            ? parsed\n            : (\n                Array.isArray(\n                    parsed?.routes\n                )\n                    ? parsed.routes\n                    : []\n            );\n\n    const out = [];\n\n    for (\n        const item of list\n    ) {\n        const raw =\n            typeof item === \"string\"\n                ? item\n                : (\n                    item?.proxy ||\n                    item?.raw ||\n                    \"\"\n                );\n\n        const proxy =\n            parseProxy(\n                String(\n                    raw ||\n                    \"\"\n                )\n            );\n\n        if (!proxy) {\n            continue;\n        }\n\n        const country =\n            String(\n                (\n                    typeof item === \"object\" &&\n                    item\n                        ? (\n                            item.country ||\n                            item.countryHint ||\n                            \"\"\n                        )\n                        : \"\"\n                )\n            )\n                .trim()\n                .toUpperCase();\n\n        proxy.countryHint =\n            /^[A-Z]{2}$/.test(\n                country\n            )\n                ? country\n                : null;\n\n        const latency =\n            Number(\n                typeof item === \"object\" &&\n                item\n                    ? (\n                        item.latencyMs ??\n                        item.sourceLatencyMs ??\n                        null\n                    )\n                    : null\n            );\n\n        proxy.sourceLatencyMs =\n            Number.isFinite(\n                latency\n            ) &&\n            latency >\n                0\n                ? latency\n                : null;\n\n        proxy.source =\n            \"central-routes.json\";\n\n        proxy.sourcePriority =\n            0;\n\n        out.push(\n            proxy\n        );\n    }\n\n    return out;\n}\n\nfunction parseRemoteRouteTxtBody(\n    body\n) {\n    const out = [];\n\n    for (\n        const lineRaw of\n        String(\n            body ||\n            \"\"\n        ).split(\n            /\\r?\\n/\n        )\n    ) {\n        const line =\n            lineRaw.trim();\n\n        if (\n            !line ||\n            line.startsWith(\n                \"#\"\n            )\n        ) {\n            continue;\n        }\n\n        // Aceita tanto:\n        // socks5://1.2.3.4:1080\n        // quanto socks5://1.2.3.4:1080|US|123\n        const parts =\n            line.split(\n                \"|\"\n            );\n\n        const proxy =\n            parseProxy(\n                parts[0]\n            );\n\n        if (!proxy) {\n            continue;\n        }\n\n        const country =\n            String(\n                parts[1] ||\n                \"\"\n            )\n                .trim()\n                .toUpperCase();\n\n        proxy.countryHint =\n            /^[A-Z]{2}$/.test(\n                country\n            )\n                ? country\n                : null;\n\n        const latency =\n            Number(\n                parts[2]\n            );\n\n        proxy.sourceLatencyMs =\n            Number.isFinite(\n                latency\n            ) &&\n            latency >\n                0\n                ? latency\n                : null;\n\n        proxy.source =\n            \"central-routes.txt\";\n\n        proxy.sourcePriority =\n            1;\n\n        out.push(\n            proxy\n        );\n    }\n\n    return out;\n}\n\nasync function loadCentralRouteDataset() {\n    // 1) JSON remoto: preferido porque possui country/latency metadata.\n    for (\n        const url of\n        REMOTE_ROUTE_JSON_URLS\n    ) {\n        try {\n            const body =\n                await downloadText(\n                    url,\n                    REMOTE_ROUTE_DATA_TIMEOUT\n                );\n\n            const routes =\n                parseRemoteRouteJsonBody(\n                    body\n                );\n\n            if (\n                routes.length <\n                10\n            ) {\n                throw new Error(\n                    `dataset JSON pequeno demais (${routes.length})`\n                );\n            }\n\n            try {\n                fs.writeFileSync(\n                    REMOTE_ROUTE_JSON_CACHE,\n                    body,\n                    \"utf8\"\n                );\n            } catch {}\n\n            writeStatus({\n                remoteRouteDatasetLoaded:\n                    true,\n                remoteRouteDatasetFormat:\n                    \"json\",\n                remoteRouteDatasetFromCache:\n                    false,\n                remoteRouteDatasetCount:\n                    routes.length,\n                remoteRouteDatasetUrl:\n                    url\n            });\n\n            log(\n                `CENTRAL ROUTES JSON: ${routes.length} rotas via ${url}`\n            );\n\n            return routes;\n        } catch (e) {\n            log(\n                `CENTRAL ROUTES JSON falhou ${url}: ${e?.message || e}`\n            );\n        }\n    }\n\n    // 2) TXT remoto: fallback mais leve.\n    for (\n        const url of\n        REMOTE_ROUTE_TXT_URLS\n    ) {\n        try {\n            const body =\n                await downloadText(\n                    url,\n                    REMOTE_ROUTE_DATA_TIMEOUT\n                );\n\n            const routes =\n                parseRemoteRouteTxtBody(\n                    body\n                );\n\n            if (\n                routes.length <\n                10\n            ) {\n                throw new Error(\n                    `dataset TXT pequeno demais (${routes.length})`\n                );\n            }\n\n            try {\n                fs.writeFileSync(\n                    REMOTE_ROUTE_TXT_CACHE,\n                    body,\n                    \"utf8\"\n                );\n            } catch {}\n\n            writeStatus({\n                remoteRouteDatasetLoaded:\n                    true,\n                remoteRouteDatasetFormat:\n                    \"txt\",\n                remoteRouteDatasetFromCache:\n                    false,\n                remoteRouteDatasetCount:\n                    routes.length,\n                remoteRouteDatasetUrl:\n                    url\n            });\n\n            log(\n                `CENTRAL ROUTES TXT: ${routes.length} rotas via ${url}`\n            );\n\n            return routes;\n        } catch (e) {\n            log(\n                `CENTRAL ROUTES TXT falhou ${url}: ${e?.message || e}`\n            );\n        }\n    }\n\n    // 3) Cache JSON local.\n    try {\n        const body =\n            fs.readFileSync(\n                REMOTE_ROUTE_JSON_CACHE,\n                \"utf8\"\n            );\n\n        const routes =\n            parseRemoteRouteJsonBody(\n                body\n            );\n\n        if (\n            routes.length >=\n            10\n        ) {\n            writeStatus({\n                remoteRouteDatasetLoaded:\n                    true,\n                remoteRouteDatasetFormat:\n                    \"json-cache\",\n                remoteRouteDatasetFromCache:\n                    true,\n                remoteRouteDatasetCount:\n                    routes.length,\n                remoteRouteDatasetUrl:\n                    \"cache-local\"\n            });\n\n            log(\n                `CENTRAL ROUTES: usando cache JSON com ${routes.length} rotas`\n            );\n\n            return routes;\n        }\n    } catch {}\n\n    // 4) Cache TXT local.\n    try {\n        const body =\n            fs.readFileSync(\n                REMOTE_ROUTE_TXT_CACHE,\n                \"utf8\"\n            );\n\n        const routes =\n            parseRemoteRouteTxtBody(\n                body\n            );\n\n        if (\n            routes.length >=\n            10\n        ) {\n            writeStatus({\n                remoteRouteDatasetLoaded:\n                    true,\n                remoteRouteDatasetFormat:\n                    \"txt-cache\",\n                remoteRouteDatasetFromCache:\n                    true,\n                remoteRouteDatasetCount:\n                    routes.length,\n                remoteRouteDatasetUrl:\n                    \"cache-local\"\n            });\n\n            log(\n                `CENTRAL ROUTES: usando cache TXT com ${routes.length} rotas`\n            );\n\n            return routes;\n        }\n    } catch {}\n\n    writeStatus({\n        remoteRouteDatasetLoaded:\n            false,\n        remoteRouteDatasetFormat:\n            null,\n        remoteRouteDatasetFromCache:\n            false,\n        remoteRouteDatasetCount:\n            0,\n        remoteRouteDatasetUrl:\n            null\n    });\n\n    return [];\n}\n\nasync function probeRouteFastUdp(\n    proxy\n) {\n    const started =\n        Date.now();\n\n    const udp =\n        await socks5UdpProbe(\n            proxy,\n            ROUTE_FAST_UDP_TIMEOUT_MS\n        );\n\n    const udpMs =\n        Number(\n            udp?.rttMs\n        );\n\n    if (\n        !Number.isFinite(\n            udpMs\n        ) ||\n        udpMs <=\n            0\n    ) {\n        throw new Error(\n            \"UDP RTT inválido\"\n        );\n    }\n\n    return {\n        proxy,\n        country:\n            proxy.countryHint ||\n            null,\n        udpMs,\n        gatewayMs:\n            null,\n        ms:\n            Date.now() -\n            started,\n        fastOnly:\n            true\n    };\n}\n\nfunction parseRemoteRoutesConfig(\n    body\n) {\n    const out = [];\n\n    for (\n        const rawLine of\n        String(\n            body ||\n            \"\"\n        ).split(\n            /\\r?\\n/\n        )\n    ) {\n        const line =\n            rawLine.trim();\n\n        if (\n            !line ||\n            line.startsWith(\n                \"#\"\n            )\n        ) {\n            continue;\n        }\n\n        const parts =\n            line.split(\n                \"|\"\n            );\n\n        if (\n            parts.length <\n            4\n        ) {\n            continue;\n        }\n\n        let type =\n            String(\n                parts.shift() ||\n                \"\"\n            )\n                .trim()\n                .toLowerCase();\n\n        const priority =\n            Math.max(\n                0,\n                Math.min(\n                    99,\n                    Number(\n                        parts.shift()\n                    ) || 0\n                )\n            );\n\n        const countryField =\n            String(\n                parts.shift() ||\n                \"*\"\n            )\n                .trim()\n                .toUpperCase();\n\n        const url =\n            parts\n                .join(\n                    \"|\"\n                )\n                .trim();\n\n        if (\n            !url ||\n            !/^https?:\\/\\//i.test(\n                url\n            )\n        ) {\n            continue;\n        }\n\n        if (\n            type ===\n            \"json\"\n        ) {\n            type =\n                \"structured-json\";\n        }\n\n        if (\n            type ===\n            \"country-template\"\n        ) {\n            const countries =\n                countryField\n                    .split(\n                        \",\"\n                    )\n                    .map(\n                        value =>\n                            value\n                                .trim()\n                                .toUpperCase()\n                    )\n                    .filter(\n                        value =>\n                            /^[A-Z]{2}$/.test(\n                                value\n                            )\n                    );\n\n            for (\n                const country of\n                countries\n            ) {\n                out.push({\n                    type:\n                        \"country-shard\",\n                    priority,\n                    country,\n                    url:\n                        url.replace(\n                            /\\{country\\}/gi,\n                            country.toLowerCase()\n                        ),\n                    remote:\n                        true\n                });\n            }\n\n            continue;\n        }\n\n        const countries =\n            countryField ===\n                \"*\" ||\n            !countryField\n                ? [\n                    null\n                ]\n                : countryField\n                    .split(\n                        \",\"\n                    )\n                    .map(\n                        value =>\n                            value\n                                .trim()\n                                .toUpperCase()\n                    )\n                    .filter(\n                        value =>\n                            /^[A-Z]{2}$/.test(\n                                value\n                            )\n                    );\n\n        for (\n            const country of\n            countries.length\n                ? countries\n                : [\n                    null\n                ]\n        ) {\n            out.push({\n                type,\n                priority,\n                country,\n                url,\n                remote:\n                    true\n            });\n        }\n    }\n\n    const unique =\n        new Map();\n\n    for (\n        const item of out\n    ) {\n        const key =\n            `${item.type}|${item.country || \"*\"}|${item.url}`;\n\n        const old =\n            unique.get(\n                key\n            );\n\n        if (\n            !old ||\n            item.priority <\n                old.priority\n        ) {\n            unique.set(\n                key,\n                item\n            );\n        }\n    }\n\n    return [\n        ...unique.values()\n    ].sort(\n        (a, b) =>\n            a.priority -\n            b.priority\n    );\n}\n\nasync function loadRemoteRouteDefinitions() {\n    let body =\n        null;\n    let sourceUrl =\n        null;\n    let fromCache =\n        false;\n\n    for (\n        const url of\n        REMOTE_ROUTES_URLS\n    ) {\n        try {\n            const downloaded =\n                await downloadText(\n                    url,\n                    REMOTE_ROUTES_TIMEOUT\n                );\n\n            if (\n                downloaded &&\n                downloaded.includes(\n                    \"|\"\n                )\n            ) {\n                body =\n                    downloaded;\n\n                sourceUrl =\n                    url;\n\n                try {\n                    fs.writeFileSync(\n                        REMOTE_ROUTES_CACHE,\n                        downloaded,\n                        \"utf8\"\n                    );\n                } catch {}\n\n                break;\n            }\n        } catch (e) {\n            log(\n                `routes.txt falhou ${url}: ${e?.message || e}`\n            );\n        }\n    }\n\n    if (!body) {\n        try {\n            body =\n                fs.readFileSync(\n                    REMOTE_ROUTES_CACHE,\n                    \"utf8\"\n                );\n\n            fromCache =\n                true;\n\n            sourceUrl =\n                \"cache-local\";\n        } catch {}\n    }\n\n    let remote =\n        body\n            ? parseRemoteRoutesConfig(\n                body\n            )\n            : [];\n\n    const merged =\n        new Map();\n\n    for (\n        const item of [\n            ...remote,\n            ...INTERNAL_PROXY_SOURCES\n        ]\n    ) {\n        if (\n            !item?.url\n        ) {\n            continue;\n        }\n\n        const key =\n            `${item.type}|${item.country || \"*\"}|${item.url}`;\n\n        const normalized = {\n            type:\n                item.type ||\n                \"plain\",\n            priority:\n                Number(\n                    item.priority\n                ) || 0,\n            country:\n                item.country ||\n                null,\n            url:\n                item.url,\n            remote:\n                item.remote ===\n                true\n        };\n\n        const old =\n            merged.get(\n                key\n            );\n\n        if (\n            !old ||\n            normalized.priority <\n                old.priority\n        ) {\n            merged.set(\n                key,\n                normalized\n            );\n        }\n    }\n\n    const definitions =\n        [\n            ...merged.values()\n        ].sort(\n            (a, b) =>\n                a.priority -\n                b.priority\n        );\n\n    writeStatus({\n        remoteRoutesLoaded:\n            remote.length >\n            0,\n        remoteRoutesFromCache:\n            fromCache,\n        remoteRoutesUrl:\n            sourceUrl,\n        remoteRouteDefinitions:\n            definitions.length,\n        remoteRouteOnlyDefinitions:\n            remote.length\n    });\n\n    log(\n        `routes.txt: remoto=${remote.length} total=${definitions.length} ` +\n        `cache=${fromCache} via=${sourceUrl || \"fallback-interno\"}`\n    );\n\n    return definitions;\n}\n\nasync function fetchRouteSourceDefinitions(\n    definitions\n) {\n    const ordered =\n        [\n            ...definitions\n        ].sort(\n            (a, b) =>\n                a.priority -\n                b.priority\n        );\n\n    let cursor =\n        0;\n    let loaded =\n        0;\n    let failed =\n        0;\n\n    const chunks =\n        new Array(\n            ordered.length\n        );\n\n    const worker =\n        async () => {\n            while (\n                cursor <\n                ordered.length\n            ) {\n                const index =\n                    cursor++;\n\n                const src =\n                    ordered[\n                        index\n                    ];\n\n                try {\n                    const body =\n                        await downloadText(\n                            src.url\n                        );\n\n                    const parsed =\n                        parseSource(\n                            src.type,\n                            body,\n                            src.url,\n                            src.country\n                        );\n\n                    for (\n                        const proxy of\n                        parsed\n                    ) {\n                        proxy.sourcePriority =\n                            src.priority;\n\n                        if (\n                            !proxy.countryHint &&\n                            src.country\n                        ) {\n                            proxy.countryHint =\n                                src.country;\n                        }\n                    }\n\n                    chunks[\n                        index\n                    ] =\n                        parsed;\n\n                    loaded++;\n\n                    log(\n                        `fonte P${src.priority} ${src.type} ok ` +\n                        `(${parsed.length} proxies / ${body.length} bytes) ${src.url}`\n                    );\n                } catch (e) {\n                    chunks[\n                        index\n                    ] =\n                        [];\n\n                    failed++;\n\n                    log(\n                        `fonte P${src.priority} ${src.type} falhou: ` +\n                        `${e?.message || e} ${src.url}`\n                    );\n                }\n\n                if (\n                    (\n                        loaded +\n                        failed\n                    ) %\n                    10 ===\n                    0\n                ) {\n                    writeStatus({\n                        autoSourceCount:\n                            loaded,\n                        autoSourceFailed:\n                            failed,\n                        autoSourceProcessed:\n                            loaded +\n                            failed,\n                        autoSourceDefinitions:\n                            ordered.length\n                    });\n                }\n            }\n        };\n\n    await Promise.all(\n        Array.from(\n            {\n                length:\n                    Math.min(\n                        ROUTE_SOURCE_DOWNLOAD_WORKERS,\n                        ordered.length\n                    )\n            },\n            worker\n        )\n    );\n\n    writeStatus({\n        autoSourceCount:\n            loaded,\n        autoSourceFailed:\n            failed,\n        autoSourceProcessed:\n            loaded +\n            failed,\n        autoSourceDefinitions:\n            ordered.length\n    });\n\n    return {\n        chunks,\n        loaded,\n        failed,\n        total:\n            ordered.length\n    };\n}\n\nfunction parseSource(\n    type,\n    body,\n    sourceName = type,\n    forcedCountry = null\n) {\n    const out = [];\n\n    const decorate = (proxy, meta = {}) => {\n        if (!proxy) return null;\n\n        const country = String(\n            meta.countryHint ||\n            forcedCountry ||\n            \"\"\n        )\n            .trim()\n            .toUpperCase();\n\n        proxy.countryHint = /^[A-Z]{2}$/.test(country)\n            ? country\n            : null;\n\n        proxy.source = sourceName || type;\n        proxy.sourceLatencyMs = Number(meta.sourceLatencyMs) || null;\n\n        return proxy;\n    };\n\n    if (type === \"rooster\") {\n        for (const line of body.split(/\\r?\\n/)) {\n            // Formato: FLAG IP:PORT 181ms US [ISP]\n            const match = line.match(\n                /(\\d{1,3}(?:\\.\\d{1,3}){3}:\\d+)\\s+(\\d+)ms\\s+([A-Z]{2})\\b/i\n            );\n\n            if (!match) continue;\n\n            const p = decorate(\n                parseProxy(`socks5://${match[1]}`),\n                {\n                    countryHint: match[3],\n                    sourceLatencyMs: Number(match[2])\n                }\n            );\n\n            if (p) out.push(p);\n        }\n\n        return out;\n    }\n\n    if (type === \"plain\" || type === \"country-shard\") {\n        for (const line of body.split(/\\r?\\n/)) {\n            const raw = line.trim();\n            if (!raw || raw.startsWith(\"#\")) continue;\n\n            const p = decorate(\n                parseProxy(\n                    raw.includes(\"://\")\n                        ? raw\n                        : `socks5://${raw}`\n                )\n            );\n\n            if (p) out.push(p);\n        }\n\n        return out;\n    }\n\n    const data = JSON.parse(body);\n\n    const entries = Array.isArray(data)\n        ? data\n        : Array.isArray(data?.proxies)\n            ? data.proxies\n            : Array.isArray(data?.data)\n                ? data.data\n                : [];\n\n    for (const item of entries) {\n        if (\n            typeof item === \"object\" &&\n            item &&\n            item.protocol &&\n            String(item.protocol).toLowerCase() !== \"socks5\"\n        ) {\n            continue;\n        }\n\n        const raw = typeof item === \"string\"\n            ? item\n            : (\n                item?.proxy ||\n                (\n                    item?.ip && item?.port\n                        ? `socks5://${item.ip}:${item.port}`\n                        : \"\"\n                )\n            );\n\n        const p = parseProxy(String(raw || \"\"));\n        if (!p) continue;\n\n        const countryHint =\n            item?.geolocation?.country ||\n            item?.ip_data?.countryCode ||\n            item?.ip_data?.country_code ||\n            item?.country_code ||\n            item?.countryCode ||\n            (\n                typeof item?.country === \"string\" &&\n                item.country.length === 2\n                    ? item.country\n                    : null\n            );\n\n        const sourceLatencyMs =\n            item?.latency_ms ??\n            item?.average_timeout ??\n            item?.timeout ??\n            item?.latency ??\n            item?.response_time ??\n            null;\n\n        decorate(\n            p,\n            {\n                countryHint,\n                sourceLatencyMs\n            }\n        );\n\n        out.push(p);\n    }\n\n    return out;\n}\n\nfunction autoCountryTier(country) {\n    const code = String(country || \"\").trim().toUpperCase();\n\n    if (!code) return 50;\n\n    return AUTO_COUNTRY_RANK.has(code)\n        ? AUTO_COUNTRY_RANK.get(code)\n        : 40;\n}\n\nfunction autoProxyKey(proxy) {\n    return proxy ? `${proxy.host}:${proxy.port}` : \"\";\n}\n\nfunction loadAutoCatalog() {\n    if (autoCatalogMap) return autoCatalogMap;\n\n    autoCatalogMap = new Map();\n\n    try {\n        const parsed = JSON.parse(\n            fs.readFileSync(AUTO_PROXY_CATALOG, \"utf8\")\n        );\n\n        const entries = Array.isArray(parsed?.entries)\n            ? parsed.entries\n            : [];\n\n        for (const item of entries) {\n            const proxy = parseProxy(item?.raw || \"\");\n            if (!proxy) continue;\n\n            autoCatalogMap.set(\n                autoProxyKey(proxy),\n                {\n                    raw: proxy.raw,\n                    countryHint: item?.countryHint || item?.country || null,\n                    country: item?.country || null,\n                    source: item?.source || null,\n                    sourceLatencyMs: Number(item?.sourceLatencyMs) || null,\n                    sourcePriority:\n                        Number.isFinite(Number(item?.sourcePriority))\n                            ? Number(item.sourcePriority)\n                            : null,\n                    firstSeenAt: Number(item?.firstSeenAt) || Date.now(),\n                    lastSeenAt: Number(item?.lastSeenAt) || 0,\n                    lastTestedAt: Number(item?.lastTestedAt) || 0,\n                    testCount: Number(item?.testCount) || 0,\n                    valid: item?.valid === true,\n                    udpOk: item?.udpOk === true,\n                    udpMs: Number(item?.udpMs) || null,\n                    gatewayMs: Number(item?.gatewayMs) || null,\n                    totalMs: Number(item?.totalMs) || null,\n                    failureCount: Number(item?.failureCount) || 0,\n                    lastError: item?.lastError || null\n                }\n            );\n        }\n    } catch {}\n\n    // Migra o cache antigo automaticamente.\n    try {\n        const parsed = JSON.parse(\n            fs.readFileSync(PROXY_CACHE, \"utf8\")\n        );\n\n        const exits = Array.isArray(parsed?.exits)\n            ? parsed.exits\n            : [];\n\n        for (const item of exits) {\n            const proxy = parseProxy(item?.raw || \"\");\n            if (!proxy) continue;\n\n            const key = autoProxyKey(proxy);\n\n            if (!autoCatalogMap.has(key)) {\n                autoCatalogMap.set(\n                    key,\n                    {\n                        raw: proxy.raw,\n                        countryHint: item?.country || null,\n                        country: item?.country || null,\n                        source: \"legacy-cache\",\n                        sourceLatencyMs: null,\n                        firstSeenAt: Number(item?.savedAt) || Date.now(),\n                        lastSeenAt: Number(item?.savedAt) || Date.now(),\n                        lastTestedAt: 0,\n                        testCount: 0,\n                        valid: false,\n                        udpOk: false,\n                        udpMs: null,\n                        gatewayMs: null,\n                        totalMs: Number(item?.ms) || null,\n                        failureCount: 0,\n                        lastError: null\n                    }\n                );\n            }\n        }\n    } catch {}\n\n    return autoCatalogMap;\n}\n\nfunction flushAutoCatalogNow() {\n    if (!autoCatalogMap) return;\n\n    const entries = [...autoCatalogMap.values()]\n        .sort((a, b) => {\n            const tier =\n                autoCountryTier(a.country || a.countryHint) -\n                autoCountryTier(b.country || b.countryHint);\n\n            if (tier) return tier;\n\n            const valid = Number(b.valid) - Number(a.valid);\n            if (valid) return valid;\n\n            const udp =\n                (Number(a.udpMs) || 999999) -\n                (Number(b.udpMs) || 999999);\n\n            if (udp) return udp;\n\n            return Number(b.lastSeenAt) - Number(a.lastSeenAt);\n        });\n\n    try {\n        fs.writeFileSync(\n            AUTO_PROXY_CATALOG,\n            JSON.stringify(\n                {\n                    version: \"2.0.9\",\n                    updatedAt: new Date().toISOString(),\n                    entries\n                },\n                null,\n                2\n            ),\n            \"utf8\"\n        );\n\n        writeStatus({\n            autoCatalogCount: entries.length,\n            autoCatalogKnownCountry:\n                entries.filter(item => item.country || item.countryHint).length\n        });\n    } catch {}\n}\n\nfunction scheduleAutoCatalogFlush() {\n    if (autoCatalogFlushTimer) return;\n\n    autoCatalogFlushTimer = setTimeout(\n        () => {\n            autoCatalogFlushTimer = null;\n            flushAutoCatalogNow();\n        },\n        AUTO_CATALOG_FLUSH_MS\n    );\n}\n\nfunction mergeAutoCatalogCandidates(proxies) {\n    const catalog = loadAutoCatalog();\n    const now = Date.now();\n\n    for (const proxy of proxies) {\n        if (!proxy) continue;\n\n        const key = autoProxyKey(proxy);\n        const old = catalog.get(key);\n\n        if (old) {\n            old.lastSeenAt = now;\n\n            if (proxy.countryHint) old.countryHint = proxy.countryHint;\n            if (proxy.source) old.source = proxy.source;\n            if (proxy.sourceLatencyMs) {\n                old.sourceLatencyMs = proxy.sourceLatencyMs;\n            }\n\n            if (\n                Number.isFinite(\n                    Number(\n                        proxy.sourcePriority\n                    )\n                ) &&\n                (\n                    !Number.isFinite(\n                        Number(\n                            old.sourcePriority\n                        )\n                    ) ||\n                    Number(\n                        proxy.sourcePriority\n                    ) <\n                    Number(\n                        old.sourcePriority\n                    )\n                )\n            ) {\n                old.sourcePriority =\n                    Number(\n                        proxy.sourcePriority\n                    );\n            }\n        } else {\n            catalog.set(\n                key,\n                {\n                    raw: proxy.raw || `socks5://${proxy.host}:${proxy.port}`,\n                    countryHint: proxy.countryHint || null,\n                    country: null,\n                    source: proxy.source || null,\n                    sourceLatencyMs: proxy.sourceLatencyMs || null,\n                    sourcePriority:\n                        Number.isFinite(Number(proxy.sourcePriority))\n                            ? Number(proxy.sourcePriority)\n                            : null,\n                    firstSeenAt: now,\n                    lastSeenAt: now,\n                    lastTestedAt: 0,\n                    testCount: 0,\n                    valid: false,\n                    udpOk: false,\n                    udpMs: null,\n                    gatewayMs: null,\n                    totalMs: null,\n                    failureCount: 0,\n                    lastError: null\n                }\n            );\n        }\n    }\n\n    scheduleAutoCatalogFlush();\n    return catalog;\n}\n\nfunction updateAutoCatalogResult(proxy, result, error = null) {\n    if (!proxy) return;\n\n    const catalog = loadAutoCatalog();\n    const key = autoProxyKey(proxy);\n\n    let item = catalog.get(key);\n\n    if (!item) {\n        item = {\n            raw: proxy.raw || `socks5://${proxy.host}:${proxy.port}`,\n            countryHint: proxy.countryHint || null,\n            country: null,\n            source: proxy.source || null,\n            sourceLatencyMs: proxy.sourceLatencyMs || null,\n            firstSeenAt: Date.now(),\n            lastSeenAt: Date.now(),\n            lastTestedAt: 0,\n            testCount: 0,\n            valid: false,\n            udpOk: false,\n            udpMs: null,\n            gatewayMs: null,\n            totalMs: null,\n            failureCount: 0,\n            lastError: null\n        };\n\n        catalog.set(key, item);\n    }\n\n    item.lastTestedAt = Date.now();\n    item.testCount = (Number(item.testCount) || 0) + 1;\n\n    if (result) {\n        item.valid = true;\n        item.udpOk = true;\n        item.country = result.country || item.country || null;\n        item.countryHint = result.country || item.countryHint || null;\n        item.udpMs = Number(result.udpMs) || null;\n        item.gatewayMs = Number(result.gatewayMs) || null;\n        item.totalMs = Number(result.ms) || null;\n        item.lastError = null;\n        item.failureCount = 0;\n    } else {\n        item.valid = false;\n        item.lastError = String(error?.message || error || \"falha\");\n        item.failureCount = (Number(item.failureCount) || 0) + 1;\n    }\n\n    scheduleAutoCatalogFlush();\n}\n\nfunction catalogEntryToProxy(item) {\n    const proxy = parseProxy(item?.raw || \"\");\n    if (!proxy) return null;\n\n    proxy.countryHint = item?.country || item?.countryHint || null;\n    proxy.source = item?.source || \"catalog\";\n    proxy.sourceLatencyMs = Number(item?.sourceLatencyMs) || null;\n    proxy.sourcePriority =\n        Number.isFinite(\n            Number(\n                item?.sourcePriority\n            )\n        )\n            ? Number(\n                item.sourcePriority\n            )\n            : null;\n    proxy.catalogValid = item?.valid === true;\n    proxy.catalogUdpMs = Number(item?.udpMs) || null;\n    proxy.catalogGatewayMs = Number(item?.gatewayMs) || null;\n    proxy.catalogLastTestedAt = Number(item?.lastTestedAt) || 0;\n    proxy.catalogFailureCount = Number(item?.failureCount) || 0;\n    proxy.catalogLastSeenAt = Number(item?.lastSeenAt) || 0;\n\n    return proxy;\n}\n\nfunction sortAutoCandidatesNearBrazil(\n    proxies,\n    excluded\n) {\n    const now = Date.now();\n\n    const stateBucket = proxy => {\n        // Melhor já validada fica na frente (best-proxies é testado antes,\n        // mas o catálogo também pode conter boas rotas).\n        if (proxy.catalogValid) {\n            return 0;\n        }\n\n        const testedAt =\n            Number(\n                proxy.catalogLastTestedAt\n            ) || 0;\n\n        const failures =\n            Number(\n                proxy.catalogFailureCount\n            ) || 0;\n\n        // Nunca testada: prioridade total sobre as que acabaram de falhar.\n        if (!testedAt) {\n            return 1;\n        }\n\n        const age =\n            now -\n            testedAt;\n\n        // Falhou, mas já faz bastante tempo: pode tentar novamente.\n        if (\n            failures > 0 &&\n            age >=\n                AUTO_RETRY_OLD_FAIL_MS\n        ) {\n            return 2;\n        }\n\n        // Resultado antigo sem falha clara.\n        if (\n            failures === 0 &&\n            age >=\n                AUTO_RECENT_FAIL_DEFER_MS\n        ) {\n            return 2;\n        }\n\n        // Recém-falhada: vai para o final. Isso faz cada reinício\n        // continuar de onde o scan anterior parou.\n        return 3;\n    };\n\n    return [...proxies]\n        .filter(proxy => {\n            const country =\n                String(\n                    proxy?.countryHint ||\n                    \"\"\n                ).toUpperCase();\n\n            return !(\n                country &&\n                excluded.has(country)\n            );\n        })\n        .sort((a, b) => {\n            const bucket =\n                stateBucket(a) -\n                stateBucket(b);\n\n            if (bucket) {\n                return bucket;\n            }\n\n            const tier =\n                autoCountryTier(a.countryHint) -\n                autoCountryTier(b.countryHint);\n\n            if (tier) {\n                return tier;\n            }\n\n            const sourcePriority =\n                (\n                    Number(\n                        a.sourcePriority\n                    ) ||\n                    99\n                ) -\n                (\n                    Number(\n                        b.sourcePriority\n                    ) ||\n                    99\n                );\n\n            if (\n                sourcePriority\n            ) {\n                return sourcePriority;\n            }\n\n            const udp =\n                (\n                    Number(\n                        a.catalogUdpMs\n                    ) ||\n                    999999\n                ) -\n                (\n                    Number(\n                        b.catalogUdpMs\n                    ) ||\n                    999999\n                );\n\n            if (udp) {\n                return udp;\n            }\n\n            const sourceLatency =\n                (\n                    Number(\n                        a.sourceLatencyMs\n                    ) ||\n                    999999\n                ) -\n                (\n                    Number(\n                        b.sourceLatencyMs\n                    ) ||\n                    999999\n                );\n\n            if (sourceLatency) {\n                return sourceLatency;\n            }\n\n            return (\n                Number(\n                    b.catalogLastSeenAt\n                ) -\n                Number(\n                    a.catalogLastSeenAt\n                )\n            );\n        });\n}\n\nfunction autoTierLabel(proxy) {\n    const country = String(proxy?.countryHint || \"\").toUpperCase();\n\n    return country\n        ? `${country} • grupo ${autoCountryTier(country)}`\n        : \"país desconhecido\";\n}\n\nfunction shuffled(list) {\n    const out = [...list];\n\n    for (let i = out.length - 1; i > 0; i--) {\n        const j = Math.floor(Math.random() * (i + 1));\n        [out[i], out[j]] = [out[j], out[i]];\n    }\n\n    return out;\n}\n\nasync function proxyCandidates(\n    settings,\n    limit = MAX_CANDIDATES\n) {\n    const manualRaw =\n        String(\n            settings.manualProxy ||\n            \"\"\n        ).trim();\n\n    if (manualRaw) {\n        const manual =\n            parseProxy(\n                manualRaw\n            );\n\n        if (!manual) {\n            throw new Error(\n                \"proxy manual inválida\"\n            );\n        }\n\n        return [\n            manual\n        ];\n    }\n\n    let all =\n        await loadCentralRouteDataset();\n\n    // Emergência: se GitHub/jsDelivr/cache falharem completamente,\n    // ainda consegue tentar as poucas fontes internas.\n    if (\n        !all.length\n    ) {\n        log(\n            \"CENTRAL ROUTES indisponível; usando fontes internas de emergência\"\n        );\n\n        const fetched =\n            await fetchRouteSourceDefinitions(\n                INTERNAL_PROXY_SOURCES\n            );\n\n        const uniqueFallback =\n            new Map();\n\n        for (\n            const list of\n            fetched.chunks\n        ) {\n            for (\n                const proxy of\n                list ||\n                []\n            ) {\n                uniqueFallback.set(\n                    autoProxyKey(\n                        proxy\n                    ),\n                    proxy\n                );\n            }\n        }\n\n        all =\n            [\n                ...uniqueFallback.values()\n            ];\n\n        writeStatus({\n            remoteRouteDatasetFormat:\n                \"internal-fallback\",\n            remoteRouteDatasetCount:\n                all.length\n        });\n    }\n\n    const unique =\n        new Map();\n\n    for (\n        const proxy of all\n    ) {\n        const key =\n            autoProxyKey(\n                proxy\n            );\n\n        const old =\n            unique.get(\n                key\n            );\n\n        if (!old) {\n            unique.set(\n                key,\n                proxy\n            );\n\n            continue;\n        }\n\n        if (\n            !old.countryHint &&\n            proxy.countryHint\n        ) {\n            old.countryHint =\n                proxy.countryHint;\n        }\n\n        if (\n            proxy.sourceLatencyMs &&\n            (\n                !old.sourceLatencyMs ||\n                proxy.sourceLatencyMs <\n                    old.sourceLatencyMs\n            )\n        ) {\n            old.sourceLatencyMs =\n                proxy.sourceLatencyMs;\n        }\n    }\n\n    const deduped =\n        [\n            ...unique.values()\n        ];\n\n    mergeAutoCatalogCandidates(\n        deduped\n    );\n\n    const picked =\n        limit &&\n        limit >\n            0\n            ? shuffled(\n                deduped\n            ).slice(\n                0,\n                limit\n            )\n            : deduped;\n\n    writeStatus({\n        proxyCandidatesTotal:\n            deduped.length,\n        proxyCandidatesTesting:\n            picked.length,\n        remoteRouteDatasetCount:\n            deduped.length\n    });\n\n    log(\n        `proxyCandidates CENTRAL: ${deduped.length} rotas únicas`\n    );\n\n    return picked;\n}\n\nfunction readProxyCache(settings) {\n    try {\n        const parsed = JSON.parse(fs.readFileSync(PROXY_CACHE, \"utf8\"));\n        const list = Array.isArray(parsed?.exits) ? parsed.exits : [];\n        const excluded = excludedSet(settings);\n\n        return list\n            .map(item => {\n                const proxy = parseProxy(item?.raw || \"\");\n                if (!proxy) return null;\n\n                const country = String(item?.country || \"\").toUpperCase();\n                if (country && excluded.has(country)) return null;\n\n                return {\n                    proxy,\n                    country: country || null,\n                    ms: Number(item?.ms) || null,\n                    savedAt: Number(item?.savedAt) || 0\n                };\n            })\n            .filter(Boolean)\n            .slice(0, 6);\n    } catch {\n        return [];\n    }\n}\n\nfunction rememberExit(result) {\n    if (!result?.proxy) return;\n\n    let previous = [];\n\n    try {\n        const parsed = JSON.parse(fs.readFileSync(PROXY_CACHE, \"utf8\"));\n        if (Array.isArray(parsed?.exits)) previous = parsed.exits;\n    } catch {}\n\n    const raw = result.proxy.raw ||\n        `socks5://${result.proxy.host}:${result.proxy.port}`;\n\n    const entry = {\n        raw,\n        country: result.country || null,\n        ms: result.ms ?? null,\n        savedAt: Date.now()\n    };\n\n    const next = [\n        entry,\n        ...previous.filter(item => item?.raw !== raw)\n    ].slice(0, 8);\n\n    try {\n        fs.writeFileSync(\n            PROXY_CACHE,\n            JSON.stringify({exits: next}, null, 2),\n            \"utf8\"\n        );\n    } catch {}\n}\n\nfunction registerGatewayPair(client, remote, viaProxy, host) {\n    const pair = {\n        id: ++gatewayRouteSeq,\n        client,\n        remote,\n        viaProxy: !!viaProxy,\n        host,\n        openedAt: Date.now()\n    };\n\n    activeGatewayPairs.add(pair);\n\n    const cleanup = () => {\n        activeGatewayPairs.delete(pair);\n    };\n\n    try { client.once(\"close\", cleanup); } catch {}\n    try { remote.once(\"close\", cleanup); } catch {}\n\n    return pair;\n}\n\nfunction closeDirectGatewayPairs(reason) {\n    let closed = 0;\n\n    for (const pair of [...activeGatewayPairs]) {\n        if (pair.viaProxy) continue;\n\n        closed++;\n\n        log(\n            `fechando Gateway DIRECT #${pair.id} ${pair.host || \"?\"}: ${reason}`\n        );\n\n        try { pair.client.destroy(); } catch {}\n        try { pair.remote.destroy(); } catch {}\n\n        activeGatewayPairs.delete(pair);\n    }\n\n    return closed;\n}\n\nasync function warmCachedPool(settings, excluded) {\n    const cached = readProxyCache(settings);\n\n    if (!cached.length) {\n        writeStatus({proxyCacheCandidates: 0});\n        return;\n    }\n\n    writeStatus({\n        proxyCacheCandidates: cached.length,\n        proxyCacheState: \"testing\"\n    });\n\n    await Promise.allSettled(\n        cached.map(async item => {\n            try {\n                const result = await probeExit(item.proxy, excluded);\n\n                rememberExit(result);\n\n                if (!current) {\n                    current = result;\n                    pool = [result];\n\n                    writeStatus({\n                        state: \"exit-ready-cache\",\n                        country: result.country,\n                        proxy: safeProxy(result.proxy),\n                        ms: result.ms,\n                        proxyCacheState: \"ready\"\n                    });\n\n                    void reconnectGatewayAfterLateExit();\n                }\n            } catch {}\n        })\n    );\n\n    if (!current) {\n        writeStatus({proxyCacheState: \"miss\"});\n    }\n}\n\nfunction readStatusFile() {\n    try {\n        const parsed = JSON.parse(fs.readFileSync(STATUS, \"utf8\"));\n        return parsed && typeof parsed === \"object\" ? parsed : {};\n    } catch {\n        return {};\n    }\n}\n\nasync function reconnectGatewayAfterLateExit() {\n    const status = readStatusFile();\n\n    if (!status.pacActive) return false;\n    if (!status.directFallback && status.gatewayViaProxy !== false) return false;\n    if (!current) return false;\n\n    // Avoid reload/reconnect loops when several proxy probes finish together.\n    if (Date.now() - lastRecoveryReconnectAt < 15000) return false;\n    lastRecoveryReconnectAt = Date.now();\n\n    try {\n        const transitionId = `direct-to-proxy-${Date.now()}`;\n\n        writeStatus({\n            state: \"late-exit-reconnecting\",\n            directFallback: false,\n            gatewayViaProxy: null,\n            directReason: null,\n            recoveryProxy: safeProxy(current.proxy),\n            recoveryCountry: current.country,\n            gatewayTransitionId: transitionId,\n            gatewayTransitionAt: new Date().toISOString()\n        });\n\n        const closedDirect = closeDirectGatewayPairs(\n            \"proxy validada; migrando sessão\"\n        );\n\n        // Also ask Chromium to drop cached network connections. The explicit\n        // pair cleanup above is important because the DIRECT upstream socket\n        // belongs to our Node router, not Electron's proxy stack.\n        await session.defaultSession.closeAllConnections();\n\n        log(\n            `saída pronta (${current.country}); DIRECT fechados=${closedDirect}; ` +\n            `aguardando novo Gateway por ${safeProxy(current.proxy)}`\n        );\n\n        writeStatus({\n            state: \"awaiting-proxied-gateway\",\n            gatewayTransitionId: transitionId,\n            directPairsClosed: closedDirect\n        });\n\n        return true;\n    } catch (e) {\n        log(`reconexão após saída tardia falhou: ${e.message}`);\n        return false;\n    }\n}\n\nasync function selectPool(force = false) {\n    // Never run two large proxy scans at the same time. \"force\" means retry\n    // when idle, not duplicate an in-flight selection.\n    if (selecting) return selecting;\n\n    selecting = (async () => {\n        selectionAttempt++;\n\n        const settings = readSettings();\n        const excluded = excludedSet(settings);\n        const manualRaw = String(settings.manualProxy || \"\").trim();\n\n        // v1.8.0: an explicitly configured private/3proxy exit is authoritative.\n        // Use it immediately and never race it against cached/public proxies.\n        if (manualRaw) {\n            const manual = parseProxy(manualRaw);\n\n            if (!manual) {\n                throw new Error(\"proxy manual inválida\");\n            }\n\n            current = {\n                proxy: manual,\n                country: null,\n                ms: null,\n                manual: true\n            };\n\n            pool = [current];\n            manualHeartbeatFailures = 0;\n\n            writeStatus({\n                state: \"exit-ready-manual\",\n                proxyMode: \"manual-sticky\",\n                proxyAttempt: selectionAttempt,\n                proxyCandidatesTotal: 1,\n                proxyCandidatesTesting: 0,\n                proxyCacheCandidates: 0,\n                proxyCacheState: \"bypassed-manual\",\n                proxySelectionError: null,\n                proxy: safeProxy(manual),\n                country: null,\n                ms: null,\n                manualHeartbeatFailures: 0\n            });\n\n            log(\n                \"proxy manual/3proxy configurada: usando imediatamente; \" +\n                \"cache, listas públicas e troca por RTT desativados\"\n            );\n\n            // Geolocation/health checking becomes telemetry only. A slow probe\n            // must not delay or replace an explicitly configured private exit.\n            void probeExit(manual, excluded)\n                .then(result => {\n                    if (\n                        current?.proxy?.host === manual.host &&\n                        current?.proxy?.port === manual.port\n                    ) {\n                        current.country = result.country;\n                        current.ms = result.ms;\n                        current.manual = true;\n                        pool = [current];\n\n                        writeStatus({\n                            state: \"exit-ready-manual\",\n                            proxyMode: \"manual-sticky\",\n                            country: result.country,\n                            proxy: safeProxy(manual),\n                            ms: result.ms,\n                            manualProbe: \"ok\",\n                            manualProbeError: null\n                        });\n\n                        log(\n                            `proxy manual validada em segundo plano: ` +\n                            `${safeProxy(manual)} país=${result.country} ${result.ms}ms`\n                        );\n                    }\n                })\n                .catch(error => {\n                    writeStatus({\n                        proxyMode: \"manual-sticky\",\n                        manualProbe: \"warning\",\n                        manualProbeError: error.message\n                    });\n\n                    log(\n                        \"proxy manual: probe de telemetria falhou, \" +\n                        \"mas a saída fixa foi mantida: \" + error.message\n                    );\n                });\n\n            return pool;\n        }\n\n        writeStatus({\n            state: \"selecting-exit\",\n            proxyMode: \"auto\",\n            proxyAttempt: selectionAttempt,\n            proxySelectionError: null\n        });\n\n        // Automatic mode keeps the old cache/public-pool behavior.\n        void warmCachedPool(settings, excluded);\n\n        const candidates = await proxyCandidates(settings);\n        if (!candidates.length) throw new Error(\"nenhuma proxy candidata\");\n\n        const start = Date.now();\n        const winners = [];\n        let cursor = 0;\n        const workerCount = Math.min(28, candidates.length);\n\n        const workers = Array.from({length: workerCount}, async () => {\n            while (\n                Date.now() - start < SELECTION_BUDGET &&\n                winners.length < POOL_SIZE\n            ) {\n                const i = cursor++;\n                if (i >= candidates.length) return;\n\n                const proxy = candidates[i];\n\n                try {\n                    const result = await probeExit(proxy, excluded);\n                    winners.push(result);\n                    rememberExit(result);\n\n                    log(`proxy aprovada ${safeProxy(proxy)} país=${result.country} ${result.ms}ms`);\n\n                    if (!current) {\n                        current = result;\n                        pool = [result];\n\n                        writeStatus({\n                            state: \"exit-ready-early\",\n                            proxyMode: \"auto\",\n                            country: result.country,\n                            proxy: safeProxy(result.proxy),\n                            ms: result.ms,\n                            proxyAttempt: selectionAttempt\n                        });\n\n                        void reconnectGatewayAfterLateExit();\n                    }\n                } catch (error) {\n                    log(`proxy rejeitada ${safeProxy(proxy)}: ${error.message}`);\n                }\n            }\n        });\n\n        await Promise.allSettled(workers);\n\n        if (!winners.length) {\n            const message = \"nenhuma saída não-BR respondeu ao Gateway\";\n\n            writeStatus({\n                state: \"proxy-search-failed\",\n                proxyMode: \"auto\",\n                proxyAttempt: selectionAttempt,\n                proxySelectionError: message\n            });\n\n            throw new Error(message);\n        }\n\n        winners.sort((a, b) => a.ms - b.ms);\n\n        pool = winners.slice(0, POOL_SIZE);\n\n        if (!current || !winners.includes(current)) {\n            current = pool[0];\n        }\n\n        writeStatus({\n            state: \"exit-ready\",\n            proxyMode: \"auto\",\n            country: current.country,\n            proxy: safeProxy(current.proxy),\n            ms: current.ms,\n            proxyAttempt: selectionAttempt,\n            proxySelectionError: null\n        });\n\n        void reconnectGatewayAfterLateExit();\n\n        return pool;\n    })().finally(() => {\n        selecting = null;\n    });\n\n    return selecting;\n}\n\nfunction waitForExit(timeout = HOLD_GATEWAY_MS) {\n    if (current) return Promise.resolve(current);\n\n    return new Promise(resolve => {\n        const start = Date.now();\n\n        const tick = () => {\n            if (current) return resolve(current);\n            if (Date.now() - start >= timeout) return resolve(null);\n            setTimeout(tick, 100);\n        };\n\n        tick();\n    });\n}\n\nfunction readSocksClientRequest(client) {\n    return new Promise((resolve, reject) => {\n        let stage = 0;\n        let buffer = Buffer.alloc(0);\n\n        const cleanup = () => {\n            client.off(\"data\", onData);\n            client.off(\"error\", onError);\n            client.setTimeout(0);\n        };\n\n        const fail = e => {\n            cleanup();\n            reject(e instanceof Error ? e : new Error(String(e)));\n        };\n\n        const onError = fail;\n\n        const onData = chunk => {\n            buffer = Buffer.concat([buffer, chunk]);\n\n            if (buffer.length > 8192) {\n                fail(new Error(\"handshake SOCKS grande demais\"));\n                return;\n            }\n\n            try {\n                if (stage === 0) {\n                    if (buffer.length < 2) return;\n                    const count = buffer[1];\n                    if (buffer.length < 2 + count) return;\n\n                    client.write(Buffer.from([0x05, 0x00]));\n                    buffer = buffer.subarray(2 + count);\n                    stage = 1;\n                }\n\n                if (stage !== 1) return;\n                if (buffer.length < 5) return;\n\n                if (buffer[0] !== 0x05 || buffer[1] !== 0x01) {\n                    throw new Error(\"apenas SOCKS CONNECT suportado\");\n                }\n\n                const atyp = buffer[3];\n                let host;\n                let offset;\n\n                if (atyp === 0x01) {\n                    if (buffer.length < 10) return;\n                    host = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`;\n                    offset = 8;\n                } else if (atyp === 0x03) {\n                    const len = buffer[4];\n                    if (buffer.length < 7 + len) return;\n                    host = buffer.subarray(5, 5 + len).toString(\"utf8\");\n                    offset = 5 + len;\n                } else {\n                    throw new Error(\"ATYP não suportado\");\n                }\n\n                const port = (buffer[offset] << 8) | buffer[offset + 1];\n\n                cleanup();\n                resolve({host, port});\n            } catch (e) {\n                fail(e);\n            }\n        };\n\n        client.setTimeout(15000, () => fail(new Error(\"timeout cliente SOCKS\")));\n        client.on(\"error\", onError);\n        client.on(\"data\", onData);\n    });\n}\n\nfunction directConnect(host, port, timeout = 6000) {\n    return new Promise((resolve, reject) => {\n        const socket = trackSocket(net.connect(port, host));\n        let done = false;\n\n        const fail = error => {\n            if (done) return;\n            done = true;\n            try { socket.destroy(); } catch {}\n            reject(error instanceof Error ? error : new Error(String(error)));\n        };\n\n        socket.setTimeout(timeout, () => fail(new Error(\"timeout DIRECT\")));\n        socket.once(\"error\", fail);\n\n        socket.once(\"connect\", () => {\n            if (done) return;\n            done = true;\n            socket.setTimeout(0);\n            socket.removeListener(\"error\", fail);\n            resolve(socket);\n        });\n    });\n}\n\nasync function openDirectFallback(host, port, reason) {\n    lastGatewayViaProxy = false;\n\n    log(`FALLBACK DIRECT para ${host}:${port}: ${reason}`);\n\n    writeStatus({\n        state: \"degraded-direct\",\n        directFallback: true,\n        gatewayViaProxy: false,\n        directReason: reason,\n        directAt: new Date().toISOString()\n    });\n\n    const socket = await directConnect(host, port);\n\n    return {\n        socket,\n        viaProxy: false,\n        proxy: null\n    };\n}\n\nasync function openThroughPool(host, port) {\n    const settingsNow = readSettings();\n    const manualMode = !!String(settingsNow.manualProxy || \"\").trim();\n    const ready = await waitForExit(HOLD_GATEWAY_MS);\n\n    if (!ready) {\n        if (manualMode) {\n            const reason = \"proxy manual não ficou disponível a tempo\";\n\n            writeStatus({\n                state: \"manual-proxy-unavailable\",\n                proxyMode: \"manual-sticky\",\n                directFallback: false,\n                gatewayViaProxy: false,\n                directReason: reason\n            });\n\n            // Do NOT leak the Gateway to DIRECT when the user explicitly chose\n            // a private exit. Discord will retry this SOCKS connection.\n            throw new Error(reason);\n        }\n\n        selectPool(true).catch(error =>\n            log(`refresh após espera falhou: ${error.message}`)\n        );\n\n        return openDirectFallback(\n            host,\n            port,\n            \"nenhuma saída proxy ficou pronta a tempo\"\n        );\n    }\n\n    const ordered = [];\n\n    if (current) ordered.push(current);\n\n    if (!manualMode) {\n        for (const item of pool) {\n            if (!ordered.includes(item)) ordered.push(item);\n        }\n    }\n\n    let last = null;\n\n    for (const item of ordered) {\n        try {\n            const tunnelTimeout = manualMode ? 12000 : 6000;\n            const socket = await socks5Tunnel(\n                item.proxy,\n                host,\n                port,\n                tunnelTimeout\n            );\n\n            lastGatewayViaProxy = true;\n\n            if (current !== item) {\n                current = item;\n                log(`saída trocada para ${safeProxy(item.proxy)}`);\n            }\n\n            if (manualMode) {\n                manualHeartbeatFailures = 0;\n            }\n\n            writeStatus({\n                state: \"exit-in-use\",\n                proxyMode: manualMode ? \"manual-sticky\" : \"auto\",\n                directFallback: false,\n                gatewayViaProxy: true,\n                directReason: null,\n                manualHeartbeatFailures\n            });\n\n            return {\n                socket,\n                viaProxy: true,\n                proxy: item\n            };\n        } catch (error) {\n            last = error;\n\n            log(\n                `saída ${safeProxy(item.proxy)} falhou no tráfego vivo: ` +\n                error.message\n            );\n\n            if (manualMode) {\n                writeStatus({\n                    state: \"manual-proxy-relay-failed\",\n                    proxyMode: \"manual-sticky\",\n                    directFallback: false,\n                    gatewayViaProxy: false,\n                    directReason: error.message,\n                    manualHeartbeatFailures\n                });\n\n                // Explicit manual proxy is sticky: never switch to a public\n                // reserve and never fall back to the local/direct BR route.\n                throw error;\n            }\n\n            pool = pool.filter(x => x !== item);\n\n            if (current === item) current = null;\n        }\n    }\n\n    if (manualMode) {\n        const reason = last?.message || \"proxy manual indisponível\";\n\n        writeStatus({\n            state: \"manual-proxy-unavailable\",\n            proxyMode: \"manual-sticky\",\n            directFallback: false,\n            gatewayViaProxy: false,\n            directReason: reason\n        });\n\n        throw last || new Error(reason);\n    }\n\n    selectPool(true).catch(error =>\n        log(`refresh de pool falhou: ${error.message}`)\n    );\n\n    return openDirectFallback(\n        host,\n        port,\n        last?.message || \"pool de proxies esgotado\"\n    );\n}\n\n\nasync function openMediaSignalingThroughPool(host, port) {\n    const settingsNow = readSettings();\n    const manualMode = !!String(settingsNow.manualProxy || \"\").trim();\n\n    const ready = await waitForExit(HOLD_GATEWAY_MS);\n\n    if (!ready) {\n        const reason = \"nenhuma saída proxy pronta para sinalização de mídia\";\n\n        writeStatus({\n            mediaSignalingProxy: true,\n            mediaViaProxy: false,\n            mediaFallbackDirect: !manualMode,\n            mediaRouteError: reason\n        });\n\n        if (manualMode) {\n            throw new Error(reason);\n        }\n\n        log(`media signaling FALLBACK DIRECT ${host}:${port}: ${reason}`);\n\n        return {\n            socket: await directConnect(host, port),\n            viaProxy: false,\n            proxy: null\n        };\n    }\n\n    // Important: media signaling is NOT allowed to replace current/pool.\n    // A failed media handshake must never destabilize the healthy Gateway.\n    const ordered = [];\n\n    if (current) ordered.push(current);\n\n    for (const item of pool) {\n        if (!ordered.includes(item)) ordered.push(item);\n    }\n\n    let last = null;\n\n    for (const item of ordered) {\n        try {\n            const timeout = manualMode ? 12000 : 7000;\n\n            const socket = await socks5Tunnel(\n                item.proxy,\n                host,\n                port,\n                timeout\n            );\n\n            writeStatus({\n                mediaSignalingProxy: true,\n                mediaViaProxy: true,\n                mediaFallbackDirect: false,\n                mediaRouteError: null,\n                mediaProxy: safeProxy(item.proxy),\n                mediaCountry: item.country || null\n            });\n\n            log(\n                `media signaling roteada: ${host}:${port} -> ` +\n                `${safeProxy(item.proxy)}`\n            );\n\n            return {\n                socket,\n                viaProxy: true,\n                proxy: item\n            };\n        } catch (error) {\n            last = error;\n\n            log(\n                `media signaling: ${safeProxy(item.proxy)} falhou para ` +\n                `${host}:${port}: ${error.message}`\n            );\n        }\n    }\n\n    const reason = last?.message || \"pool de mídia esgotado\";\n\n    writeStatus({\n        mediaSignalingProxy: true,\n        mediaViaProxy: false,\n        mediaFallbackDirect: !manualMode,\n        mediaRouteError: reason\n    });\n\n    if (manualMode) {\n        // Manual/3proxy is authoritative. Do not silently reveal the media\n        // signaling to the direct BR route.\n        throw last || new Error(reason);\n    }\n\n    // Free proxies can be unreliable. Keep voice usable rather than making the\n    // whole call fail; the diagnostic will clearly show that this attempt fell\n    // back to DIRECT and therefore did not test the new route successfully.\n    log(\n        `media signaling FALLBACK DIRECT ${host}:${port}: ${reason}`\n    );\n\n    return {\n        socket: await directConnect(host, port),\n        viaProxy: false,\n        proxy: null\n    };\n}\n\nasync function handleRouterClient(client) {\n    try {\n        const request = await readSocksClientRequest(client);\n\n        if (!routedHost(request.host)) {\n            client.write(Buffer.from([0x05, 0x02, 0, 1, 0,0,0,0, 0,0]));\n            client.destroy();\n            return;\n        }\n\n        const settingsNow = readSettings();\n        const wireGuardMode =\n            String(settingsNow.networkMode || \"\").toLowerCase() ===\n            \"wireguard\";\n\n        const isMedia = mediaSignalingHost(request.host);\n\n        if (isMedia) {\n            log(`media signaling visto: ${request.host}:${request.port}`);\n        } else {\n            log(`gateway visto: ${request.host}:${request.port}`);\n        }\n\n        let route;\n\n        if (wireGuardMode) {\n            route = await openThroughWireGuard(\n                request.host,\n                request.port,\n                isMedia ? \"media-signaling\" : \"gateway\"\n            );\n        } else {\n            route = isMedia\n                ? await openMediaSignalingThroughPool(\n                    request.host,\n                    request.port\n                )\n                : await openThroughPool(\n                    request.host,\n                    request.port\n                );\n        }\n\n        const remote = route.socket;\n        const viaProxy = route.viaProxy === true;\n        const viaWireGuard = route.viaWireGuard === true;\n\n        if (!isMedia) {\n            lastGatewayViaProxy = viaProxy || viaWireGuard;\n\n            registerGatewayPair(\n                client,\n                remote,\n                viaProxy || viaWireGuard,\n                request.host\n            );\n        }\n\n        client.write(Buffer.from([0x05, 0x00, 0, 1, 127,0,0,1, 0,0]));\n        client.pipe(remote);\n        remote.pipe(client);\n\n        const tearDownRemote = () => {\n            try { client.destroy(); } catch {}\n            try { remote.destroy(); } catch {}\n        };\n\n        remote.on(\"error\", tearDownRemote);\n        client.on(\"error\", tearDownRemote);\n        remote.on(\"end\", tearDownRemote);\n        client.on(\"end\", tearDownRemote);\n\n        if (isMedia) {\n            const id = ++mediaRouteSeq;\n\n            writeStatus({\n                state: wireGuardMode\n                    ? \"media-wireguard-routed\"\n                    : \"media-signaling-routed\",\n                lastMediaHost: request.host,\n                lastMediaAt: new Date().toISOString(),\n                mediaRouteId: id,\n                mediaViaProxy: viaProxy,\n                mediaViaWireGuard: viaWireGuard,\n                mediaFallbackDirect:\n                    !viaProxy && !viaWireGuard\n            });\n\n            return;\n        }\n\n        writeStatus({\n            state: wireGuardMode\n                ? \"gateway-wireguard-routed\"\n                : \"gateway-routed\",\n            lastGatewayHost: request.host,\n            lastGatewayAt: new Date().toISOString(),\n            gatewayRouteId: gatewayRouteSeq,\n            gatewayViaProxy: viaProxy,\n            gatewayViaWireGuard: viaWireGuard,\n            directFallback:\n                !viaProxy && !viaWireGuard,\n            directReason:\n                viaProxy || viaWireGuard\n                    ? null\n                    : \"gateway atual abriu em DIRECT\",\n            gatewayTransitionCompletedAt:\n                viaProxy || viaWireGuard\n                    ? new Date().toISOString()\n                    : null\n        });\n    } catch (e) {\n        log(`router: ${e.message}`);\n\n        try {\n            client.write(Buffer.from([0x05, 0x01, 0, 1, 0,0,0,0, 0,0]));\n        } catch {}\n\n        try { client.destroy(); } catch {}\n    }\n}\n\nasync function startRouter() {\n    if (router) return router;\n\n    router = net.createServer(client => {\n        trackSocket(client);\n        handleRouterClient(client).catch(e => log(`cliente router: ${e.message}`));\n    });\n\n    await new Promise((resolve, reject) => {\n        router.once(\"error\", reject);\n        router.listen(0, \"127.0.0.1\", resolve);\n    });\n\n    routerPort = router.address().port;\n    log(`roteador local pronto em 127.0.0.1:${routerPort}`);\n\n    writeStatus({\n        state: \"router-ready\",\n        routerPort\n    });\n\n    return router;\n}\n\nfunction pacSource(fallback) {\n    return `\nfunction FindProxyForURL(url, host) {\n    host = String(host || \"\").toLowerCase();\n\n    var gateway =\n        host === \"gateway.discord.gg\" ||\n        host === \"remote-auth-gateway.discord.gg\" ||\n        (host.indexOf(\"gateway-\") === 0 && dnsDomainIs(host, \".discord.gg\"));\n\n    var media =\n        host === \"discord.media\" ||\n        dnsDomainIs(host, \".discord.media\");\n\n    if (gateway || media) {\n        return \"SOCKS5 127.0.0.1:${routerPort}\";\n    }\n\n    return ${JSON.stringify(fallback)};\n}\n`.trim();\n}\n\nasync function installPac() {\n    let fallback = \"DIRECT\";\n\n    try {\n        const system = await session.defaultSession.resolveProxy(\n            \"https://discord.com\"\n        );\n\n        if (typeof system === \"string\" && system.trim()) {\n            fallback = system.trim();\n        }\n    } catch (e) {\n        log(`não consegui ler proxy do sistema: ${e.message}`);\n    }\n\n    const source = pacSource(fallback);\n    const url = \"data:application/x-ns-proxy-autoconfig;base64,\"\n        + Buffer.from(source, \"utf8\").toString(\"base64\");\n\n    await session.defaultSession.setProxy({\n        mode: \"pac_script\",\n        pacScript: url\n    });\n\n    const checks = await Promise.all([\n        session.defaultSession.resolveProxy(\n            \"https://gateway.discord.gg\"\n        ),\n        session.defaultSession.resolveProxy(\n            \"https://gateway-us-east1-b.discord.gg\"\n        ),\n        session.defaultSession.resolveProxy(\n            \"https://voice-test.discord.media\"\n        ),\n        session.defaultSession.resolveProxy(\n            \"https://discord.com\"\n        )\n    ]);\n\n    const gatewayOk =\n        checks[0].includes(String(routerPort)) &&\n        checks[1].includes(String(routerPort));\n\n    const mediaOk =\n        checks[2].includes(String(routerPort));\n\n    if (!gatewayOk || !mediaOk) {\n        await session.defaultSession.setProxy({mode: \"system\"});\n\n        throw new Error(\n            `PAC local não foi aplicada: ${checks.join(\" | \")}`\n        );\n    }\n\n    const settingsNow = readSettings();\n    const wgMode =\n        String(settingsNow.networkMode || \"\").toLowerCase() ===\n        \"wireguard\";\n\n    log(\n        wgMode\n            ? `PAC local ativa: Gateway + *.discord.media -> ` +\n              `router 127.0.0.1:${routerPort} -> WireGuard`\n            : `PAC nativa ativa: gateway + *.discord.media -> ` +\n              `127.0.0.1:${routerPort}; resto -> ${fallback}`\n    );\n\n    writeStatus({\n        state: \"pac-active\",\n        pacActive: true,\n        pacPurpose: wgMode ? \"wireguard-route-coordinator\" : \"proxy\",\n        resolveGateway: checks[0],\n        resolveRegionalGateway: checks[1],\n        resolveMediaSignaling: checks[2],\n        resolveDiscordCom: checks[3]\n    });\n}\n\n\nasync function forceGatewayReconnectAfterWireGuardReady() {\n    if (!wireGuardManagerReady()) {\n        writeStatus({\n            state: \"wireguard-not-ready\",\n            wireGuardReady: false,\n            directFallback: false,\n            directReason: \"WireGuard manager não está pronto\"\n        });\n\n        return false;\n    }\n\n    touchRouteTarget(\"gateway.discord.gg\", \"startup-gateway\");\n    touchRouteTarget(\n        \"remote-auth-gateway.discord.gg\",\n        \"startup-gateway\"\n    );\n\n    const ready = await waitForRouteTarget(\n        \"gateway.discord.gg\",\n        8000\n    );\n\n    if (!ready) {\n        writeStatus({\n            state: \"wireguard-route-not-ready\",\n            wireGuardReady: false,\n            directFallback: false,\n            directReason:\n                \"rota do gateway não ficou pronta\"\n        });\n\n        return false;\n    }\n\n    try {\n        await session.defaultSession.closeAllConnections();\n\n        log(\n            \"WireGuard pronto; conexões Chromium fechadas para \" +\n            \"renegociar Gateway/media pelo túnel\"\n        );\n\n        writeStatus({\n            state: \"wireguard-ready-reconnecting\",\n            wireGuardReady: true,\n            gatewayViaWireGuard: null,\n            directFallback: false,\n            directReason: null\n        });\n\n        return true;\n    } catch (e) {\n        log(`closeAllConnections WireGuard falhou: ${e.message}`);\n        return false;\n    }\n}\n\nasync function forceGatewayReconnectAfterProxyReady() {\n    if (!current) {\n        writeStatus({\n            state: \"degraded-direct\",\n            directFallback: true,\n            directReason: \"nenhuma proxy validada; conexão atual não será derrubada\"\n        });\n        return false;\n    }\n\n    try {\n        const closedDirect = closeDirectGatewayPairs(\n            \"proxy pronta no boot\"\n        );\n\n        await session.defaultSession.closeAllConnections();\n\n        log(\n            `proxy pronta (${current.country}); DIRECT fechados=${closedDirect}; ` +\n            \"aguardando Gateway reconectar pela saída validada\"\n        );\n\n        lastGatewayViaProxy = false;\n\n        writeStatus({\n            state: \"proxy-ready-reconnecting\",\n            directFallback: false,\n            gatewayViaProxy: null,\n            directReason: null,\n            country: current.country,\n            proxy: safeProxy(current.proxy),\n            ms: current.ms\n        });\n\n        return true;\n    } catch (e) {\n        log(`closeAllConnections falhou: ${e.message}`);\n        return false;\n    }\n}\n\nasync function heartbeat() {\n    if (shuttingDown) return;\n\n    const settingsNow = readSettings();\n    const manualMode = !!String(settingsNow.manualProxy || \"\").trim();\n\n    if (!current) {\n        try {\n            await selectPool(true);\n        } catch (error) {\n            log(`heartbeat sem saída: ${error.message}`);\n\n            writeStatus({\n                state: manualMode\n                    ? \"manual-proxy-waiting\"\n                    : \"degraded-direct\",\n                proxyMode: manualMode ? \"manual-sticky\" : \"auto\",\n                proxyAttempt: selectionAttempt,\n                proxySelectionError: error.message,\n                directFallback: manualMode ? false : true\n            });\n        }\n\n        return;\n    }\n\n    try {\n        // A private 3proxy may occasionally answer a probe slowly even while\n        // the live Gateway tunnel is healthy. Give it more time than a free\n        // public exit before calling the telemetry probe unhealthy.\n        const heartbeatTimeout = manualMode ? 12000 : PROBE_TIMEOUT;\n        const ms = await tlsProbe(\n            current.proxy,\n            \"gateway.discord.gg\",\n            heartbeatTimeout\n        );\n\n        current.ms = ms;\n        streamHeartbeatFailures = 0;\n\n        if (manualMode) {\n            manualHeartbeatFailures = 0;\n        }\n\n        writeStatus({\n            state: \"healthy\",\n            proxyMode: manualMode ? \"manual-sticky\" : \"auto\",\n            heartbeatMs: ms,\n            manualHeartbeatFailures\n        });\n    } catch (error) {\n        if (manualMode) {\n            manualHeartbeatFailures++;\n\n            log(\n                `proxy manual: heartbeat falhou ${manualHeartbeatFailures}x: ` +\n                error.message\n            );\n\n            writeStatus({\n                state: manualHeartbeatFailures >= 2\n                    ? \"manual-proxy-suspect\"\n                    : \"manual-proxy-heartbeat-warning\",\n                proxyMode: \"manual-sticky\",\n                manualHeartbeatFailures,\n                lastHeartbeatError: error.message,\n                directFallback: false\n            });\n\n            // Critical v1.8.0 behavior: a health-probe failure no longer\n            // destroys/replaces a live manual Gateway. That reconnection was\n            // capable of leaving Discord's media engine stuck in loading.\n            return;\n        }\n\n        if (activeNativeStream()) {\n            streamHeartbeatFailures++;\n\n            log(\n                `heartbeat durante Live falhou ${streamHeartbeatFailures}/2: ` +\n                error.message\n            );\n\n            writeStatus({\n                state: \"stream-heartbeat-warning\",\n                streamHeartbeatFailures,\n                lastHeartbeatError: error.message\n            });\n\n            if (streamHeartbeatFailures < 2) {\n                log(\n                    \"Live nativa ativa: ignorando uma falha isolada para \" +\n                    \"não provocar reconexão do Gateway\"\n                );\n                return;\n            }\n        }\n\n        log(`heartbeat derrubou ${safeProxy(current.proxy)}: ${error.message}`);\n\n        streamHeartbeatFailures = 0;\n        pool = pool.filter(x => x !== current);\n        current = pool[0] || null;\n\n        if (!current) {\n            try {\n                await selectPool(true);\n            } catch (refreshError) {\n                log(`não consegui repor pool: ${refreshError.message}`);\n            }\n        }\n\n        writeStatus({state: \"exit-degraded\"});\n    }\n}\n\nconst SELF_HOOK_BEGIN = \"/* GoLiveBypassBD:NATIVE-HOOK:BEGIN */\";\nconst SELF_HOOK_END = \"/* GoLiveBypassBD:NATIVE-HOOK:END */\";\n\nfunction stripSelfMarker(content) {\n    const begin = content.indexOf(SELF_HOOK_BEGIN);\n    if (begin < 0) return content;\n\n    const end = content.indexOf(SELF_HOOK_END, begin);\n    if (end < 0) return content;\n\n    return content.slice(0, begin)\n        + content.slice(end + SELF_HOOK_END.length).replace(/^\\r?\\n/, \"\");\n}\n\nfunction selfMarkerBlock() {\n    return [\n        SELF_HOOK_BEGIN,\n        \"try { require(\" + JSON.stringify(__filename) + \"); }\",\n        \"catch (e) { console.error('[GoLiveBypassBD/native-hook]', e); }\",\n        SELF_HOOK_END,\n        \"\"\n    ].join(\"\\n\");\n}\n\nfunction repairOwnInjection() {\n    const settings = readSettings();\n    const coreIndex = String(settings.coreIndex || \"\").trim();\n\n    if (!coreIndex) {\n        writeStatus({\n            injectionPersistent: false,\n            injectionReason: \"coreIndex ausente no settings.json\"\n        });\n        return false;\n    }\n\n    try {\n        if (!fs.existsSync(coreIndex)) {\n            writeStatus({\n                injectionPersistent: false,\n                injectionReason: \"coreIndex não existe: \" + coreIndex\n            });\n            return false;\n        }\n\n        const original = fs.readFileSync(coreIndex, \"utf8\");\n\n        const escapedSelfPath = JSON.stringify(__filename);\n\n        if (\n            original.includes(SELF_HOOK_BEGIN) &&\n            original.includes(SELF_HOOK_END) &&\n            original.includes(escapedSelfPath)\n        ) {\n            writeStatus({\n                injectionPersistent: true,\n                injectionPath: coreIndex,\n                injectionReason: null\n            });\n            return true;\n        }\n\n        const clean = stripSelfMarker(original);\n        const wanted = selfMarkerBlock() + clean;\n\n        fs.writeFileSync(coreIndex, wanted, \"utf8\");\n\n        const verify = fs.readFileSync(coreIndex, \"utf8\");\n        const ok = verify.includes(SELF_HOOK_BEGIN)\n            && verify.includes(SELF_HOOK_END)\n            && verify.includes(escapedSelfPath);\n\n        writeStatus({\n            injectionPersistent: ok,\n            injectionPath: coreIndex,\n            injectionReason: ok ? null : \"verificação após write falhou\"\n        });\n\n        if (ok) {\n            log(`injeção persistente reparada em ${coreIndex}`);\n        }\n\n        return ok;\n    } catch (e) {\n        log(`self-heal da injeção falhou: ${e.message}`);\n\n        writeStatus({\n            injectionPersistent: false,\n            injectionPath: coreIndex,\n            injectionReason: e.message\n        });\n\n        return false;\n    }\n}\n\nasync function start() {\n    mkdir();\n\n    const consent =\n        readConsentConfig();\n\n    const earlySettings =\n        readSettings();\n\n    const activated =\n        consent.setupAccepted ===\n            true &&\n        consent.enabled ===\n            true &&\n        earlySettings.enabled !==\n            false;\n\n    log(\n        \"--- main hook v2.0.9 carregado ---\"\n    );\n\n    if (\n        !activated\n    ) {\n        clearNativeTimers();\n\n        writeStatus({\n            version: \"2.0.9\",\n            state:\n                consent.setupAccepted ===\n                    true\n                    ? \"paused\"\n                    : \"awaiting-activation\",\n            hookLoaded: true,\n            enabled: false,\n            activationAccepted:\n                consent.setupAccepted ===\n                true,\n            activationEnabled:\n                consent.enabled ===\n                true,\n            activationConfig:\n                CONSENT_CONFIG,\n            networkMode: \"inactive\",\n            pacActive: false,\n            proxyMode: \"inactive\",\n            singBoxReady: false,\n            singBoxRunning: false,\n            singBoxTunUp: false,\n            routeRaceState:\n                \"idle-activation-required\",\n            directFallback: false,\n            directReason:\n                consent.setupAccepted ===\n                    true\n                    ? \"integração pausada pelo usuário\"\n                    : \"aguardando aceite do tutorial no Settings\"\n        });\n\n        log(\n            consent.setupAccepted ===\n                true\n                ? \"ATIVAÇÃO: integração pausada; nenhum monitor/Route Race iniciado\"\n                : \"ATIVAÇÃO: aguardando tutorial; nenhum monitor/Route Race iniciado\"\n        );\n\n        return;\n    }\n\n    // 1.9.10: cada abertura começa sem histórico de proxy/teste.\n    // settings.json é preservado.\n    const freshReset =\n        freshResetNetworkJsonData();\n\n    // E, principalmente, encerra um TUN antigo que possa ter\n    // sobrevivido a versões anteriores.\n    const staleRuntime =\n        await stopStaleSingBoxForDirect();\n\n    const settings =\n        readSettings();\n\n    log(\n        \"--- main hook v2.0.9 carregado ---\"\n    );\n\n    writeStatus({\n        state:\n            \"direct-ready\",\n        hookLoaded:\n            true,\n        activationAccepted:\n            true,\n        activationEnabled:\n            true,\n        activationConfig:\n            CONSENT_CONFIG,\n        enabled:\n            settings.enabled !==\n            false,\n        electron:\n            process.versions.electron ||\n            null,\n        networkMode:\n            \"direct-first\",\n        pacActive:\n            false,\n        proxyMode:\n            \"fallback-idle\",\n        proxyAttempt:\n            0,\n        proxyCandidates:\n            0,\n        proxyCandidatesTotal:\n            0,\n        proxyPoolSize:\n            0,\n        proxyCacheState:\n            \"fresh-every-start\",\n        proxySelectionError:\n            null,\n        current:\n            null,\n        pool:\n            [],\n        country:\n            null,\n        proxy:\n            null,\n        error:\n            null,\n        startupFreshReset:\n            true,\n        startupResetDeleted:\n            freshReset.deleted.length,\n        startupResetFailed:\n            freshReset.failed.length,\n        startupResetFiles:\n            freshReset.deleted,\n        staleSingBoxStopped:\n            staleRuntime?.killed > 0 ||\n            staleRuntime?.taskStopped === true,\n        staleSingBoxKilled:\n            staleRuntime?.killed ?? 0,\n        staleSingBoxProcessAfterReset:\n            staleRuntime?.processStillRunning ??\n            null,\n        staleTunAfterReset:\n            staleRuntime?.tunStillUp ??\n            null,\n        staleTunNameAfterReset:\n            staleRuntime?.tunName ||\n            null,\n        directFallback:\n            true,\n        directReason:\n            staleRuntime?.tunStillUp === true\n                ? \"DIRECT solicitado; TUN residual ainda detectado\"\n                : \"DIRECT limpo; caches zerados e TUN antigo encerrado\",\n        directRemoteFirstFrame:\n            false,\n        directOutboundActive:\n            false,\n        directRemoteActive:\n            false,\n        fallbackTriggered:\n            false,\n        fallbackFailed:\n            false,\n        routeRaceState:\n            \"agendado\",\n        routeBestCountry:\n            null,\n        routeBestAvgMs:\n            null,\n        routeBestJitterMs:\n            null,\n        routeBestLossPct:\n            null,\n        routeBestScore:\n            null,\n        routeMemoryCount:\n            readBestRoutesMemory(\n                new Set()\n            ).length,\n        singBoxReady:\n            false,\n        singBoxRunning:\n            staleRuntime?.processStillRunning ===\n                true,\n        singBoxPid:\n            null,\n        singBoxTunUp:\n            staleRuntime?.tunStillUp ===\n                true,\n        singBoxTunName:\n            staleRuntime?.tunName ||\n            null,\n        singBoxTaskState:\n            null,\n        singBoxVersion:\n            \"1.13.20\",\n        powershellPath:\n            POWERSHELL_EXE,\n        singBoxProxy:\n            null,\n        singBoxBootstrapState:\n            null,\n        singBoxBootstrapError:\n            null\n    });\n\n    registerVoicePreload();\n\n    if (\n        settings.enabled ===\n        false\n    ) {\n        log(\n            \"hook desativado pelas configurações\"\n        );\n\n        return;\n    }\n\n    // Garante que Chromium/Electron não herde PAC/proxy anterior.\n    try {\n        await session.defaultSession\n            .setProxy({\n                mode:\n                    \"system\"\n            });\n\n        await session.defaultSession\n            .closeAllConnections();\n\n        log(\n            \"DIRECT-FIRST: proxy restaurada para system/direct + conexões antigas fechadas\"\n        );\n    } catch (e) {\n        log(\n            `DIRECT-FIRST proxy reset: ${e.message}`\n        );\n    }\n\n    // A limpeza acima já remove comandos antigos; esta chamada fica\n    // como segunda proteção para instalações vindas de versões velhas.\n    clearLegacyAutoBootstrapCommand();\n\n    clearNativeTimers();\n\n    startupRepairTimer =\n        setTimeout(\n            () => {\n                startupRepairTimer =\n                    null;\n\n                repairOwnInjection();\n            },\n            5000\n        );\n\n    repairTimer =\n        setInterval(\n            () => {\n                repairOwnInjection();\n            },\n            60000\n        );\n\n    directMonitorTimer =\n        setInterval(\n            () => {\n                directFirstMonitorTick()\n                    .catch(\n                        e => log(\n                            `DIRECT monitor: ${e.message}`\n                        )\n                    );\n            },\n            DIRECT_STATUS_INTERVAL_MS\n        );\n\n    directFirstMonitorTick()\n        .catch(\n            e => log(\n                `DIRECT monitor inicial: ${e.message}`\n            )\n        );\n\n    // Prepara a melhor rota para Go Live/câmera sem tocar no DIRECT.\n    startRouteOptimizerSoon();\n\n    log(\n        \"DIRECT-FIRST/FRESH-RESET pronto: Go Live/câmera em DIRECT; Media Route Race rodando em background\"\n    );\n}\n\nfunction begin() {\n    if (globalThis[NATIVE_SINGLETON_KEY]) {\n        log(\"hook nativo já estava ativo neste processo; ignorando segunda inicialização\");\n        return;\n    }\n\n    globalThis[NATIVE_SINGLETON_KEY] = true;\n\n    start().catch(e => {\n        log(`FATAL: ${e.stack || e.message}`);\n        writeStatus({\n            state: \"fatal\",\n            error: e.message\n        });\n    });\n}\n\napp.once(\"before-quit\", () => {\n    shuttingDown = true;\n\n    clearNativeTimers();\n    destroyActiveSockets();\n\n    for (const pair of [...activeGatewayPairs]) {\n        try { pair.client.destroy(); } catch {}\n        try { pair.remote.destroy(); } catch {}\n    }\n    activeGatewayPairs.clear();\n\n    try { router?.close(); } catch {}\n    router = null;\n\n    globalThis[NATIVE_SINGLETON_KEY] = false;\n});\n\n// This module is loaded by discord_desktop_core very early.\nif (app.isReady()) {\n    begin();\n} else {\n    app.once(\"ready\", begin);\n}\n";

module.exports = class GoLiveBypassBD {
    constructor() {
        this.api = new BdApi("GoLiveBypassBD");

        this.settings = Object.assign({
            enabled: false,
            excludedCountries: "BR",
            manualProxy: "",
            networkMode: "singbox",
            singBoxProxy: "",
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

        const consent =
            this.readConsentConfig();

        const integrationEnabled =
            consent.setupAccepted ===
                true &&
            consent.enabled ===
                true;

        if (
            !integrationEnabled
        ) {
            this.settings.enabled =
                false;

            this.saveSettingsAndNativeConfig();

            this._updateStatus =
                consent.setupAccepted ===
                    true
                    ? "integração pausada"
                    : "aguardando ativação";

            this.startAutoUpdater();
            return;
        }

        this.settings.enabled =
            true;

        this.saveSettingsAndNativeConfig();

        this.installVideoGuardPatch();
        this.installRegionOverride();

        try {
            this.ensureNativeHookFiles();
        } catch (e) {
            this.api.Logger.warn(
                "Não consegui preparar hook nativo automaticamente",
                e
            );
        }

        this.schedule(
            () => {
                const status =
                    this.readNativeStatus();

                if (
                    status?.pacActive
                ) {
                    BdApi.UI.showToast(
                        `Go Live De Queijo: proxy nativa ativa${status.current?.country ? " (" + status.current.country + ")" : ""}.`,
                        {
                            type: "success",
                            timeout: 5000
                        }
                    );
                }
            },
            1200
        );

        this.schedule(
            () => {
                this.verifyServerSessionAndRetry();
            },
            1800
        );

        this.installRendererDiagnostics();

        this.schedule(
            () => {
                const nativeStatus =
                    this.readNativeStatus();

                const runtimeVersion =
                    String(
                        nativeStatus?.version ||
                        ""
                    );

                if (
                    nativeStatus?.hookLoaded &&
                    runtimeVersion &&
                    runtimeVersion !==
                        PLUGIN_VERSION &&
                    !this.hasActiveStreamMedia()
                ) {
                    const key =
                        `nativeRuntimeRestartedFor-${PLUGIN_VERSION}`;

                    if (
                        !this.api.Data.load(
                            key
                        )
                    ) {
                        this.api.Data.save(
                            key,
                            true
                        );

                        BdApi.UI.showToast(
                            `Go Live: ativando hook nativo ${PLUGIN_VERSION}; reiniciando Discord uma vez...`,
                            {
                                type: "info",
                                timeout: 6500
                            }
                        );

                        this.schedule(
                            () => {
                                this.restartDiscord()
                                    .catch(
                                        e =>
                                            this.api.Logger.error(
                                                "Falha no relaunch nativo",
                                                e
                                            )
                                    );
                            },
                            1200
                        );
                    }
                }
            },
            2500
        );

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

    get pluginFilePath() {
        try {
            if (
                typeof __filename === "string" &&
                __filename.toLowerCase().endsWith(".plugin.js") &&
                fs.existsSync(__filename)
            ) {
                return __filename;
            }
        } catch {}

        return path.join(
            BdApi.Plugins.folder,
            "GoLiveDeQueijo.plugin.js"
        );
    }

    get hookPath() {
        return path.join(this.dataDir, "main-hook.js");
    }

    get nativeSettingsPath() {
        return path.join(this.dataDir, "settings.json");
    }

    get consentConfigPath() {
        return path.join(
            this.dataDir,
            "GoLiveBypassBD.config.json"
        );
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

    get bestProxyCachePath() {
        return path.join(this.dataDir, "best-proxies.json");
    }

    get proxyCatalogPath() {
        return path.join(this.dataDir, "proxy-catalog.json");
    }

    get bestRoutesPath() {
        return path.join(this.dataDir, "best-routes.json");
    }

    get remoteRoutesJsonCachePath() {
        return path.join(this.dataDir, "routes-data-cache.json");
    }

    get remoteRoutesTxtCachePath() {
        return path.join(this.dataDir, "routes-data-cache.txt");
    }

    get voiceCommandPath() {
        return path.join(this.dataDir, "voice-command.json");
    }

    get singBoxInstallStatusPath() {
        return path.join(this.dataDir, "singbox-install-status.json");
    }

    get singBoxCommandPath() {
        return path.join(this.dataDir, "singbox-command.json");
    }

    get singBoxCommandResultPath() {
        return path.join(this.dataDir, "singbox-command-result.json");
    }

    get singBoxBootstrapPath() {
        return path.join(this.dataDir, "singbox-bootstrap.ps1");
    }

    get singBoxConfigPath() {
        return path.join(this.dataDir, "singbox-config.json");
    }

    get singBoxLogPath() {
        return path.join(this.dataDir, "singbox.log");
    }

    get singBoxBootstrapLogPath() {
        return path.join(this.dataDir, "singbox-bootstrap.log");
    }

    get singBoxRunnerLogPath() {
        return path.join(this.dataDir, "singbox-runner.log");
    }

    saveSettingsAndNativeConfig() {
        this.api.Data.save("settings", this.settings);

        const integrationEnabled =
            this.isIntegrationEnabled() &&
            this.settings.enabled !==
                false;

        try {
            fs.mkdirSync(this.dataDir, {recursive: true});
            fs.writeFileSync(
                this.nativeSettingsPath,
                JSON.stringify({
                    enabled: !!integrationEnabled,
                    excludedCountries: String(this.settings.excludedCountries || "BR"),
                    manualProxy: "",
                    networkMode: "singbox-auto",
                    singBoxProxy: "",
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

    getSingBoxProxyHealth() {
        const text = this.tailLog(
            this.singBoxLogPath,
            300
        ).join("\n");

        const tcpRejected =
            /socks5:\s*request rejected,\s*code=2/i.test(text);

        const udpRejected =
            /listen packet connection[\s\S]*?outbound\/socks\[discord-socks\]:\s*EOF/i.test(text) ||
            /outbound packet connection[\s\S]*?operation was canceled/i.test(text);

        if (tcpRejected && udpRejected) {
            return {
                ok: false,
                code: "tcp-udp-rejected",
                label: "3PROXY REJEITANDO TCP/UDP",
                detail: "CONNECT recebeu SOCKS5 code=2 e UDP ASSOCIATE/relay terminou em EOF"
            };
        }

        if (tcpRejected) {
            return {
                ok: false,
                code: "tcp-rejected",
                label: "3PROXY REJEITANDO TCP",
                detail: "SOCKS5 code=2: connection not allowed by ruleset"
            };
        }

        if (udpRejected) {
            return {
                ok: false,
                code: "udp-rejected",
                label: "3PROXY UDP FALHOU",
                detail: "UDP ASSOCIATE/relay terminou em EOF"
            };
        }

        const trafficSeen =
            /outbound\/socks\[discord-socks\]/i.test(text);

        return {
            ok: trafficSeen ? true : null,
            code: trafficSeen ? "traffic-seen" : "unknown",
            label: trafficSeen ? "TRÁFEGO SOCKS DETECTADO" : "AGUARDANDO TRÁFEGO",
            detail: null
        };
    }

    readSingBoxInstallStatus() {
        try {
            return JSON.parse(
                fs.readFileSync(
                    this.singBoxInstallStatusPath,
                    "utf8"
                ).replace(/^\uFEFF/, "")
            );
        } catch {
            return null;
        }
    }

    parseSingBoxProxy(value = this.settings.singBoxProxy) {
        const raw = String(value || "").trim();

        if (!raw) {
            throw new Error("Proxy SOCKS5 não configurada.");
        }

        let parsed;

        try {
            parsed = new URL(
                raw.includes("://")
                    ? raw
                    : `socks5://${raw}`
            );
        } catch {
            throw new Error(
                "Proxy inválida. Use socks5://IP:PORTA ou socks5://usuario:senha@IP:PORTA"
            );
        }

        if (
            parsed.protocol !== "socks5:" &&
            parsed.protocol !== "socks:"
        ) {
            throw new Error(
                "A v1.8.0 requer proxy SOCKS5."
            );
        }

        const port = Number(
            parsed.port || 1080
        );

        if (
            !parsed.hostname ||
            !Number.isInteger(port) ||
            port < 1 ||
            port > 65535
        ) {
            throw new Error(
                "Host/porta SOCKS5 inválidos."
            );
        }

        return {
            server: parsed.hostname,
            port,
            username:
                decodeURIComponent(
                    parsed.username || ""
                ),
            password:
                decodeURIComponent(
                    parsed.password || ""
                ),
            safe:
                `socks5://${parsed.hostname}:${port}`
        };
    }

    buildSingBoxConfig() {
        const proxy =
            this.parseSingBoxProxy();

        const socks = {
            type: "socks",
            tag: "discord-socks",
            server: proxy.server,
            server_port: proxy.port,
            version: "5"
        };

        if (proxy.username) {
            socks.username = proxy.username;
        }

        if (proxy.password) {
            socks.password = proxy.password;
        }

        return {
            $schema:
                "https://sing-box.sagernet.org/schema.json",
            log: {
                level: "info",
                timestamp: true,
                output: this.singBoxLogPath
            },
            inbounds: [
                {
                    type: "tun",
                    tag: "tun-in",
                    interface_name: "GoLiveDeQueijo",
                    address: [
                        "172.19.0.1/30"
                    ],
                    mtu: 1500,
                    auto_route: true,
                    strict_route: false,
                    stack: "system"
                }
            ],
            outbounds: [
                socks,
                {
                    type: "direct",
                    tag: "direct"
                }
            ],
            route: {
                auto_detect_interface: true,
                rules: [
                    {
                        process_name: [
                            "Discord.exe",
                            "DiscordCanary.exe",
                            "DiscordPTB.exe"
                        ],
                        action: "route",
                        outbound: "discord-socks"
                    },
                    {
                        // Fallback observado nos logs atuais do Discord Voice/Video.
                        // Em alguns pacotes UDP o Windows/sing-box perde a associação
                        // com Discord.exe; sem esta regra eles cairiam em DIRECT.
                        ip_cidr: [
                            "162.159.128.0/17"
                        ],
                        action: "route",
                        outbound: "discord-socks"
                    }
                ],
                final: "direct"
            }
        };
    }

    writeSingBoxSupportFiles() {
        fs.mkdirSync(
            this.dataDir,
            {recursive: true}
        );

        fs.writeFileSync(
            this.singBoxBootstrapPath,
            SINGBOX_BOOTSTRAP_PS1_SOURCE,
            "utf8"
        );

        // A config real é criada no main-hook após um candidato passar
        // em TCP CONNECT + UDP ASSOCIATE + país não-BR.
        try {
            fs.unlinkSync(
                this.singBoxConfigPath
            );
        } catch {}

        return true;
    }

    runSingBoxBootstrap() {
        // Na 1.9.9 os arquivos do sing-box são preparados como FALLBACK,
        // mas nenhuma busca de proxy é iniciada no startup.
        this.writeSingBoxSupportFiles();

        // Remove comandos antigos da 1.9.8 que causariam novo scan no restart.
        try {
            const old = JSON.parse(
                fs.readFileSync(
                    this.singBoxCommandPath,
                    "utf8"
                )
            );

            if (
                old?.type === "auto-bootstrap" ||
                old?.type === "bootstrap"
            ) {
                fs.unlinkSync(
                    this.singBoxCommandPath
                );
            }
        } catch {}

        this.settings.networkMode =
            "direct-first";

        this.settings.singBoxProxy =
            "";

        this.saveSettingsAndNativeConfig();

        return {
            command: null,
            automatic: true,
            directFirst: true
        };
    }

    requestNativeFallback(reason = "falha direta") {
        try {
            this.writeSingBoxSupportFiles();

            const command = {
                version: PLUGIN_VERSION,
                type: "fallback-now",
                nonce:
                    `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                reason:
                    String(reason || "falha direta"),
                at:
                    new Date().toISOString()
            };

            fs.writeFileSync(
                this.singBoxCommandPath,
                JSON.stringify(
                    command,
                    null,
                    2
                ),
                "utf8"
            );

            this.log(
                `fallback TUN solicitado: ${command.reason}`
            );

            return true;
        } catch (e) {
            this.log(
                `fallback TUN não pôde ser solicitado: ${e.message}`
            );

            return false;
        }
    }

    ensureSingBoxReady() {
        if (process.platform !== "win32") {
            throw new Error(
                "A integração automática sing-box TUN da v1.9.0 suporta Windows."
            );
        }

        return this.runSingBoxBootstrap();
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
            const native = this.readNativeStatus();
            const singBoxMode =
                String(
                    native?.networkMode ||
                    this.settings.networkMode ||
                    ""
                ).toLowerCase().startsWith("singbox");

            this.sessionVerdict += singBoxMode
                ? " • TUN não ficou pronto após 80s"
                : " • Gateway não migrou após 80s";
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

        const networkMode =
            String(
                native?.networkMode ||
                this.settings.networkMode ||
                ""
            ).toLowerCase();

        const directFirstMode =
            networkMode.startsWith(
                "direct-first"
            );

        const singBoxMode =
            networkMode.startsWith(
                "singbox"
            );

        if (directFirstMode) {
            this.requestNativeFallback(
                `servidor bloqueou Go Live (variantId ${assignment.variantId})`
            );

            this.sessionVerdict =
                `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • fallback TUN solicitado`;

            return;
        }

        if (singBoxMode) {
            if (native?.singBoxReady !== true) {
                this.sessionVerdict =
                    `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • aguardando TUN`;

                this.scheduleServerProxyRecheck();
                return;
            }

            this._serverProxyWaitChecks = 0;
            this._serverProxyWaitScheduled = false;

            const proxyHealth =
                this.getSingBoxProxyHealth();

            if (proxyHealth?.ok === false) {
                this.sessionVerdict =
                    `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • ${proxyHealth.label}`;

                return;
            }

            if (this.hasActiveStreamMedia()) {
                this.sessionVerdict =
                    `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • TUN ativo, mídia em uso`;
                return;
            }

            const retry =
                this.sessionRetryState();

            if (retry.count >= 2) {
                this.sessionVerdict =
                    `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • TUN ativo • tentativas esgotadas`;
                return;
            }

            const next = retry.count + 1;

            this.api.Data.save(
                "sessionRetryState",
                {
                    count: next,
                    windowStartedAt: retry.windowStartedAt,
                    nativePid: retry.nativePid
                }
            );

            this.sessionVerdict =
                `BLOQUEADA pelo servidor (variantId ${assignment.variantId}) • TUN ativo • renovando sessão (${next}/2)`;

            BdApi.UI.showToast(
                `Go Live De Queijo: TUN ativo; renovando a sessão (${next}/2)...`,
                {type: "info", timeout: 5000}
            );

            this.schedule(() => {
                try {
                    window.location.reload();
                } catch (e) {
                    this.api.Logger.error(
                        "Falha ao recarregar sessão com sing-box TUN",
                        e
                    );
                }
            }, 700);

            return;
        }

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
        try {
            this.api.Patcher.unpatchAll();
        } catch {}

        this.restoreVideoGuardPatch();
        this.restoreRegionOverride();

        if (
            !this.isIntegrationEnabled() ||
            this.settings.enabled ===
                false
        ) {
            return;
        }

        this.installVideoGuardPatch();
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
        if (
            !this.isIntegrationEnabled()
        ) {
            if (
                !this.isSetupAccepted()
            ) {
                this.openActivationTutorial();
                return;
            }

            this.writeConsentConfig({
                enabled: true,
                reenabledAt:
                    new Date()
                        .toISOString()
            });

            this.settings.enabled =
                true;
        }

        try {
            this.saveSettingsAndNativeConfig();

            BdApi.UI.showToast(
                "Preparando Go Live De Queijo. O Discord seguirá DIRECT por padrão; rotas/TUN entram quando forem necessárias.",
                {
                    type: "info",
                    timeout: 8000
                }
            );

            this.ensureSingBoxReady();

            const target =
                this.ensureNativeHookFiles();

            BdApi.UI.showToast(
                `Hook instalado em ${target.appName}. Reiniciando o Discord para carregar a integração...`,
                {
                    type: "success",
                    timeout: 8000
                }
            );

            await this.restartDiscord();
        } catch (e) {
            this.api.Logger.error(
                "Falha ao preparar modo automático/reiniciar",
                e
            );

            BdApi.UI.alert(
                PLUGIN_NAME,
                "Não consegui preparar o modo automático:\n\n" +
                e.message
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

    async fullUninstall() {
        const pluginPath =
            this.pluginFilePath;

        const runtimeLoaded =
            this.isNativeRuntimeLoaded();

        if (!runtimeLoaded) {
            // Fallback local: pelo menos remove o loader no core e o próprio
            // plugin. A limpeza completa de task/TUN é feita pelo main-hook
            // quando ele está carregado.
            const hookRemoved =
                this.removeNativeHook();

            if (!hookRemoved) {
                return;
            }

            // Mantém o arquivo .plugin.js no BetterDiscord.
            // A desinstalação limpa apenas a integração nativa/rede.
            try {
                if (
                    fs.existsSync(
                        this.dataDir
                    )
                ) {
                    fs.rmSync(
                        this.dataDir,
                        {
                            recursive:
                                true,
                            force:
                                true
                        }
                    );
                }
            } catch {}

            BdApi.UI.showToast(
                "Go Live De Queijo removido. Reiniciando Discord...",
                {
                    type:
                        "success",
                    timeout:
                        6000
                }
            );

            try {
                await this.restartDiscord();
            } catch {}

            return;
        }

        try {
            fs.mkdirSync(
                this.dataDir,
                {
                    recursive:
                        true
                }
            );

            fs.writeFileSync(
                this.singBoxCommandPath,
                JSON.stringify(
                    {
                        version:
                            PLUGIN_VERSION,
                        type:
                            "uninstall-now",
                        nonce:
                            `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                        keepPluginFile:
                            true,
                        at:
                            new Date()
                                .toISOString()
                    },
                    null,
                    2
                ),
                "utf8"
            );

            BdApi.UI.showToast(
                "Desinstalação completa iniciada. O Discord vai reiniciar sozinho...",
                {
                    type:
                        "info",
                    timeout:
                        8000
                }
            );
        } catch (e) {
            BdApi.UI.alert(
                PLUGIN_NAME,
                "Não consegui iniciar a desinstalação:\n\n" +
                e.message
            );
        }
    }

    confirmFullUninstall() {
        BdApi.UI.showConfirmationModal(
            "Desinstalar Go Live De Queijo?",
            [
                "Isso remove completamente:",
                "\n• hook do discord_desktop_core",
                "\n• tarefa GoLiveDeQueijo-SingBox",
                "\n• sing-box/TUN",
                "\n• caches, logs e configurações em %LOCALAPPDATA%\\GoLiveBypassBD",
                "\n• mantém o GoLiveDeQueijo.plugin.js no BetterDiscord",
                "\n\nO Discord será reiniciado no final."
            ].join(""),
            {
                confirmText:
                    "Limpar integração",
                cancelText:
                    "Cancelar",
                danger:
                    true,
                onConfirm:
                    () =>
                        this.fullUninstall()
            }
        );
    }

    readConsentConfig() {
        try {
            const parsed =
                JSON.parse(
                    fs.readFileSync(
                        this.consentConfigPath,
                        "utf8"
                    )
                );

            return Object.assign(
                {
                    version: 1,
                    tutorialVersion: 1,
                    setupAccepted: false,
                    enabled: false,
                    acceptedAt: null,
                    acceptedPluginVersion: null
                },
                parsed || {}
            );
        } catch {
            return {
                version: 1,
                tutorialVersion: 1,
                setupAccepted: false,
                enabled: false,
                acceptedAt: null,
                acceptedPluginVersion: null
            };
        }
    }

    writeConsentConfig(patch = {}) {
        const current =
            this.readConsentConfig();

        const next =
            Object.assign(
                {},
                current,
                patch,
                {
                    version: 1,
                    tutorialVersion: 1,
                    updatedAt:
                        new Date().toISOString()
                }
            );

        fs.mkdirSync(
            this.dataDir,
            {recursive: true}
        );

        const temp =
            this.consentConfigPath +
            ".tmp";

        fs.writeFileSync(
            temp,
            JSON.stringify(
                next,
                null,
                2
            ),
            "utf8"
        );

        try {
            fs.renameSync(
                temp,
                this.consentConfigPath
            );
        } catch {
            try {
                fs.unlinkSync(
                    this.consentConfigPath
                );
            } catch {}

            fs.renameSync(
                temp,
                this.consentConfigPath
            );
        }

        return next;
    }

    isSetupAccepted() {
        return (
            this.readConsentConfig()
                .setupAccepted ===
            true
        );
    }

    isIntegrationEnabled() {
        const config =
            this.readConsentConfig();

        return (
            config.setupAccepted ===
                true &&
            config.enabled ===
                true
        );
    }

    async finishActivationTutorial(closeTutorial) {
        try {
            const now =
                new Date()
                    .toISOString();

            const current =
                this.readConsentConfig();

            this.writeConsentConfig({
                setupAccepted: true,
                enabled: true,
                acceptedAt:
                    current.acceptedAt ||
                    now,
                lastAcceptedAt:
                    now,
                acceptedPluginVersion:
                    PLUGIN_VERSION
            });

            this.settings.enabled =
                true;

            this.saveSettingsAndNativeConfig();

            try {
                closeTutorial?.();
            } catch {}

            BdApi.UI.showToast(
                "Ativação salva. Preparando a integração e reiniciando o Discord...",
                {
                    type: "success",
                    timeout: 7000
                }
            );

            await this.installAndRestart();
        } catch (e) {
            this.api.Logger.error(
                "Falha ao concluir ativação",
                e
            );

            BdApi.UI.alert(
                PLUGIN_NAME,
                "Não consegui concluir a ativação:\n\n" +
                e.message
            );
        }
    }

    async enableFromSavedConsent() {
        const config =
            this.readConsentConfig();

        if (
            config.setupAccepted !==
            true
        ) {
            this.openActivationTutorial();
            return;
        }

        this.writeConsentConfig({
            enabled: true,
            reenabledAt:
                new Date()
                    .toISOString()
        });

        this.settings.enabled =
            true;

        this.saveSettingsAndNativeConfig();

        await this.installAndRestart();
    }

    confirmDisableIntegration() {
        BdApi.UI.showConfirmationModal(
            "Pausar Go Live De Queijo?",
            "O aceite continuará salvo, mas a integração ficará desativada no próximo início do Discord. Você poderá reativá-la depois sem refazer o tutorial.",
            {
                confirmText:
                    "Pausar e reiniciar",
                cancelText:
                    "Cancelar",
                danger:
                    true,
                onConfirm:
                    async () => {
                        try {
                            this.writeConsentConfig({
                                enabled: false,
                                disabledAt:
                                    new Date()
                                        .toISOString()
                            });

                            this.settings.enabled =
                                false;

                            this.saveSettingsAndNativeConfig();

                            this.restoreVideoGuardPatch();
                            this.restoreRegionOverride();

                            BdApi.UI.showToast(
                                "Integração pausada. Reiniciando o Discord...",
                                {
                                    type: "info",
                                    timeout: 5000
                                }
                            );

                            await this.restartDiscord();
                        } catch (e) {
                            BdApi.UI.alert(
                                PLUGIN_NAME,
                                "Não consegui pausar a integração:\n\n" +
                                e.message
                            );
                        }
                    }
            }
        );
    }

    openActivationTutorial(options = {}) {
        const React =
            BdApi.React;

        const ReactDOM =
            BdApi.ReactDOM;

        const review =
            options.review ===
            true;

        const old =
            document.getElementById(
                "glq-activation-tutorial"
            );

        if (old) {
            try {
                old.remove();
            } catch {}
        }

        const host =
            document.createElement(
                "div"
            );

        host.id =
            "glq-activation-tutorial";

        document.body.appendChild(
            host
        );

        const plugin =
            this;

        let root =
            null;

        const close =
            () => {
                try {
                    if (
                        root &&
                        typeof root.unmount ===
                            "function"
                    ) {
                        root.unmount();
                    } else if (
                        ReactDOM &&
                        typeof ReactDOM.unmountComponentAtNode ===
                            "function"
                    ) {
                        ReactDOM.unmountComponentAtNode(
                            host
                        );
                    }
                } catch {}

                try {
                    host.remove();
                } catch {}
            };

        const steps = [
            {
                eyebrow: "PASSO 1 DE 4",
                title: "O que será ativado",
                text: "O Go Live De Queijo instala uma integração local no Discord para liberar e acompanhar Go Live, compartilhamento de tela e câmera.",
                points: [
                    "Aplica o patch local de vídeo no cliente.",
                    "Instala o main-hook no discord_desktop_core.",
                    "Mantém o modo DIRECT como primeira opção.",
                    "A integração só começa depois da confirmação final."
                ]
            },
            {
                eyebrow: "PASSO 2 DE 4",
                title: "Como as rotas são avaliadas",
                text: "O plugin pode carregar routes.json/routes.txt do repositório configurado e testar rotas SOCKS5 para encontrar opções com UDP e menor latência.",
                points: [
                    "Testa UDP, RTT, jitter e perda de pacotes.",
                    "Compara a rota encontrada com o caminho DIRECT.",
                    "Uma proxy pública pode ficar lenta ou parar de responder.",
                    "A busca existe para ajudar Go Live e câmera; menor ping é preferido."
                ]
            },
            {
                eyebrow: "PASSO 3 DE 4",
                title: "O que pode acontecer no Windows",
                text: "Se o fallback TUN precisar ser preparado, o plugin pode iniciar PowerShell e solicitar UAC para instalar componentes necessários.",
                points: [
                    "Pode baixar o sing-box oficial para a pasta local do plugin.",
                    "Pode criar o adaptador TUN GoLiveDeQueijo.",
                    "Pode criar a tarefa GoLiveDeQueijo-SingBox em segundo plano.",
                    "O Discord pode ser reiniciado para carregar o hook nativo corretamente."
                ]
            },
            {
                eyebrow: "PASSO 4 DE 4",
                title: "Antes de ativar",
                text: "Proxies públicas são serviços de terceiros e não têm garantia de disponibilidade ou latência. A integração pode ser pausada ou limpa pelo próprio painel.",
                points: [
                    "O aceite ficará salvo em GoLiveBypassBD.config.json.",
                    "O arquivo registra que este tutorial foi concluído.",
                    "Pausar mantém o aceite salvo para reativação rápida.",
                    "Limpar integração remove hook, TUN, sing-box, caches e configurações locais."
                ]
            }
        ];

        function Tutorial() {
            const [step, setStep] =
                React.useState(0);

            const [seconds, setSeconds] =
                React.useState(7);

            React.useEffect(
                () => {
                    setSeconds(7);

                    const id =
                        setInterval(
                            () => {
                                setSeconds(
                                    value => {
                                        if (
                                            value <=
                                            1
                                        ) {
                                            clearInterval(
                                                id
                                            );
                                            return 0;
                                        }

                                        return value - 1;
                                    }
                                );
                            },
                            1000
                        );

                    return () =>
                        clearInterval(id);
                },
                [step]
            );

            const current =
                steps[step];

            const locked =
                seconds > 0;

            const finalStep =
                step ===
                steps.length - 1;

            const primaryButton = {
                minWidth: "138px",
                minHeight: "44px",
                padding: "10px 18px",
                border:
                    locked
                        ? "1px solid #353d4d"
                        : "1px solid #887dff",
                borderRadius: "11px",
                background:
                    locked
                        ? "#242a35"
                        : "#7568ff",
                color:
                    locked
                        ? "#99a3b3"
                        : "#ffffff",
                fontWeight: 900,
                fontSize: "13px",
                cursor:
                    locked
                        ? "not-allowed"
                        : "pointer",
                opacity:
                    locked
                        ? 0.9
                        : 1,
                boxShadow:
                    locked
                        ? "none"
                        : "0 8px 24px rgba(117,104,255,.28)"
            };

            const secondaryButton = {
                minHeight: "44px",
                padding: "10px 16px",
                border:
                    "1px solid #343d4d",
                borderRadius: "11px",
                background:
                    "#1a202a",
                color:
                    "#e5eaf2",
                fontSize: "13px",
                fontWeight: 850,
                cursor: "pointer"
            };

            return React.createElement(
                "div",
                {
                    style: {
                        position: "fixed",
                        inset: 0,
                        zIndex: 100000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "24px",
                        boxSizing: "border-box",
                        background:
                            "rgba(3,5,10,.88)"
                    }
                },

                React.createElement(
                    "div",
                    {
                        style: {
                            width:
                                "min(680px, 100%)",
                            maxHeight:
                                "calc(100vh - 48px)",
                            overflow: "auto",
                            border:
                                "1px solid #343d4d",
                            borderRadius: "20px",
                            background:
                                "#11151d",
                            color:
                                "#f4f7fb",
                            boxShadow:
                                "0 28px 90px rgba(0,0,0,.68)"
                        }
                    },

                    React.createElement(
                        "div",
                        {
                            style: {
                                padding:
                                    "22px 24px 18px",
                                borderBottom:
                                    "1px solid #29313f",
                                background:
                                    "#151a23"
                            }
                        },

                        React.createElement(
                            "div",
                            {
                                style: {
                                    display: "flex",
                                    justifyContent:
                                        "space-between",
                                    alignItems:
                                        "center",
                                    gap: "16px"
                                }
                            },

                            React.createElement(
                                "div",
                                null,

                                React.createElement(
                                    "div",
                                    {
                                        style: {
                                            color:
                                                "#9187ff",
                                            fontSize: "11px",
                                            fontWeight: 900,
                                            letterSpacing:
                                                "1px",
                                            marginBottom:
                                                "7px"
                                        }
                                    },
                                    current.eyebrow
                                ),

                                React.createElement(
                                    "div",
                                    {
                                        style: {
                                            color:
                                                "#f7f9fc",
                                            fontSize: "22px",
                                            lineHeight: 1.2,
                                            fontWeight: 900
                                        }
                                    },
                                    current.title
                                )
                            ),

                            React.createElement(
                                "button",
                                {
                                    type: "button",
                                    onClick: close,
                                    style: {
                                        width: "34px",
                                        height: "34px",
                                        border:
                                            "1px solid #343d4d",
                                        borderRadius:
                                            "9px",
                                        background:
                                            "#1b212b",
                                        color:
                                            "#bcc5d3",
                                        cursor: "pointer",
                                        fontSize: "18px"
                                    }
                                },
                                "×"
                            )
                        ),

                        React.createElement(
                            "div",
                            {
                                style: {
                                    marginTop: "16px"
                                }
                            },

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        display: "flex",
                                        justifyContent:
                                            "space-between",
                                        alignItems:
                                            "center",
                                        marginBottom:
                                            "8px"
                                    }
                                },

                                React.createElement(
                                    "span",
                                    {
                                        style: {
                                            color:
                                                "#8994a6",
                                            fontSize:
                                                "11px",
                                            fontWeight:
                                                800
                                        }
                                    },
                                    `Etapa ${step + 1} de ${steps.length}`
                                ),

                                React.createElement(
                                    "span",
                                    {
                                        style: {
                                            color:
                                                "#c9d0dc",
                                            fontSize:
                                                "11px",
                                            fontWeight:
                                                900
                                        }
                                    },
                                    `${Math.round(((step + 1) / steps.length) * 100)}%`
                                )
                            ),

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        display: "flex",
                                        gap: "6px"
                                    }
                                },
                                ...steps.map(
                                    (_, index) =>
                                        React.createElement(
                                            "span",
                                            {
                                                key: index,
                                                style: {
                                                    height: "5px",
                                                    flex: 1,
                                                    borderRadius:
                                                        "999px",
                                                    background:
                                                        index <=
                                                        step
                                                            ? "#7568ff"
                                                            : "#29313f"
                                                }
                                            }
                                        )
                                )
                            )
                        )
                    ),

                    React.createElement(
                        "div",
                        {
                            style: {
                                padding: "24px"
                            }
                        },

                        React.createElement(
                            "div",
                            {
                                style: {
                                    color:
                                        "#c8d0dc",
                                    fontSize: "14px",
                                    lineHeight: 1.65,
                                    marginBottom:
                                        "20px",
                                    padding:
                                        "13px 14px",
                                    border:
                                        "1px solid #28313f",
                                    borderRadius:
                                        "12px",
                                    background:
                                        "#151b24"
                                }
                            },
                            current.text
                        ),

                        React.createElement(
                            "div",
                            {
                                style: {
                                    display: "grid",
                                    gap: "10px"
                                }
                            },
                            ...current.points.map(
                                (point, index) =>
                                    React.createElement(
                                        "div",
                                        {
                                            key: index,
                                            style: {
                                                display: "grid",
                                                gridTemplateColumns:
                                                    "28px 1fr",
                                                gap: "10px",
                                                alignItems:
                                                    "start",
                                                padding:
                                                    "13px 14px",
                                                border:
                                                    "1px solid #2b3442",
                                                borderRadius:
                                                    "12px",
                                                background:
                                                    "#181e28"
                                            }
                                        },

                                        React.createElement(
                                            "div",
                                            {
                                                style: {
                                                    width: "28px",
                                                    height: "28px",
                                                    borderRadius:
                                                        "8px",
                                                    display: "flex",
                                                    alignItems:
                                                        "center",
                                                    justifyContent:
                                                        "center",
                                                    background:
                                                        "rgba(117,104,255,.14)",
                                                    border:
                                                        "1px solid rgba(117,104,255,.24)",
                                                    color:
                                                        "#958cff",
                                                    fontSize:
                                                        "12px",
                                                    fontWeight:
                                                        900
                                                }
                                            },
                                            String(index + 1)
                                        ),

                                        React.createElement(
                                            "div",
                                            {
                                                style: {
                                                    color:
                                                        "#e7ebf2",
                                                    fontSize:
                                                        "13px",
                                                    lineHeight:
                                                        1.5,
                                                    fontWeight:
                                                        650
                                                }
                                            },
                                            point
                                        )
                                    )
                            )
                        ),

                        React.createElement(
                            "div",
                            {
                                style: {
                                    marginTop: "18px",
                                    padding:
                                        "12px 14px",
                                    borderRadius:
                                        "12px",
                                    border:
                                        locked
                                            ? "1px solid rgba(242,189,85,.32)"
                                            : "1px solid rgba(82,210,115,.32)",
                                    background:
                                        locked
                                            ? "rgba(242,189,85,.10)"
                                            : "rgba(82,210,115,.10)",
                                    color:
                                        locked
                                            ? "#f2bd55"
                                            : "#52d273",
                                    fontSize: "12px",
                                    fontWeight: 850
                                }
                            },
                            locked
                                ? `⏱ Leia esta etapa com calma • Próximo libera em ${seconds}s`
                                : (
                                    finalStep
                                        ? "✓ Etapa concluída • você já pode confirmar."
                                        : "✓ Etapa concluída • você já pode continuar."
                                )
                        )
                    ),

                    React.createElement(
                        "div",
                        {
                            style: {
                                padding:
                                    "16px 24px",
                                borderTop:
                                    "1px solid #29313f",
                                display: "flex",
                                justifyContent:
                                    "space-between",
                                alignItems:
                                    "center",
                                gap: "12px",
                                position:
                                    "sticky",
                                bottom:
                                    0,
                                background:
                                    "#151a23"
                            }
                        },

                        React.createElement(
                            "button",
                            {
                                type: "button",
                                style:
                                    secondaryButton,
                                onClick:
                                    () => {
                                        if (
                                            step > 0
                                        ) {
                                            setStep(
                                                value =>
                                                    value - 1
                                            );
                                        } else {
                                            close();
                                        }
                                    }
                            },
                            step > 0
                                ? "← Voltar"
                                : "Cancelar"
                        ),

                        React.createElement(
                            "button",
                            {
                                type: "button",
                                disabled: locked,
                                style:
                                    primaryButton,
                                onClick:
                                    async () => {
                                        if (locked) {
                                            return;
                                        }

                                        if (
                                            !finalStep
                                        ) {
                                            setStep(
                                                value =>
                                                    value + 1
                                            );
                                            return;
                                        }

                                        if (review) {
                                            close();
                                            return;
                                        }

                                        await plugin.finishActivationTutorial(
                                            close
                                        );
                                    }
                            },
                            locked
                                ? `Aguarde ${seconds}s`
                                : (
                                    finalStep
                                        ? (
                                            review
                                                ? "Concluir revisão"
                                                : "Ativar e reiniciar"
                                        )
                                        : "Próximo →"
                                )
                        )
                    )
                )
            );
        }

        const element =
            React.createElement(
                Tutorial
            );

        if (
            ReactDOM &&
            typeof ReactDOM.createRoot ===
                "function"
        ) {
            root =
                ReactDOM.createRoot(
                    host
                );

            root.render(
                element
            );
        } else if (
            ReactDOM &&
            typeof ReactDOM.render ===
                "function"
        ) {
            ReactDOM.render(
                element,
                host
            );
        } else {
            host.remove();

            BdApi.UI.alert(
                PLUGIN_NAME,
                "Não consegui abrir o tutorial nesta versão do BetterDiscord."
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
        const singBoxTail = this.tailLog(this.singBoxLogPath, 160);
        const singBoxBootstrapTail = this.tailLog(this.singBoxBootstrapLogPath, 120);
        const singBoxRunnerTail = this.tailLog(this.singBoxRunnerLogPath, 120);
        const singBoxInstallStatus = this.readSingBoxInstallStatus();
        const singBoxProxyHealth = this.getSingBoxProxyHealth();

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
            "== SING-BOX / TUN ==",
            JSON.stringify(
                singBoxInstallStatus || {},
                null,
                2
            ),
            "",
            "== PROXY HEALTH ==",
            JSON.stringify(
                singBoxProxyHealth || {},
                null,
                2
            ),
            "",
            "== SING-BOX COMANDO ==",
            (() => {
                try {
                    return fs.readFileSync(
                        this.singBoxCommandResultPath,
                        "utf8"
                    ).replace(/^\uFEFF/, "");
                } catch {
                    return "(nenhum resultado ainda)";
                }
            })(),
            "",
            "== SING-BOX LOG (últimas 160) ==",
            ...(singBoxTail.length
                ? singBoxTail
                : ["(vazio)"]),
            "",
            "== SING-BOX BOOTSTRAP LOG (últimas 120) ==",
            ...(singBoxBootstrapTail.length
                ? singBoxBootstrapTail
                : ["(vazio)"]),
            "",
            "== SING-BOX RUNNER LOG (últimas 120) ==",
            ...(singBoxRunnerTail.length
                ? singBoxRunnerTail
                : ["(vazio)"]),
            "",
            "NOTA v2.0.9:",
            "O modo padrão é DIRECT-FIRST: sem Tor, proxy pública, WireGuard ou TUN enquanto a mídia direta estiver saudável.",
            "O sing-box fica preparado apenas como fallback. Quando acionado, somente Discord.exe/DiscordCanary.exe/DiscordPTB.exe usam a SOCKS5.",
            "O fallback automático só aceita uma saída depois de receber resposta UDP real via SOCKS5 UDP ASSOCIATE e validar TLS no Gateway.",
            "A v2.0.9 remove os ícones do Settings pós-ativação e deixa os cards/controles mais limpos, mantendo os logs persistentes com abas."
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
            "Go Live De Queijo v2.0.9",
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
            lines.push(
                `networkMode: ${status.networkMode || "singbox"}`
            );
            lines.push(
                `singBoxReady: ${status.singBoxReady ?? false}`
            );
            lines.push(
                `singBoxRunning: ${status.singBoxRunning ?? false}`
            );
            lines.push(
                `singBoxPid: ${status.singBoxPid ?? "-"}`
            );
            lines.push(
                `tunUp: ${status.singBoxTunUp ?? false}`
            );
            lines.push(
                `tunName: ${status.singBoxTunName || "-"}`
            );
            lines.push(
                `taskState: ${status.singBoxTaskState || "-"}`
            );
            lines.push(
                `singBoxVersion: ${status.singBoxVersion || "-"}`
            );
            lines.push(
                `powershellPath: ${status.powershellPath || "-"}`
            );
            lines.push(
                `proxy selecionada: ${status.singBoxProxy || "-"}`
            );
            lines.push(
                `proxy país: ${status.autoProxyCountry || "-"}`
            );
            lines.push(
                `proxy UDP validado: ${status.autoProxyUdpOk ?? false}`
            );
            lines.push(
                `UDP RTT: ${status.autoProxyUdpMs ?? "-"} ms`
            );
            lines.push(
                `Gateway TLS: ${status.autoProxyGatewayMs ?? "-"} ms`
            );
            lines.push(
                `perfil: ${status.autoProxyProfile || "NEAR-FIRST GLOBAL"}`
            );
            lines.push(
                `proxies testadas: ${status.autoProxyTested ?? 0}`
            );
            lines.push(
                `cache melhores: ${status.autoBestCacheCount ?? 0}`
            );
            lines.push(
                `cache usado: ${status.autoProxyFromBestCache ?? false}`
            );
            lines.push(
                `melhor durante busca: ${status.autoProxyBestCountry || "-"} ${status.autoProxyBestUdpMs ?? "-"} ms`
            );
            lines.push(
                `tempo de busca: ${status.autoProxySearchElapsedMs ?? 0} ms`
            );
            lines.push(
                `catálogo total: ${status.autoCatalogCount ?? 0}`
            );
            lines.push(
                `catálogo conhecidos por país: ${status.autoCatalogKnownCountry ?? 0}`
            );
            lines.push(
                `workers paralelos: ${status.autoProxyWorkers ?? 0}`
            );
            lines.push(
                `fila atual: ${status.autoProxyCurrentTier || "-"}`
            );
            lines.push(
                `fresh reset startup: ${status.startupFreshReset ?? false}`
            );
            lines.push(
                `JSONs removidos no startup: ${status.startupResetDeleted ?? 0}`
            );
            lines.push(
                `sing-box residual encerrado: ${status.staleSingBoxStopped ?? false}`
            );
            lines.push(
                `TUN residual após reset: ${status.staleTunAfterReset ?? false}`
            );
            lines.push(
                `media atual: ${status.directMediaType || "-"}`
            );
            lines.push(
                `RTT direto da mídia: ${status.directMediaRttMs ?? "-"} ms`
            );
            lines.push(
                `jitter direto: ${status.directMediaJitterMs ?? "-"} ms`
            );
            lines.push(
                `loss direto: ${status.directMediaLossPct ?? "-"}%`
            );
            lines.push(
                `route race: ${status.routeRaceState || "-"}`
            );
            lines.push(
                `melhor rota preparada: ${status.routeBestCountry || "-"} ${status.routeBestAvgMs ?? "-"} ms`
            );
            lines.push(
                `jitter da rota: ${status.routeBestJitterMs ?? "-"} ms`
            );
            lines.push(
                `loss da rota: ${status.routeBestLossPct ?? "-"}%`
            );
            lines.push(
                `score da rota: ${status.routeBestScore ?? "-"}`
            );
            lines.push(
                `best-routes persistentes: ${status.routeMemoryCount ?? 0}`
            );
            lines.push(
                `dataset remoto: ${status.remoteRouteDatasetLoaded ?? false}`
            );
            lines.push(
                `formato dataset: ${status.remoteRouteDatasetFormat || "-"}`
            );
            lines.push(
                `dataset via cache: ${status.remoteRouteDatasetFromCache ?? false}`
            );
            lines.push(
                `rotas no dataset: ${status.remoteRouteDatasetCount ?? 0}`
            );
            lines.push(
                `URL dataset: ${status.remoteRouteDatasetUrl || "-"}`
            );
            lines.push(
                `fontes carregadas: ${status.autoSourceCount ?? 0}`
            );
            lines.push(
                `shards próximos carregados: ${status.autoCountryShardLoaded ?? 0}`
            );
            lines.push(
                `não testadas na fila: ${status.autoUntestedCount ?? 0}`
            );
            lines.push(
                `falhas recentes adiadas: ${status.autoDeferredFailureCount ?? 0}`
            );
            lines.push(
                `bootstrapState: ${status.singBoxBootstrapState || "-"}`
            );
            lines.push(
                `bootstrapError: ${status.singBoxBootstrapError || "-"}`
            );
            lines.push(
                `directFallback: ${status.directFallback ?? false}`
            );
            lines.push(
                `directReason: ${status.directReason || "-"}`
            );
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
            `renderer log: ${this.rendererLogPath}`,
            `best proxies: ${this.bestProxyCachePath}`,
            `proxy catalog: ${this.proxyCatalogPath}`,
            `best routes: ${this.bestRoutesPath}`,
            `routes JSON cache: ${this.remoteRoutesJsonCachePath}`,
            `routes TXT cache: ${this.remoteRoutesTxtCachePath}`
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
        const React =
            BdApi.React;

        const plugin =
            this;

        function Panel() {
            const [
                tick,
                setTick
            ] =
                React.useState(
                    0
                );

            const [
                logsOpen,
                setLogsOpen
            ] =
                React.useState(
                    false
                );

            const [
                logTab,
                setLogTab
            ] =
                React.useState(
                    "native"
                );

            React.useEffect(
                () => {
                    const id =
                        setInterval(
                            () => {
                                setTick(
                                    value =>
                                        value +
                                        1
                                );
                            },
                            1500
                        );

                    return () =>
                        clearInterval(
                            id
                        );
                },
                []
            );

            const consent =
                plugin.readConsentConfig();

            const accepted =
                consent.setupAccepted ===
                true;

            const enabled =
                accepted &&
                consent.enabled ===
                    true;

            const status =
                plugin.readNativeStatus() ||
                {};

            const sing =
                plugin.readSingBoxInstallStatus() ||
                {};

            const runtime =
                plugin.isNativeRuntimeLoaded() ||
                status?.hookLoaded ===
                    true;

            const tunUp =
                status?.singBoxTunUp ===
                    true ||
                sing?.tunUp ===
                    true;

            const direct =
                String(
                    status?.networkMode ||
                    plugin.settings.networkMode ||
                    ""
                )
                    .toLowerCase()
                    .startsWith(
                        "direct-first"
                    );

            const C = {
                panel:
                    "#11151d",
                panel2:
                    "#151a23",
                card:
                    "#181e28",
                card2:
                    "#1c2330",
                border:
                    "#2b3442",
                border2:
                    "#394456",
                text:
                    "#f4f7fb",
                soft:
                    "#c6ceda",
                muted:
                    "#8f9aab",
                accent:
                    "#7568ff",
                accent2:
                    "#948bff",
                accentSoft:
                    "rgba(117,104,255,.13)",
                green:
                    "#4fd17c",
                greenSoft:
                    "rgba(79,209,124,.10)",
                yellow:
                    "#f2bd55",
                yellowSoft:
                    "rgba(242,189,85,.10)",
                red:
                    "#ff6b72",
                redSoft:
                    "rgba(255,107,114,.10)"
            };

            let badge =
                "AGUARDANDO ATIVAÇÃO";

            let badgeColor =
                C.yellow;

            let badgeBackground =
                C.yellowSoft;

            if (
                accepted &&
                !enabled
            ) {
                badge =
                    "PAUSADO";

                badgeColor =
                    C.muted;

                badgeBackground =
                    "#1d232d";
            } else if (
                enabled &&
                status?.directRemoteFirstFrame ===
                    true
            ) {
                badge =
                    "LIVE RECEBIDA";

                badgeColor =
                    C.green;

                badgeBackground =
                    C.greenSoft;
            } else if (
                enabled &&
                status?.directOutboundActive ===
                    true
            ) {
                badge =
                    status?.directMediaType ===
                        "camera"
                        ? "CÂMERA ATIVA"
                        : "GOLIVE ATIVO";

                badgeColor =
                    C.green;

                badgeBackground =
                    C.greenSoft;
            } else if (
                enabled &&
                status?.state ===
                    "auto-proxy-search"
            ) {
                badge =
                    "BUSCANDO FALLBACK";

                badgeColor =
                    C.yellow;

                badgeBackground =
                    C.yellowSoft;
            } else if (
                enabled &&
                direct
            ) {
                badge =
                    "DIRECT";

                badgeColor =
                    C.green;

                badgeBackground =
                    C.greenSoft;
            } else if (
                enabled
            ) {
                badge =
                    "PREPARANDO";

                badgeColor =
                    C.yellow;

                badgeBackground =
                    C.yellowSoft;
            }

            const root = {
                width:
                    "100%",
                maxWidth:
                    "920px",
                padding:
                    "18px",
                boxSizing:
                    "border-box",
                display:
                    "flex",
                flexDirection:
                    "column",
                gap:
                    "12px",
                color:
                    C.text
            };

            const card = {
                padding:
                    "16px",
                borderRadius:
                    "15px",
                border:
                    `1px solid ${C.border}`,
                background:
                    C.panel2,
                boxSizing:
                    "border-box"
            };

            const eyebrow = {
                color:
                    C.muted,
                fontSize:
                    "10px",
                fontWeight:
                    900,
                letterSpacing:
                    "1px",
                textTransform:
                    "uppercase"
            };

            const sectionTitle = {
                marginTop:
                    "5px",
                color:
                    C.text,
                fontSize:
                    "16px",
                fontWeight:
                    900
            };

            const sectionHint = {
                marginTop:
                    "4px",
                color:
                    C.muted,
                fontSize:
                    "11px",
                lineHeight:
                    1.45
            };

            const buttonStyle =
                (
                    kind =
                        "secondary"
                ) => {
                    const map = {
                        primary: {
                            background:
                                C.accent,
                            border:
                                `1px solid ${C.accent2}`,
                            color:
                                "#ffffff",
                            boxShadow:
                                "0 7px 20px rgba(117,104,255,.20)"
                        },
                        success: {
                            background:
                                "#238d55",
                            border:
                                "1px solid #35ad6d",
                            color:
                                "#ffffff",
                            boxShadow:
                                "0 7px 20px rgba(35,141,85,.18)"
                        },
                        danger: {
                            background:
                                C.redSoft,
                            border:
                                "1px solid rgba(255,107,114,.40)",
                            color:
                                "#ff9398"
                        },
                        secondary: {
                            background:
                                C.card,
                            border:
                                `1px solid ${C.border2}`,
                            color:
                                C.soft
                        }
                    };

                    return Object.assign(
                        {
                            minHeight:
                                "38px",
                            padding:
                                "9px 13px",
                            borderRadius:
                                "10px",
                            fontSize:
                                "12px",
                            fontWeight:
                                850,
                            cursor:
                                "pointer",
                            transition:
                                "transform .12s ease, opacity .12s ease"
                        },
                        map[
                            kind
                        ] ||
                        map.secondary
                    );
                };

            const metric =
                (
                    title,
                    value,
                    detail,
                    tone =
                        "accent"
                ) =>
                    React.createElement(
                        "div",
                        {
                            style: {
                                padding:
                                    "13px 14px",
                                borderRadius:
                                    "12px",
                                border:
                                    `1px solid ${C.border}`,
                                background:
                                    C.card,
                                minWidth:
                                    0
                            }
                        },

                        React.createElement(
                            "div",
                            {
                                style: {
                                    minWidth:
                                        0
                                }
                            },

                            React.createElement(
                                "div",
                                {
                                    style:
                                        eyebrow
                                },
                                title
                            ),

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        marginTop:
                                            "5px",
                                        color:
                                            C.text,
                                        fontSize:
                                            "14px",
                                        fontWeight:
                                            900,
                                        overflowWrap:
                                            "anywhere"
                                    }
                                },
                                value
                            ),

                            detail
                                ? React.createElement(
                                    "div",
                                    {
                                        style: {
                                            marginTop:
                                                "4px",
                                            color:
                                                C.muted,
                                            fontSize:
                                                "10px",
                                            lineHeight:
                                                1.35
                                        }
                                    },
                                    detail
                                )
                                : null
                        )
                    );

            const Toggle =
                (
                    value,
                    onChange
                ) =>
                    React.createElement(
                        "button",
                        {
                            type:
                                "button",
                            onClick:
                                () =>
                                    onChange(
                                        !value
                                    ),
                            style: {
                                width:
                                    "58px",
                                height:
                                    "30px",
                                padding:
                                    "3px",
                                display:
                                    "flex",
                                alignItems:
                                    "center",
                                justifyContent:
                                    value
                                        ? "flex-end"
                                        : "flex-start",
                                borderRadius:
                                    "999px",
                                border:
                                    value
                                        ? "1px solid rgba(79,209,124,.58)"
                                        : `1px solid ${C.border2}`,
                                background:
                                    value
                                        ? C.greenSoft
                                        : "#202630",
                                cursor:
                                    "pointer",
                                boxSizing:
                                    "border-box"
                            }
                        },

                        React.createElement(
                            "span",
                            {
                                style: {
                                    width:
                                        "22px",
                                    height:
                                        "22px",
                                    borderRadius:
                                        "999px",
                                    display:
                                        "flex",
                                    alignItems:
                                        "center",
                                    justifyContent:
                                        "center",
                                    background:
                                        value
                                            ? C.green
                                            : "#687385",
                                    color:
                                        value
                                            ? "#0d1b13"
                                            : "#d8dee7",
                                    fontSize:
                                        "9px",
                                    fontWeight:
                                        950,
                                    boxShadow:
                                        "0 2px 8px rgba(0,0,0,.28)"
                                }
                            },
                            value
                                ? "ON"
                                : ""
                        )
                    );

            const configRow =
                (
                    title,
                    hint,
                    control,
                    last =
                        false
                ) =>
                    React.createElement(
                        "div",
                        {
                            style: {
                                display:
                                    "grid",
                                gridTemplateColumns:
                                    "minmax(0,1fr) auto",
                                gap:
                                    "18px",
                                alignItems:
                                    "center",
                                padding:
                                    "14px 0",
                                borderBottom:
                                    last
                                        ? "0"
                                        : `1px solid ${C.border}`
                            }
                        },

                        React.createElement(
                            "div",
                            {
                                style: {
                                    minWidth:
                                        0
                                }
                            },

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        color:
                                            C.text,
                                        fontSize:
                                            "13px",
                                        fontWeight:
                                            850
                                    }
                                },
                                title
                            ),

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        marginTop:
                                            "3px",
                                        color:
                                            C.muted,
                                        fontSize:
                                            "11px",
                                        lineHeight:
                                            1.4
                                    }
                                },
                                hint
                            )
                        ),

                        control
                    );

            const save =
                (
                    key,
                    value,
                    repatch =
                        false
                ) => {
                    plugin.settings[
                        key
                    ] =
                        value;

                    plugin.saveSettingsAndNativeConfig();

                    if (
                        repatch
                    ) {
                        plugin.restartPatches();
                    }

                    setTick(
                        value =>
                            value +
                            1
                    );
                };

            const logSources = {
                native: {
                    label:
                        "Native",
                    text:
                        plugin.tailLog(
                            plugin.nativeLogPath,
                            120
                        ).join(
                            "\n"
                        ) ||
                        "(sem eventos)"
                },
                renderer: {
                    label:
                        "Renderer",
                    text:
                        plugin.tailLog(
                            plugin.rendererLogPath,
                            120
                        ).join(
                            "\n"
                        ) ||
                        "(sem eventos)"
                },
                singbox: {
                    label:
                        "Sing-box",
                    text:
                        plugin.tailLog(
                            plugin.singBoxLogPath,
                            120
                        ).join(
                            "\n"
                        ) ||
                        "(sem eventos)"
                },
                runner: {
                    label:
                        "Runner",
                    text:
                        plugin.tailLog(
                            plugin.singBoxRunnerLogPath,
                            100
                        ).join(
                            "\n"
                        ) ||
                        "(sem eventos)"
                }
            };

            const currentLog =
                logSources[
                    logTab
                ] ||
                logSources.native;

            const routeValue =
                tunUp
                    ? (
                        status?.singBoxTunName ||
                        "GoLiveDeQueijo"
                    )
                    : "DIRECT";

            const fallbackValue =
                status?.singBoxProxy
                    ? `${status.autoProxyCountry || "?"} • ${status.autoProxyUdpMs ?? "?"}ms`
                    : status?.routeBestAvgMs
                        ? `${status.routeBestCountry || "?"} • ${status.routeBestAvgMs}ms`
                        : "Em espera";

            const mediaValue =
                status?.directMediaType ===
                    "camera"
                    ? "Câmera"
                    : status?.directMediaType ===
                        "golive"
                        ? "Go Live"
                        : "Em espera";

            return React.createElement(
                "div",
                {
                    style:
                        root
                },

                React.createElement(
                    "div",
                    {
                        style: Object.assign(
                            {},
                            card,
                            {
                                display:
                                    "grid",
                                gridTemplateColumns:
                                    "minmax(0,1fr) auto",
                                gap:
                                    "14px",
                                alignItems:
                                    "center",
                                background:
                                    C.panel
                            }
                        )
                    },

                    React.createElement(
                        "div",
                        {
                            style: {
                                minWidth:
                                    0
                            }
                        },

                        React.createElement(
                            "div",
                            {
                                style: {
                                    display:
                                        "flex",
                                    alignItems:
                                        "center",
                                    gap:
                                        "9px",
                                    flexWrap:
                                        "wrap"
                                }
                            },

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        color:
                                            C.text,
                                        fontSize:
                                            "19px",
                                        fontWeight:
                                            950
                                    }
                                },
                                "Go Live De Queijo"
                            ),

                            React.createElement(
                                "span",
                                {
                                    style: {
                                        padding:
                                            "4px 8px",
                                        borderRadius:
                                            "999px",
                                        background:
                                            C.accentSoft,
                                        border:
                                            "1px solid rgba(117,104,255,.24)",
                                        color:
                                            C.accent2,
                                        fontSize:
                                            "10px",
                                        fontWeight:
                                            900
                                    }
                                },
                                `v${PLUGIN_VERSION}`
                            )
                        ),

                        React.createElement(
                            "div",
                            {
                                style: {
                                    marginTop:
                                        "5px",
                                    color:
                                        C.muted,
                                    fontSize:
                                        "11px"
                                }
                            },
                            "Go Live, câmera e fallback de rede."
                        )
                    ),

                    React.createElement(
                        "span",
                        {
                            style: {
                                padding:
                                    "7px 10px",
                                borderRadius:
                                    "999px",
                                background:
                                    badgeBackground,
                                border:
                                    `1px solid ${badgeColor}`,
                                color:
                                    badgeColor,
                                fontSize:
                                    "10px",
                                fontWeight:
                                    950,
                                letterSpacing:
                                    ".5px",
                                whiteSpace:
                                    "nowrap"
                            }
                        },
                        badge
                    )
                ),

                React.createElement(
                    "div",
                    {
                        style:
                            card
                    },

                    React.createElement(
                        "div",
                        {
                            style: {
                                display:
                                    "grid",
                                gridTemplateColumns:
                                    "minmax(0,1fr) auto",
                                gap:
                                    "14px",
                                alignItems:
                                    "center"
                            }
                        },

                        React.createElement(
                            "div",
                            null,

                            React.createElement(
                                "div",
                                {
                                    style:
                                        eyebrow
                                },
                                "Ativação"
                            ),

                            React.createElement(
                                "div",
                                {
                                    style:
                                        sectionTitle
                                },
                                !accepted
                                    ? "Configuração necessária"
                                    : enabled
                                        ? "Integração ativada"
                                        : "Integração pausada"
                            ),

                            React.createElement(
                                "div",
                                {
                                    style:
                                        sectionHint
                                },
                                !accepted
                                    ? "O plugin fica parado até você concluir o tutorial."
                                    : enabled
                                        ? `Aceite salvo${consent.acceptedAt ? " em " + new Date(consent.acceptedAt).toLocaleString() : ""}.`
                                        : "O aceite continua salvo; você pode reativar sem repetir o tutorial."
                            )
                        ),

                        React.createElement(
                            "div",
                            {
                                style: {
                                    display:
                                        "flex",
                                    gap:
                                        "8px",
                                    flexWrap:
                                        "wrap",
                                    justifyContent:
                                        "flex-end"
                                }
                            },

                            !accepted
                                ? React.createElement(
                                    "button",
                                    {
                                        type:
                                            "button",
                                        style:
                                            buttonStyle(
                                                "primary"
                                            ),
                                        onClick:
                                            () =>
                                                plugin.openActivationTutorial()
                                    },
                                    "Ativar Go Live De Queijo"
                                )
                                : enabled
                                    ? React.createElement(
                                        React.Fragment,
                                        null,

                                        React.createElement(
                                            "button",
                                            {
                                                type:
                                                    "button",
                                                style:
                                                    buttonStyle(
                                                        "secondary"
                                                    ),
                                                onClick:
                                                    () =>
                                                        plugin.openActivationTutorial({
                                                            review:
                                                                true
                                                        })
                                            },
                                            "Rever explicação"
                                        ),

                                        React.createElement(
                                            "button",
                                            {
                                                type:
                                                    "button",
                                                style:
                                                    buttonStyle(
                                                        "secondary"
                                                    ),
                                                onClick:
                                                    () =>
                                                        plugin.confirmDisableIntegration()
                                            },
                                            "Pausar"
                                        )
                                    )
                                    : React.createElement(
                                        React.Fragment,
                                        null,

                                        React.createElement(
                                            "button",
                                            {
                                                type:
                                                    "button",
                                                style:
                                                    buttonStyle(
                                                        "success"
                                                    ),
                                                onClick:
                                                    () =>
                                                        plugin.enableFromSavedConsent()
                                            },
                                            "Ativar e reiniciar"
                                        ),

                                        React.createElement(
                                            "button",
                                            {
                                                type:
                                                    "button",
                                                style:
                                                    buttonStyle(
                                                        "secondary"
                                                    ),
                                                onClick:
                                                    () =>
                                                        plugin.openActivationTutorial({
                                                            review:
                                                                true
                                                        })
                                            },
                                            "Rever explicação"
                                        )
                                    )
                        )
                    )
                ),

                enabled
                    ? React.createElement(
                        React.Fragment,
                        null,

                        React.createElement(
                            "div",
                            {
                                style:
                                    card
                            },

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        marginBottom:
                                            "12px"
                                    }
                                },

                                React.createElement(
                                    "div",
                                    {
                                        style:
                                            eyebrow
                                    },
                                    "Status da rede"
                                ),

                                React.createElement(
                                    "div",
                                    {
                                        style:
                                            sectionTitle
                                    },
                                    "Rota do Discord"
                                )
                            ),

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        display:
                                            "grid",
                                        gridTemplateColumns:
                                            "repeat(auto-fit, minmax(150px, 1fr))",
                                        gap:
                                            "9px"
                                    }
                                },

                                metric(
                                    "Rota",
                                    routeValue,
                                    direct
                                        ? "DIRECT-FIRST"
                                        : null,
                                    direct
                                        ? "green"
                                        : "accent"
                                ),

                                metric(
                                    "Fallback",
                                    fallbackValue,
                                    status?.routeRaceState
                                        ? `Race: ${status.routeRaceState}`
                                        : null,
                                    "accent"
                                ),

                                metric(
                                    "Runtime",
                                    runtime
                                        ? "Carregado"
                                        : "Aguardando",
                                    sing?.processRunning
                                        ? "sing-box ativo"
                                        : "sing-box parado",
                                    runtime
                                        ? "green"
                                        : "yellow"
                                ),

                                metric(
                                    "Mídia",
                                    mediaValue,
                                    status?.directMediaRttMs
                                        ? `RTT ${status.directMediaRttMs}ms`
                                        : null,
                                    status?.directMediaType
                                        ? "green"
                                        : "accent"
                                )
                            )
                        ),

                        React.createElement(
                            "div",
                            {
                                style:
                                    card
                            },

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        marginBottom:
                                            "4px"
                                    }
                                },

                                React.createElement(
                                    "div",
                                    {
                                        style:
                                            eyebrow
                                    },
                                    "Configurações"
                                ),

                                React.createElement(
                                    "div",
                                    {
                                        style:
                                            sectionTitle
                                    },
                                    "Preferências"
                                ),

                                React.createElement(
                                    "div",
                                    {
                                        style:
                                            sectionHint
                                    },
                                    "Controles rápidos da integração."
                                )
                            ),

                            configRow(
                                "Região RTC forçada",
                                "Deixe vazio para o Discord escolher automaticamente.",
                                React.createElement(
                                    "div",
                                    {
                                        style: {
                                            display:
                                                "flex",
                                            alignItems:
                                                "center",
                                            gap:
                                                "7px",
                                            minWidth:
                                                "220px"
                                        }
                                    },

                                    React.createElement(
                                        "input",
                                        {
                                            value:
                                                plugin.settings.voiceRegion ||
                                                "",
                                            placeholder:
                                                "Automática",
                                            onChange:
                                                event =>
                                                    save(
                                                        "voiceRegion",
                                                        event.target.value
                                                    ),
                                            onBlur:
                                                () =>
                                                    plugin.restartPatches(),
                                            style: {
                                                width:
                                                    "170px",
                                                minHeight:
                                                    "36px",
                                                boxSizing:
                                                    "border-box",
                                                padding:
                                                    "8px 10px",
                                                borderRadius:
                                                    "9px",
                                                border:
                                                    `1px solid ${C.border2}`,
                                                background:
                                                    C.card,
                                                color:
                                                    C.text,
                                                outline:
                                                    "none",
                                                fontSize:
                                                    "11px",
                                                fontWeight:
                                                    750
                                            }
                                        }
                                    ),

                                    plugin.settings.voiceRegion
                                        ? React.createElement(
                                            "button",
                                            {
                                                type:
                                                    "button",
                                                title:
                                                    "Voltar para automático",
                                                onClick:
                                                    () =>
                                                        save(
                                                            "voiceRegion",
                                                            "",
                                                            true
                                                        ),
                                                style: {
                                                    width:
                                                        "36px",
                                                    height:
                                                        "36px",
                                                    borderRadius:
                                                        "9px",
                                                    border:
                                                        `1px solid ${C.border2}`,
                                                    background:
                                                        C.card,
                                                    color:
                                                        C.soft,
                                                    cursor:
                                                        "pointer",
                                                    fontWeight:
                                                        900
                                                }
                                            },
                                            "×"
                                        )
                                        : null
                                )
                            ),

                            configRow(
                                "Atualização automática",
                                "Verifica novas versões do plugin no GitHub.",
                                Toggle(
                                    !!plugin.settings.autoUpdate,
                                    value => {
                                        save(
                                            "autoUpdate",
                                            value
                                        );

                                        plugin.startAutoUpdater();
                                    }
                                )
                            ),

                            configRow(
                                "Instalar updates automaticamente",
                                "Quando disponível, permite substituir o arquivo do plugin automaticamente.",
                                Toggle(
                                    !!plugin.settings.autoInstallUpdates,
                                    value =>
                                        save(
                                            "autoInstallUpdates",
                                            value
                                        )
                                ),
                                true
                            )
                        )
                    )
                    : React.createElement(
                        "div",
                        {
                            style: Object.assign(
                                {},
                                card,
                                {
                                    textAlign:
                                        "center",
                                    padding:
                                        "26px 18px"
                                }
                            )
                        },

                        React.createElement(
                            "div",
                            {
                                style: {
                                    marginTop:
                                        "0",
                                    color:
                                        C.text,
                                    fontSize:
                                        "14px",
                                    fontWeight:
                                        900
                                }
                            },
                            accepted
                                ? "Integração pausada"
                                : "Configurações bloqueadas até a ativação"
                        ),

                        React.createElement(
                            "div",
                            {
                                style: {
                                    margin:
                                        "6px auto 0",
                                    maxWidth:
                                        "520px",
                                    color:
                                        C.muted,
                                    fontSize:
                                        "11px",
                                    lineHeight:
                                        1.5
                                }
                            },
                            accepted
                                ? "Reative quando quiser usar Go Live e câmera."
                                : "Conclua o tutorial para liberar rota, mídia e preferências."
                        )
                    ),

                React.createElement(
                    "div",
                    {
                        style: Object.assign(
                            {},
                            card,
                            {
                                padding:
                                    0,
                                overflow:
                                    "hidden"
                            }
                        )
                    },

                    React.createElement(
                        "button",
                        {
                            type:
                                "button",
                            onClick:
                                () =>
                                    setLogsOpen(
                                        value =>
                                            !value
                                    ),
                            style: {
                                width:
                                    "100%",
                                minHeight:
                                    "48px",
                                padding:
                                    "0 16px",
                                display:
                                    "flex",
                                alignItems:
                                    "center",
                                justifyContent:
                                    "space-between",
                                gap:
                                    "12px",
                                border:
                                    0,
                                background:
                                    C.panel2,
                                color:
                                    C.text,
                                cursor:
                                    "pointer",
                                textAlign:
                                    "left"
                            }
                        },

                        React.createElement(
                            "div",
                            {
                                style: {
                                    display:
                                        "flex",
                                    alignItems:
                                        "center",
                                    gap:
                                        "0"
                                }
                            },

                            React.createElement(
                                "div",
                                null,

                                React.createElement(
                                    "div",
                                    {
                                        style: {
                                            color:
                                                C.text,
                                            fontSize:
                                                "13px",
                                            fontWeight:
                                                900
                                        }
                                    },
                                    "Logs técnicos"
                                ),

                                React.createElement(
                                    "div",
                                    {
                                        style: {
                                            marginTop:
                                                "2px",
                                            color:
                                                C.muted,
                                            fontSize:
                                                "10px"
                                        }
                                    },
                                    "Native, Renderer, Sing-box e Runner"
                                )
                            )
                        ),

                        React.createElement(
                            "span",
                            {
                                style: {
                                    minWidth:
                                        "52px",
                                    textAlign:
                                        "right",
                                    color:
                                        C.accent2,
                                    fontSize:
                                        "10px",
                                    fontWeight:
                                        900,
                                    textTransform:
                                        "uppercase",
                                    letterSpacing:
                                        ".6px"
                                }
                            },
                            logsOpen
                                ? "Fechar"
                                : "Abrir"
                        )
                    ),

                    logsOpen
                        ? React.createElement(
                            "div",
                            {
                                style: {
                                    padding:
                                        "0 16px 16px",
                                    borderTop:
                                        `1px solid ${C.border}`,
                                    background:
                                        C.panel
                                }
                            },

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        display:
                                            "flex",
                                        gap:
                                            "7px",
                                        flexWrap:
                                            "wrap",
                                        padding:
                                            "12px 0"
                                    }
                                },
                                ...Object.entries(
                                    logSources
                                ).map(
                                    (
                                        [
                                            key,
                                            info
                                        ]
                                    ) =>
                                        React.createElement(
                                            "button",
                                            {
                                                key:
                                                    key,
                                                type:
                                                    "button",
                                                onClick:
                                                    () =>
                                                        setLogTab(
                                                            key
                                                        ),
                                                style: {
                                                    minHeight:
                                                        "32px",
                                                    padding:
                                                        "7px 10px",
                                                    borderRadius:
                                                        "9px",
                                                    border:
                                                        key ===
                                                        logTab
                                                            ? "1px solid rgba(117,104,255,.42)"
                                                            : `1px solid ${C.border}`,
                                                    background:
                                                        key ===
                                                        logTab
                                                            ? C.accentSoft
                                                            : C.card,
                                                    color:
                                                        key ===
                                                        logTab
                                                            ? C.accent2
                                                            : C.soft,
                                                    fontSize:
                                                        "10px",
                                                    fontWeight:
                                                        900,
                                                    cursor:
                                                        "pointer"
                                                }
                                            },
                                            info.label
                                        )
                                )
                            ),

                            React.createElement(
                                "div",
                                {
                                    style: {
                                        display:
                                            "flex",
                                        alignItems:
                                            "center",
                                        justifyContent:
                                            "space-between",
                                        gap:
                                            "12px",
                                        marginBottom:
                                            "8px"
                                    }
                                },

                                React.createElement(
                                    "span",
                                    {
                                        style: {
                                            color:
                                                C.muted,
                                            fontSize:
                                                "10px"
                                        }
                                    },
                                    `Atualiza automaticamente • ${currentLog.label}`
                                ),

                                React.createElement(
                                    "button",
                                    {
                                        type:
                                            "button",
                                        onClick:
                                            async () => {
                                                try {
                                                    await navigator.clipboard.writeText(
                                                        currentLog.text
                                                    );

                                                    BdApi.UI.showToast(
                                                        "Log copiado.",
                                                        {
                                                            type:
                                                                "success",
                                                            timeout:
                                                                2200
                                                        }
                                                    );
                                                } catch {
                                                    try {
                                                        DiscordNative.clipboard.copy(
                                                            currentLog.text
                                                        );
                                                    } catch {}
                                                }
                                            },
                                        style: {
                                            minHeight:
                                                "30px",
                                            padding:
                                                "6px 10px",
                                            borderRadius:
                                                "8px",
                                            border:
                                                `1px solid ${C.border2}`,
                                            background:
                                                C.card,
                                            color:
                                                C.soft,
                                            fontSize:
                                                "10px",
                                            fontWeight:
                                                850,
                                            cursor:
                                                "pointer"
                                        }
                                    },
                                    "Copiar aba"
                                )
                            ),

                            React.createElement(
                                "pre",
                                {
                                    style: {
                                        margin:
                                            0,
                                        height:
                                            "260px",
                                        overflow:
                                            "auto",
                                        padding:
                                            "12px",
                                        boxSizing:
                                            "border-box",
                                        borderRadius:
                                            "10px",
                                        border:
                                            `1px solid ${C.border}`,
                                        background:
                                            "#0d1118",
                                        color:
                                            "#dce3ed",
                                        whiteSpace:
                                            "pre-wrap",
                                        overflowWrap:
                                            "anywhere",
                                        fontFamily:
                                            "var(--font-code)",
                                        fontSize:
                                            "10px",
                                        lineHeight:
                                            1.48
                                    }
                                },
                                currentLog.text
                            )
                        )
                        : null
                ),

                React.createElement(
                    "div",
                    {
                        style:
                            card
                    },

                    React.createElement(
                        "div",
                        {
                            style: {
                                display:
                                    "grid",
                                gridTemplateColumns:
                                    "minmax(0,1fr) auto",
                                gap:
                                    "14px",
                                alignItems:
                                    "center"
                            }
                        },

                        React.createElement(
                            "div",
                            null,

                            React.createElement(
                                "div",
                                {
                                    style:
                                        eyebrow
                                },
                                "Ações"
                            ),

                            React.createElement(
                                "div",
                                {
                                    style:
                                        sectionTitle
                                },
                                "Manutenção"
                            ),

                            React.createElement(
                                "div",
                                {
                                    style:
                                        sectionHint
                                },
                                `Aceite: ${accepted ? "salvo" : "pendente"} • GoLiveBypassBD.config.json`
                            )
                        ),

                        React.createElement(
                            "div",
                            {
                                style: {
                                    display:
                                        "flex",
                                    flexWrap:
                                        "wrap",
                                    gap:
                                        "8px",
                                    justifyContent:
                                        "flex-end"
                                }
                            },

                            React.createElement(
                                "button",
                                {
                                    type:
                                        "button",
                                    style:
                                        buttonStyle(
                                            enabled
                                                ? "success"
                                                : "secondary"
                                        ),
                                    onClick:
                                        () => {
                                            if (
                                                !accepted
                                            ) {
                                                plugin.openActivationTutorial();
                                                return;
                                            }

                                            plugin.installAndRestart();
                                        }
                                },
                                enabled
                                    ? "Instalar/atualizar"
                                    : "Ativar / instalar"
                            ),

                            React.createElement(
                                "button",
                                {
                                    type:
                                        "button",
                                    style:
                                        buttonStyle(
                                            "secondary"
                                        ),
                                    onClick:
                                        () =>
                                            plugin.copyDiagnostic()
                                },
                                "Copiar diagnóstico"
                            ),

                            React.createElement(
                                "button",
                                {
                                    type:
                                        "button",
                                    style:
                                        buttonStyle(
                                            "secondary"
                                        ),
                                    onClick:
                                        () =>
                                            plugin.checkForUpdates(
                                                true
                                            )
                                },
                                "Buscar atualização"
                            ),

                            React.createElement(
                                "button",
                                {
                                    type:
                                        "button",
                                    style:
                                        buttonStyle(
                                            "danger"
                                        ),
                                    onClick:
                                        () =>
                                            plugin.confirmFullUninstall()
                                },
                                "Limpar integração"
                            )
                        )
                    )
                )
            );
        }

        return React.createElement(
            Panel
        );
    }
};
