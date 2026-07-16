import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHttpStatus,
  parseArgs,
  redactRpcUrl,
  runDoctor,
} from "../scripts/devnet-doctor.mjs";

const ADDRESS = "Fz67aGkB8DiPWtp6zRLNX2QGzAFQybWAcLmo6kk98FrD";

function response(result, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(status >= 400 ? result : { jsonrpc: "2.0", id: 1, result }),
  };
}

function successfulFetch({ balanceBefore = 0, balanceAfter = 0 } = {}) {
  const methods = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    methods.push(request.method);
    switch (request.method) {
      case "getGenesisHash":
        return response("EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
      case "getHealth":
        return response("ok");
      case "getVersion":
        return response({ "solana-core": "3.0.0" });
      case "getLatestBlockhash":
        return response({ value: { blockhash: "Blockhash111", lastValidBlockHeight: 999 } });
      case "getBalance": {
        const count = methods.filter((method) => method === "getBalance").length;
        return response({ context: { slot: 42 + count }, value: count === 1 ? balanceBefore : balanceAfter });
      }
      case "requestAirdrop":
        return response("Signature111");
      default:
        throw new Error(`Unexpected method ${request.method}`);
    }
  };
  return { fetchImpl, methods };
}

test("parseArgs is read-only by default", () => {
  const options = parseArgs(["--address", ADDRESS, "--json"], {});
  assert.equal(options.address, ADDRESS);
  assert.equal(options.json, true);
  assert.equal(options.airdropLamports, null);
});

test("parseArgs rejects secret-bearing inputs", () => {
  assert.throws(
    () => parseArgs(["--address", ADDRESS, "--private-key", "secret"], {}),
    /Secret-bearing arguments are not accepted/,
  );
});

test("classifies HTTP rate limits", () => {
  assert.equal(classifyHttpStatus(429), "rate_limited");
  assert.equal(classifyHttpStatus(403), "access_controlled");
  assert.equal(classifyHttpStatus(503), "rpc_unavailable");
});

test("redacts credentials and query tokens from RPC URLs", () => {
  assert.equal(
    redactRpcUrl("https://user:pass@rpc.example.test/path?api-key=super-secret"),
    "https://rpc.example.test/path",
  );
});

test("read-only doctor never invokes requestAirdrop", async () => {
  const { fetchImpl, methods } = successfulFetch({ balanceBefore: 0 });
  const report = await runDoctor(
    { rpc: "https://api.devnet.solana.com", address: ADDRESS, airdropLamports: null },
    fetchImpl,
  );

  assert.equal(report.classification, "healthy_unfunded");
  assert.equal(report.readOnly, true);
  assert.equal(report.secretExposure, "none");
  assert.equal(methods.includes("requestAirdrop"), false);
  assert.deepEqual(methods, [
    "getGenesisHash",
    "getHealth",
    "getVersion",
    "getLatestBlockhash",
    "getBalance",
  ]);
});

test("explicit airdrop verifies a balance increase", async () => {
  const { fetchImpl, methods } = successfulFetch({ balanceBefore: 0, balanceAfter: 5000 });
  const report = await runDoctor(
    { rpc: "https://api.devnet.solana.com", address: ADDRESS, airdropLamports: 5000 },
    fetchImpl,
  );

  assert.equal(report.classification, "funded_and_verified");
  assert.equal(report.readOnly, false);
  assert.equal(report.probes.balanceAfter.value.lamports, 5000);
  assert.equal(methods.filter((method) => method === "requestAirdrop").length, 1);
});

test("doctor stops and classifies a 429 airdrop", async () => {
  const methods = [];
  const base = successfulFetch({ balanceBefore: 0 }).fetchImpl;
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body);
    methods.push(request.method);
    if (request.method === "requestAirdrop") {
      return response({ error: "Too Many Requests" }, 429, { "retry-after": "60" });
    }
    return base(url, init);
  };

  const report = await runDoctor(
    { rpc: "https://api.devnet.solana.com", address: ADDRESS, airdropLamports: 5000 },
    fetchImpl,
  );

  assert.equal(report.classification, "rate_limited");
  assert.match(report.nextAction, /Stop public faucet retries/);
  assert.equal(methods.filter((method) => method === "requestAirdrop").length, 1);
});
