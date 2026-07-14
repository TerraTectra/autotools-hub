import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

function waitForServer(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Marketplace server did not start in time"));
    }, timeoutMs);

    const onData = (chunk) => {
      if (String(chunk).includes("RetailCRM SLA Guard listening")) {
        clearTimeout(timeout);
        child.stdout.off("data", onData);
        resolve();
      }
    };

    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Marketplace server exited before startup with code ${code}`));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

test("starts Marketplace HTTP endpoints", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "sla-guard-server-"));
  const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
  const port = 20_000 + Math.floor(Math.random() * 10_000);
  const child = spawn(process.execPath, ["src/marketplace-server.js"], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_BASE_URL: "https://guard.example.com",
      MARKETPLACE_SECRET: "test-marketplace-secret",
      MARKETPLACE_MODULE_CODE: "retailcrm-sla-guard",
      TENANT_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      TENANTS_FILE: join(directory, "tenants.json"),
      AUDIT_LOG_FILE: join(directory, "audit.log"),
      POLL_INTERVAL_SECONDS: "60",
      DRY_RUN: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  context.after(async () => {
    if (child.exitCode == null) child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode != null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 2_000).unref();
    });
    await rm(directory, { recursive: true, force: true });
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  await waitForServer(child).catch((error) => {
    throw new Error(`${error.message}\n${stderr}`);
  });

  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    success: true,
    service: "retailcrm-sla-guard",
  });

  const configResponse = await fetch(`http://127.0.0.1:${port}/marketplace/config`);
  assert.equal(configResponse.status, 200);
  assert.deepEqual(await configResponse.json(), {
    success: true,
    scopes: ["order_read", "integration_write"],
    registerUrl: "https://guard.example.com/marketplace/register",
  });

  const accountGetResponse = await fetch(
    `http://127.0.0.1:${port}/marketplace/account?clientId=should-not-work`,
  );
  assert.equal(accountGetResponse.status, 404);
});
