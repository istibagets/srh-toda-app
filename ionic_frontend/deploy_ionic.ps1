# SRH LINK TODA IONIC - Deployment Script
param(
    [switch]$SkipBuild
)

$SSH_KEY = "C:\Users\lenovo\.ssh\ssh-key-2026-08-08.key"
if (-not (Test-Path $SSH_KEY)) {
    $SSH_KEY = "C:\Users\lenovo\OneDrive\Documents\SSH KEY\ssh-key-2026-08-08.key"
}
$REMOTE_USER = "ubuntu"
$REMOTE_HOST = "161.118.237.125"
$REMOTE_ROOT = "/var/www/srh-link-toda-ionic"

# Determine path to ionic_frontend and srh-link-toda (backend)
$BACKEND_DIR = "C:\laragon\www\srh-link-toda"
if (-not (Test-Path $BACKEND_DIR)) {
    if (Test-Path "$PSScriptRoot\..\srh-link-toda") {
        $BACKEND_DIR = "$PSScriptRoot\..\srh-link-toda"
    }
}

$IONIC_DIR = "C:\laragon\www\ionic_frontend"
if (-not (Test-Path $IONIC_DIR)) {
    $IONIC_DIR = $PSScriptRoot
}

$IONIC_DIR = (Resolve-Path $IONIC_DIR).Path
$BACKEND_DIR = (Resolve-Path $BACKEND_DIR).Path

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "SRH LINK TODA IONIC - Deploying to Oracle Cloud" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Backend Path : $BACKEND_DIR" -ForegroundColor Gray
Write-Host "Frontend Path: $IONIC_DIR" -ForegroundColor Gray

if (-not (Test-Path $SSH_KEY)) {
    Write-Host "Error: SSH Key not found at $SSH_KEY" -ForegroundColor Red
    exit 1
}

# 1. Build Ionic Frontend
if (-not $SkipBuild) {
    Write-Host "Building Ionic Frontend for Production..." -ForegroundColor Yellow
    Push-Location "$IONIC_DIR"
    npm run build
    Pop-Location
}

# 2. Package Project Files
Write-Host "Packaging deployment bundle..." -ForegroundColor Yellow
$scratchDir = "$BACKEND_DIR\scratch"
if (-not (Test-Path $scratchDir)) { New-Item -ItemType Directory -Path $scratchDir -Force | Out-Null }

$tempDir = "$scratchDir\deploy_ionic_temp"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

$dirs = @('app', 'bootstrap', 'config', 'database', 'public', 'resources', 'routes')
foreach ($d in $dirs) {
    $srcPath = "$BACKEND_DIR\$d"
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination "$tempDir\$d" -Recurse -Force
    }
}
$files = @('artisan', 'composer.json', 'composer.lock', 'package.json')
foreach ($f in $files) {
    $srcFile = "$BACKEND_DIR\$f"
    if (Test-Path $srcFile) {
        Copy-Item -Path $srcFile -Destination "$tempDir\$f" -Force
    }
}

if (Test-Path "$IONIC_DIR\www") {
    Copy-Item -Path "$IONIC_DIR\www" -Destination "$tempDir\ionic_www" -Recurse -Force
} else {
    Write-Host "Warning: $IONIC_DIR\www not found. Did the build succeed?" -ForegroundColor Red
}

$tarOutput = "$scratchDir\deploy_ionic.tar.gz"
if (Test-Path $tarOutput) { Remove-Item -Force $tarOutput }
tar -czf $tarOutput -C $tempDir .
Remove-Item -Recurse -Force $tempDir

# 3. Upload Archive via SCP
Write-Host "Uploading to Oracle Server ($REMOTE_HOST)..." -ForegroundColor Yellow
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$tarOutput" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ROOT}/deploy_ionic.tar.gz"

# 4. Extract and Run Laravel Commands Remotely (Preserving Session Storage & Permissions)
Write-Host "Extracting and optimizing on Oracle Server..." -ForegroundColor Yellow
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" "cd $REMOTE_ROOT; tar -xzf deploy_ionic.tar.gz; rm deploy_ionic.tar.gz; mkdir -p storage/app/public storage/framework/cache storage/framework/sessions storage/framework/views storage/logs; composer install --no-dev --no-interaction 2>/dev/null; php artisan migrate --force 2>/dev/null; php artisan storage:link 2>/dev/null; php artisan config:clear 2>/dev/null; php artisan route:clear 2>/dev/null; php artisan view:clear 2>/dev/null; sudo chown -R ubuntu:www-data $REMOTE_ROOT; sudo chmod -R 775 $REMOTE_ROOT/storage $REMOTE_ROOT/bootstrap/cache"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT COMPLETE! http://srh-link-toda-ionic.duckdns.org" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
