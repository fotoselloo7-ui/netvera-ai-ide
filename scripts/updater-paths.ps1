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
