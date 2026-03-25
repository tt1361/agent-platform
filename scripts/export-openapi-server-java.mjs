#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const serverDir = path.join(repoRoot, 'apps', 'server-java');
const serverPort = 18888;
const healthUrl = `http://127.0.0.1:${serverPort}/actuator/health`;
const openApiUrl = `http://127.0.0.1:${serverPort}/api-docs`;
const outputPath = path.join(repoRoot, 'doc', 'openapi.server-java.json');
const maxAttempts = 90;
const intervalMs = 2000;

async function isServerReady() {
  try {
    const resp = await fetch(healthUrl);
    if (!resp.ok) return false;
    const body = await resp.json();
    return body?.status === 'UP';
  } catch {
    return false;
  }
}

async function waitUntilReady() {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await isServerReady()) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Server was not ready within ${Math.round((maxAttempts * intervalMs) / 1000)}s`);
}

async function exportOpenApi() {
  const resp = await fetch(openApiUrl);
  if (!resp.ok) {
    throw new Error(`Fetch OpenAPI failed: HTTP ${resp.status}`);
  }
  const text = await resp.text();
  await writeFile(outputPath, `${text}\n`, 'utf-8');
}

let child = null;

try {
  child = spawn('mvn', ['spring-boot:run', `-Dspring-boot.run.arguments=--server.port=${serverPort}`], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  child.on('error', (error) => {
    console.error('[docs:openapi:server-java] Failed to start server:', error.message);
  });

  await waitUntilReady();
  await exportOpenApi();
  console.log(`[docs:openapi:server-java] OpenAPI exported to ${outputPath}`);
} catch (error) {
  console.error('[docs:openapi:server-java] Export failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (child && !child.killed) {
    child.kill('SIGINT');
    await sleep(1200);
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}
