# SRH LINK TODA IONIC - Ultra-Fast Deployment Script
param(
    [switch]$SkipBuild,
    [switch]$FullReset
)

$SSH_KEY = "C:\Users\rfer3\Documents\SSH KEY\ssh-key-2026-08-08.key"
if (-not (Test-Path $SSH_KEY)) {
    $SSH_KEY = "C:\Users\lenovo\.ssh\ssh-key-2026-08-08.key"
}
if (-not (Test-Path $SSH_KEY)) {
    $SSH_KEY = "C:\Users\lenovo\OneDrive\Documents\SSH KEY\ssh-key-2026-08-08.key"
}
$REMOTE_USER = "ubuntu"
$REMOTE_HOST = "161.118.237.125"
$REMOTE_ROOT = "/var/www/srh-link-toda-ionic"

# Determine path to ionic_frontend and laravel_backend
$BACKEND_DIR = "$PSScriptRoot\..\laravel_backend"
if (-not (Test-Path $BACKEND_DIR)) {
    $BACKEND_DIR = "C:\laragon\www\srh-toda-app\laravel_backend"
}

$IONIC_DIR = "$PSScriptRoot"
if (-not (Test-Path "$IONIC_DIR\package.json")) {
    $IONIC_DIR = "C:\laragon\www\srh-toda-app\ionic_frontend"
}

$IONIC_DIR = (Resolve-Path $IONIC_DIR).Path
$BACKEND_DIR = (Resolve-Path $BACKEND_DIR).Path

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "SRH LINK TODA IONIC - Fast Deploy (Oracle Cloud)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Backend Path : $BACKEND_DIR" -ForegroundColor Gray
Write-Host "Frontend Path: $IONIC_DIR" -ForegroundColor Gray
Write-Host "SSH Key Path : $SSH_KEY" -ForegroundColor Gray

if (-not (Test-Path $SSH_KEY)) {
    Write-Host "Error: SSH Key not found at $SSH_KEY" -ForegroundColor Red
    exit 1
}

# 1. Build Ionic Frontend (if not skipped)
if (-not $SkipBuild) {
    Write-Host "Building Ionic Frontend (Production)..." -ForegroundColor Yellow
    Push-Location "$IONIC_DIR"
    npm run build
    Pop-Location
}

# 2. Package ONLY Changed Code & Assets (Fast Bundle)
Write-Host "Packaging fast deployment bundle..." -ForegroundColor Yellow
$scratchDir = "$BACKEND_DIR\scratch"
if (-not (Test-Path $scratchDir)) { New-Item -ItemType Directory -Path $scratchDir -Force | Out-Null }

$tempDir = "$scratchDir\deploy_ionic_temp"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

$dirs = @('app', 'config', 'database', 'routes')
foreach ($d in $dirs) {
    $srcPath = "$BACKEND_DIR\$d"
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination "$tempDir\$d" -Recurse -Force
    }
}

if (Test-Path "$IONIC_DIR\www") {
    Copy-Item -Path "$IONIC_DIR\www" -Destination "$tempDir\ionic_www" -Recurse -Force
}

$tarOutput = "$scratchDir\deploy_ionic.tar.gz"
if (Test-Path $tarOutput) { Remove-Item -Force $tarOutput }
tar -czf $tarOutput -C $tempDir .
Remove-Item -Recurse -Force $tempDir

# 3. Fast Upload
Write-Host "Uploading bundle to Oracle Server..." -ForegroundColor Yellow
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$tarOutput" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ROOT}/deploy_ionic.tar.gz"

# 4. Instant Remote Unpack & Cache Refresh
if ($FullReset) {
    Write-Host "Extracting and resetting database baseline..." -ForegroundColor Yellow
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" "cd $REMOTE_ROOT; tar -xzf deploy_ionic.tar.gz; rm deploy_ionic.tar.gz; php artisan migrate:fresh --seed --force; php artisan config:clear 2>/dev/null; php artisan route:clear 2>/dev/null; php artisan view:clear 2>/dev/null; sudo chown -R ubuntu:www-data $REMOTE_ROOT; sudo chmod -R 775 $REMOTE_ROOT/storage $REMOTE_ROOT/bootstrap/cache"
} else {
    Write-Host "Extracting and applying instant updates..." -ForegroundColor Yellow
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" "cd $REMOTE_ROOT; tar -xzf deploy_ionic.tar.gz; rm deploy_ionic.tar.gz; php artisan migrate --force; php artisan config:clear 2>/dev/null; php artisan route:clear 2>/dev/null; php artisan view:clear 2>/dev/null; sudo chown -R ubuntu:www-data $REMOTE_ROOT; sudo chmod -R 775 $REMOTE_ROOT/storage $REMOTE_ROOT/bootstrap/cache"
}

# Cleanup local archive
if (Test-Path $tarOutput) { Remove-Item -Force $tarOutput }

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT COMPLETE! https://srh-link-toda-ionic.duckdns.org" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
