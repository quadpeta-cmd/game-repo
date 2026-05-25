#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit' });
}

const dockerCheck = spawnSync('docker', ['--version'], { stdio: 'pipe' });
if (dockerCheck.status !== 0) {
  console.error('Docker CLI is not installed or not on PATH.');
  console.error('Install Docker Desktop (macOS/Windows) or Docker Engine + Docker Compose plugin (Linux).');
  console.error('Then run: npm run test:hub:e2e:docker');
  process.exit(1);
}

const composeCheck = spawnSync('docker', ['compose', 'version'], { stdio: 'pipe' });
if (composeCheck.status !== 0) {
  console.error('Docker Compose v2 plugin is missing.');
  console.error('Install/enable Docker Compose v2, then re-run npm run test:hub:e2e:docker.');
  process.exit(1);
}

const infoCheck = spawnSync('docker', ['info'], { stdio: 'pipe' });
if (infoCheck.status !== 0) {
  console.error('Docker daemon is not running or not accessible to this user.');
  console.error('Start Docker Desktop or start the docker service, then retry.');
  process.exit(1);
}

const result = run('docker', ['compose', '-f', 'docker-compose.e2e.yml', 'run', '--rm', 'hub-e2e']);
process.exit(result.status ?? 1);
