# dsh-opencode-sounds live acceptance script
# Checks: 1) the client bundle is served and is the current build (localStorage backend +
#            sound dropdown)
#         2) the boot graph contains the plugin entry
#         3) the host settings namespace (not exposed on rc.6; informational only)
$ErrorActionPreference = 'Stop'

Write-Host '=== 1) client bundle ==='
$c = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/plugins/dsh-opencode-sounds/client.js' -UseBasicParsing -TimeoutSec 10
$isNew = $c.Content -match 'dsh-opencode-sounds:config'
$hasSelect = $c.Content -match 'dns-notify-select'
$hasPack = $c.Content -match 'data:audio/mpeg;base64,'
Write-Host "  status=$($c.StatusCode) bytes=$($c.RawContentLength) localStorage-backend=$isNew sound-dropdown=$hasSelect embedded-pack=$hasPack"

Write-Host '=== 2) boot graph entry ==='
$p = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/' -UseBasicParsing -TimeoutSec 10
if ($p.Content -match 'dsh-opencode-sounds') { Write-Host '  boot graph includes dsh-opencode-sounds' } else { Write-Host '  boot graph MISSING dsh-opencode-sounds' }

Write-Host '=== 3) settings namespace (informational) ==='
$body = '{"type":"client-request","rpcId":"notify-verify-final","method":"settings.describe","payload":{}}'
$r = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/api/settings.describe' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 10
$json = $r.Content | ConvertFrom-Json
$ns = $json.result.value.namespaces | Where-Object { $_.ns -eq 'dsh-opencode-sounds' }
if ($ns) { Write-Host '  dsh-opencode-sounds REGISTERED (platform exposes it)' } else { Write-Host '  not exposed (expected on rc.6; the client uses localStorage)' }
