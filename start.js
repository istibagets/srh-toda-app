const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI Color Codes for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};

function logHeader(text) {
  console.log(`\n${colors.bright}${colors.green}=== ${text} ===${colors.reset}\n`);
}

// 1. Resolve PHP executable path
function resolvePhpPath() {
  try {
    execSync('php -v', { stdio: 'ignore' });
    return 'php';
  } catch (e) {
    const laragonPhpDir = 'C:\\laragon\\bin\\php';
    if (fs.existsSync(laragonPhpDir)) {
      const versions = fs.readdirSync(laragonPhpDir).filter(f => f.startsWith('php'));
      if (versions.length > 0) {
        const phpFolder = path.join(laragonPhpDir, versions[versions.length - 1]);
        const phpExe = path.join(phpFolder, 'php.exe');
        if (fs.existsSync(phpExe)) {
          process.env.PATH = `${phpFolder};${process.env.PATH}`;
          return phpExe;
        }
      }
    }
    return 'php';
  }
}

// 2. Automatically free ports 8000 and 8080 on Windows
function freePorts() {
  if (process.platform !== 'win32') return;
  [8000, 8080].forEach((port) => {
    try {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.trim().split('\n');
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== `${process.pid}`) {
          try {
            execSync(`taskkill /pid ${pid} /F /T`, { stdio: 'ignore' });
          } catch {}
        }
      });
    } catch {}
  });
}

freePorts();

const phpExe = resolvePhpPath();
const rootDir = __dirname;
const backendDir = path.join(rootDir, 'laravel_backend');
const frontendDir = path.join(rootDir, 'ionic_frontend');

logHeader('Starting SRH TODA Fullstack Services');
console.log(`${colors.cyan}Backend Dir:${colors.reset}  ${backendDir}`);
console.log(`${colors.magenta}Frontend Dir:${colors.reset} ${frontendDir}`);
console.log(`${colors.green}PHP Source:${colors.reset}   ${phpExe}\n`);

const services = [
  {
    name: 'BACKEND',
    color: colors.cyan,
    cmd: `"${phpExe}" artisan serve --host=0.0.0.0 --port=8000`,
    cwd: backendDir,
  },
  {
    name: 'REVERB',
    color: colors.yellow,
    cmd: `"${phpExe}" artisan reverb:start --host=0.0.0.0 --port=8080`,
    cwd: backendDir,
  },
  {
    name: 'FRONTEND',
    color: colors.magenta,
    cmd: `npm start`,
    cwd: frontendDir,
  },
];

const children = [];

function prefixOutput(data, name, color) {
  const lines = data.toString().split('\n');
  lines.forEach((line) => {
    if (line.trim().length > 0) {
      console.log(`${color}${colors.bright}[${name}]${colors.reset} ${line}`);
    }
  });
}

// Start all services
services.forEach((service) => {
  console.log(`${service.color}${colors.bright}[${service.name}]${colors.reset} Launching: ${service.cmd}...`);
  
  const child = spawn(service.cmd, {
    cwd: service.cwd,
    shell: true,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => prefixOutput(data, service.name, service.color));
  child.stderr.on('data', (data) => prefixOutput(data, service.name, service.color));

  child.on('close', (code) => {
    if (!isShuttingDown) {
      console.log(`${service.color}${colors.bright}[${service.name}]${colors.reset} Process exited with code ${code}`);
    }
  });

  child.on('error', (err) => {
    console.error(`${colors.red}[${service.name}] Error:${colors.reset}`, err.message);
  });

  children.push(child);
});

// Clean shutdown mechanism
let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${colors.yellow}Shutting down all services cleanly...${colors.reset}`);
  
  children.forEach((child) => {
    try {
      if (process.platform === 'win32' && child.pid) {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch {}
  });

  freePorts();
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
