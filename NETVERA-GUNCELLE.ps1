# NetVera AI IDE - Update installed Windows app from verified GitHub Actions
# Requires Git and authenticated GitHub CLI (gh). Does NOT require Rust, Node, pnpm, admin shell or source rebuilds.
# Run from the cloned repository, not as a downloaded untrusted script.
[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$repo = 'fotoselloo7-ui/netvera-ai-ide'
$workflow = 'windows-preview.yml'
$artifactName = 'NetVera-AI-IDE-Windows-x64'
$repoDir = $PSScriptRoot
if (-not $repoDir -or -not (Test-Path -LiteralPath (Join-Path $repoDir '.git'))) {
    throw 'Bu betik Git ile klonlanmis NetVera-AI-IDE klasorunden calistirilmali.'
}

function Require-Tool([string]$tool, [string]$hint) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool bulunamadi. $hint"
    }
}
function Invoke-Native([string]$exe, [string[]]$arguments) {
    $output = & $exe @arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "$exe hata verdi (cikis $LASTEXITCODE): $($output -join [Environment]::NewLine)"
    }
    return ($output -join [Environment]::NewLine)
}
function Installed-AppPath {
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($root in $roots) {
        $records = @(Get-ItemProperty -Path $root -ErrorAction SilentlyContinue)
        foreach ($record in $records) {
            if ($record.DisplayName -notlike 'NetVera AI IDE*') { continue }
            if ($record.InstallLocation) {
                $candidate = Join-Path $record.InstallLocation 'NetVera AI IDE.exe'
                if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
            }
            if ($record.DisplayIcon) {
                $candidate = ($record.DisplayIcon -replace ',\d+$','').Trim('"')
                if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and
                    [IO.Path]::GetFileName($candidate) -ieq 'NetVera AI IDE.exe') { return $candidate }
            }
        }
    }
    foreach ($folder in @(
        (Join-Path $env:LOCALAPPDATA 'Programs\NetVera AI IDE'),
        (Join-Path $env:LOCALAPPDATA 'NetVera AI IDE'),
        (Join-Path $env:ProgramFiles 'NetVera AI IDE')
    )) {
        $candidate = Join-Path $folder 'NetVera AI IDE.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}
function Find-Shortcut {
    $locations = @(
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
        (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
    )
    foreach ($folder in $locations) {
        if (-not (Test-Path -LiteralPath $folder)) { continue }
        $shortcuts = @(Get-ChildItem -LiteralPath $folder -Filter '*NetVera AI IDE*.lnk' -Recurse -File -ErrorAction SilentlyContinue)
        if ($shortcuts.Count -gt 0) { return $shortcuts[0].FullName }
    }
    return $null
}
function Start-InstalledApp([string]$previousPath) {
    $installed = Installed-AppPath
    if (-not $installed -and $previousPath -and (Test-Path -LiteralPath $previousPath -PathType Leaf)) {
        $installed = $previousPath
    }
    if ($installed) {
        Write-Host "NetVera AI IDE aciliyor: $installed" -ForegroundColor Green
        Start-Process -FilePath $installed
        return
    }
    $shortcut = Find-Shortcut
    if ($shortcut) {
        Write-Host 'NetVera AI IDE Baslat menusu kisayolundan aciliyor.' -ForegroundColor Green
        Start-Process -FilePath $shortcut
        return
    }
    Write-Warning 'Kurulum tamamlandi, ancak uygulama yolu bulunamadi. Baslat menusunden NetVera AI IDE uygulamasini ac.'
}
function Close-AppSafely {
    $targets = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -ieq 'NetVera AI IDE' -or $_.ProcessName -ieq 'netvera-ai-ide'
    })
    foreach ($process in $targets) {
        $exePath = $null
        try { $exePath = $process.Path } catch {}
        if ($exePath -and $exePath -ne (Installed-AppPath)) {
            Write-Warning "Ayni isimli baska bir uygulama bulundu, kapatilmiyor: $exePath"
            continue
        }
        Write-Host 'Acik NetVera AI IDE penceresi normal yoldan kapatiliyor...'
        if (-not $process.CloseMainWindow()) {
            throw 'Acik IDE otomatik kapatilamadi. Kaydedilmemis calisman varsa kaydet; IDE yi kapatip komutu tekrar calistir.'
        }
        try { Wait-Process -Id $process.Id -Timeout 20 -ErrorAction Stop } catch {}
        $stillRunning = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($stillRunning) {
            throw 'IDE halen acik. Veriyi kaybetmemek icin zorla kapatilmadi. IDE yi kapatip tekrar dene.'
        }
    }
}

Require-Tool 'git' 'Git for Windows gerekli.'
Require-Tool 'gh' 'GitHub CLI gerekli: winget install --id GitHub.cli'
Write-Host ''
Write-Host '=== NetVera AI IDE | GitHub guncelle ve kurulu uygulamayi ac ===' -ForegroundColor Cyan
Push-Location $repoDir
try {
    $localChanges = Invoke-Native 'git' @('status', '--porcelain', '--untracked-files=no')
    if ($localChanges.Trim()) {
        throw 'Yerel kodda kaydedilmemis degisiklikler var. Git durumunu cozmeden guncellemiyorum.'
    }
    $origin = (Invoke-Native 'git' @('remote','get-url','origin')).Trim()
    if ($origin -notmatch '(?i)(github\.com[:/])fotoselloo7-ui/netvera-ai-ide(\.git)?$') {
        throw "Git remote beklenen depoya ait degil: $origin"
    }
    Write-Host '[1/5] GitHub kaynak kodu kontrol ediliyor...'
    Invoke-Native 'git' @('pull','--ff-only','origin','main') | Out-Host
    $sha = (Invoke-Native 'git' @('rev-parse','HEAD')).Trim()
    $branchName = (Invoke-Native 'git' @('branch','--show-current')).Trim()
    if ($branchName -ne 'main') { throw "Aktif dal main olmali. Mevcut dal: $branchName" }
    Write-Host "Kaynak kodu: $($sha.Substring(0,12))"

    Write-Host '[2/5] Yalnizca main dalindaki basarili Windows derlemesi araniyor...'
    $json = Invoke-Native 'gh' @(
        'run','list','--repo',$repo,'--workflow',$workflow,'--branch','main',
        '--status','success','--limit','50',
        '--json','databaseId,headSha,conclusion,status,createdAt'
    )
    $runs = @($json | ConvertFrom-Json)
    $chosen = $runs | Where-Object { $_.headSha -eq $sha -and $_.conclusion -eq 'success' } | Select-Object -First 1
    if (-not $chosen) {
        Write-Host 'Bu commit icin Windows derlemesi henuz basarili olarak tamamlanmamis.' -ForegroundColor Yellow
        Write-Host "Kontrol: https://github.com/$repo/actions/workflows/$workflow"
        throw 'Kurulu uygulamaya dokunulmadi. Derleme basarili oldugunda komutu yeniden calistir.'
    }

    $stateDir = Join-Path $env:LOCALAPPDATA 'NetVeraAIIDE\Updater'
    New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
    $stateFile = Join-Path $stateDir 'installed-commit.txt'
    $previousExe = Installed-AppPath
    if (-not $Force -and $previousExe -and (Test-Path -LiteralPath $stateFile) -and
        (Get-Content -LiteralPath $stateFile -Raw).Trim() -eq $sha) {
        Write-Host 'Bu surum zaten kurulu. Uygulama aciliyor...' -ForegroundColor Green
        Start-InstalledApp $previousExe
        exit 0
    }

    $tempDir = Join-Path $env:TEMP ("NetVeraUpdate-" + [guid]::NewGuid().ToString('N'))
    New-Item -Path $tempDir -ItemType Directory -Force | Out-Null
    try {
        Write-Host "[3/5] Dogrulanmis Actions paketi indiriliyor (run #$($chosen.databaseId))..."
        Invoke-Native 'gh' @('run','download',"$($chosen.databaseId)",'--repo',$repo,'--name',$artifactName,'--dir',$tempDir) | Out-Host
        $installers = @(Get-ChildItem -LiteralPath $tempDir -Filter '*.exe' -Recurse -File |
          Where-Object { $_.Name -match '(?i)setup\.exe$' -and $_.Name -match '(?i)netvera' })
        if ($installers.Count -ne 1) {
            throw "Beklenen tek bir NetVera NSIS kurulum dosyasi bulunamadi: $($installers.Count)"
        }

        Write-Host '[4/5] Mevcut IDE normal yoldan kapatiliyor ve guncelleniyor...'
        Close-AppSafely
        $installer = $installers[0].FullName
        Write-Host "Dogrulanan kurulum: $($installers[0].Name)"
        Write-Host 'Not: Windows UAC/SmartScreen izin isteyebilir. Guvenlik uyarisini atlamiyoruz.'
        $process = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw "Windows kurulumu basarisiz oldu (cikis kodu: $($process.ExitCode))."
        }
        Set-Content -LiteralPath $stateFile -Value $sha -Encoding ascii
    }
    finally {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host '[5/5] Guncelleme tamamlandi. Masaustu uygulamasi aciliyor.' -ForegroundColor Green
    Start-InstalledApp $previousExe
    Write-Host "Basarili guncelleme: $($sha.Substring(0,12))" -ForegroundColor Green
}
finally {
    Pop-Location
}
