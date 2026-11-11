# Helpers used by the installed-app updater.
# Registry uninstall values can be quoted: '"C:\Program Files\NetVera AI IDE"'.
# Treat them as filesystem paths, never shell commands.
function ConvertTo-NetVeraWindowsPath {
    [CmdletBinding()]
    param(
        [AllowNull()][AllowEmptyString()][string]$Value,
        [switch]$DisplayIcon
    )
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    $normalized = $Value.Trim()
    if ($DisplayIcon) {
        # DisplayIcon often looks like '"C:\Apps\NetVera AI IDE.exe",0'.
        $normalized = $normalized -replace ',\s*-?\d+\s*$', ''
    }
    $normalized = $normalized.Trim().Trim([char]34).Trim()
    # Require absolute drive or UNC paths; no arbitrary shell expansion.
    if ($normalized -notmatch '^(?:[A-Za-z]:\\|\\\\)') { return $null }
    return $normalized
}


# GitHub CLI emits a JSON array. Windows PowerShell 5.1 may preserve the array
# as a single pipeline value; piping the wrapper through Where-Object can select
# the whole array and concatenate every databaseId (causing GitHub HTTP 404).
# A foreach loop explicitly enumerates runs and returns ONE numeric ID.
function Get-NetVeraSuccessfulRunId {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Json,
        [Parameter(Mandatory)][string]$ExpectedSha
    )
    $runs = ConvertFrom-Json -InputObject $Json -ErrorAction Stop
    foreach ($run in $runs) {
        if ($null -eq $run) { continue }
        if ([string]$run.headSha -ne $ExpectedSha) { continue }
        if ([string]$run.conclusion -ne 'success' -or [string]$run.status -ne 'completed') { continue }
        $idText = [string]$run.databaseId
        if ($idText -notmatch '^[1-9][0-9]*$') {
            throw 'Secilen GitHub derlemesinin ID degeri gecersiz.'
        }
        return [long]$idText
    }
    return $null
}
