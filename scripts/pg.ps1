<#
.SYNOPSIS
  Self-contained PostgreSQL for Xamvaad — no installer, no admin, no service.

.DESCRIPTION
  Downloads the official PostgreSQL binaries once, initialises a database
  cluster under %LOCALAPPDATA%\Xamvaad, and starts it as an ordinary user
  process. Nothing is registered with Windows and nothing needs elevation.

  The cluster lives outside the project folder on purpose: Postgres writes WAL
  files constantly, and a data directory inside the repo would keep the Next.js
  dev server rebuilding.

.PARAMETER Command
  setup    Download, initialise and start (idempotent — safe to re-run)
  start    Start the server
  stop     Stop the server
  status   Report whether the server is running
  psql     Open an interactive SQL shell
  destroy  Delete the cluster and its data (keeps the downloaded binaries)

.EXAMPLE
  npm run db:setup
#>

param(
  [Parameter(Position = 0)]
  [ValidateSet("setup", "start", "stop", "status", "psql", "destroy")]
  [string]$Command = "status"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --- Paths -----------------------------------------------------------------
$Root    = Join-Path $env:LOCALAPPDATA "Xamvaad"
$Zip     = Join-Path $Root "pgsql.zip"
$Bin     = Join-Path $Root "pgsql\bin"
$Data    = Join-Path $Root "pgdata"
$LogFile = Join-Path $Root "postgres.log"
$PwFile  = Join-Path $Root "pgpass.tmp"

$DownloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.9-1-windows-x64-binaries.zip"
# Exact size of the archive above. Used to tell a finished download from a
# partial one — a byte comparison, not an approximate megabyte threshold.
$DownloadBytes = 314500604

# Must match DATABASE_URL in .env
$Port     = 5432
$DbUser   = "xamvaad"
$DbPass   = "xamvaad"
$DbName   = "xamvaad"

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Ok($message)   { Write-Host "    $message" -ForegroundColor Green }
function Write-Warn($message) { Write-Host "    $message" -ForegroundColor Yellow }

function Test-Binaries { Test-Path (Join-Path $Bin "pg_ctl.exe") }
function Test-Cluster  { Test-Path (Join-Path $Data "PG_VERSION") }

function Test-Running {
  if (-not (Test-Binaries) -or -not (Test-Cluster)) { return $false }
  # pg_ctl exits 0 only when the server is up; suppress its output.
  & (Join-Path $Bin "pg_ctl.exe") -D $Data status *> $null
  return $LASTEXITCODE -eq 0
}

function Install-Binaries {
  if (Test-Binaries) { Write-Ok "PostgreSQL binaries already present."; return }

  New-Item -ItemType Directory -Force $Root | Out-Null

  $haveZip = (Test-Path $Zip) -and ((Get-Item $Zip).Length -eq $DownloadBytes)

  if (-not $haveZip) {
    Write-Step "Downloading PostgreSQL 16 (300 MB, one time only)..."
    # curl resumes a partial file with -C -, so an interrupted download costs
    # nothing. Invoke-WebRequest has no resume and restarts from zero.
    & curl.exe -L -C - --retry 10 --retry-delay 3 --retry-all-errors `
      --connect-timeout 30 --progress-bar -o $Zip $DownloadUrl
    if ($LASTEXITCODE -ne 0) { throw "Download failed with exit code $LASTEXITCODE" }

    $actual = (Get-Item $Zip).Length
    if ($actual -ne $DownloadBytes) {
      throw "Download is $actual bytes, expected $DownloadBytes. Re-run 'npm run db:setup' to resume."
    }
  }

  Write-Step "Extracting binaries..."
  # The archive contains a top-level "pgsql" directory.
  Expand-Archive -Path $Zip -DestinationPath $Root -Force

  if (-not (Test-Binaries)) { throw "Extraction finished but pg_ctl.exe is missing under $Bin" }
  Write-Ok "Binaries installed to $Root\pgsql"
}

function Initialize-Cluster {
  if (Test-Cluster) { Write-Ok "Database cluster already initialised."; return }

  Write-Step "Initialising database cluster..."
  New-Item -ItemType Directory -Force $Data | Out-Null

  # initdb reads the superuser password from a file rather than a prompt,
  # because this script runs non-interactively.
  Set-Content -Path $PwFile -Value $DbPass -Encoding ascii -NoNewline
  try {
    & (Join-Path $Bin "initdb.exe") `
      -D $Data `
      -U $DbUser `
      --pwfile=$PwFile `
      --encoding=UTF8 `
      --locale=C `
      --auth-local=trust `
      --auth-host=scram-sha-256 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "initdb failed with exit code $LASTEXITCODE" }
  }
  finally {
    Remove-Item $PwFile -Force -ErrorAction SilentlyContinue
  }

  # Bind to loopback only — this cluster is for local development.
  Add-Content -Path (Join-Path $Data "postgresql.conf") -Value @"

# --- Xamvaad local development ---
listen_addresses = 'localhost'
port = $Port
"@

  Write-Ok "Cluster created at $Data"
}

function Start-Server {
  if (Test-Running) { Write-Ok "PostgreSQL is already running on port $Port."; return }

  Write-Step "Starting PostgreSQL on port $Port..."
  & (Join-Path $Bin "pg_ctl.exe") -D $Data -l $LogFile -w -o "-p $Port" start | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warn "Server failed to start. Last lines of $LogFile :"
    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 20 }
    throw "pg_ctl start failed with exit code $LASTEXITCODE"
  }
  Write-Ok "PostgreSQL is running."
}

function Stop-Server {
  if (-not (Test-Running)) { Write-Ok "PostgreSQL is not running."; return }
  Write-Step "Stopping PostgreSQL..."
  & (Join-Path $Bin "pg_ctl.exe") -D $Data -w -m fast stop | Out-Null
  Write-Ok "Stopped."
}

function New-AppDatabase {
  # initdb created the $DbUser superuser; now ensure the app database exists.
  $env:PGPASSWORD = $DbPass
  try {
    $exists = & (Join-Path $Bin "psql.exe") `
      -h localhost -p $Port -U $DbUser -d postgres -tAc `
      "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>$null

    if ($exists -match "1") {
      Write-Ok "Database '$DbName' already exists."
    }
    else {
      Write-Step "Creating database '$DbName'..."
      & (Join-Path $Bin "createdb.exe") -h localhost -p $Port -U $DbUser $DbName
      if ($LASTEXITCODE -ne 0) { throw "createdb failed with exit code $LASTEXITCODE" }
      Write-Ok "Database created."
    }
  }
  finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

# --- Dispatch ---------------------------------------------------------------

switch ($Command) {
  "setup" {
    Install-Binaries
    Initialize-Cluster
    Start-Server
    New-AppDatabase
    Write-Host ""
    Write-Ok "PostgreSQL is ready at postgresql://${DbUser}:${DbPass}@localhost:$Port/$DbName"
    Write-Host "    Next: npm run db:migrate && npm run db:seed && npm run dev" -ForegroundColor Green
  }
  "start"  { Start-Server }
  "stop"   { Stop-Server }
  "status" {
    if (Test-Running) { Write-Ok "PostgreSQL is running on port $Port." }
    elseif (Test-Cluster) { Write-Warn "Cluster exists but the server is stopped. Run: npm run db:start" }
    else { Write-Warn "Not set up yet. Run: npm run db:setup" }
  }
  "psql" {
    $env:PGPASSWORD = $DbPass
    & (Join-Path $Bin "psql.exe") -h localhost -p $Port -U $DbUser -d $DbName
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  "destroy" {
    Stop-Server
    if (Test-Path $Data) {
      Remove-Item -Recurse -Force $Data
      Write-Ok "Cluster deleted. Run 'npm run db:setup' to start over."
    }
  }
}
