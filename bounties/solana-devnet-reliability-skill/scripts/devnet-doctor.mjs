#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const MAX_AIRDROP_LAMPORTS = 1_000_000_000;
const SECRET_ARG_PATTERN = /(?:seed|mnemonic|private|secret|keypair)/i;
const BASE58_PUBLIC_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export class DoctorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DoctorError";
    Object.assign(this, details);
  }
}

export function parseArgs(argv, env = process.env) {
  const options = {
    rpc: env.SOLANA_RPC_URL || DEFAULT_RPC_URL,
    address: env.SOLANA_ADDRESS || "",
    json: false,
    airdropLamports: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (SECRET_ARG_PATTERN.test(arg)) {
      throw new DoctorError(
        "Secret-bearing arguments are not accepted. Supply only a public address.",
        { classification: "unsafe_input" },
      );
    }

    if (arg === "--address") {
      options.address = requireValue(argv, ++index, arg);
    } else if (arg === "--rpc") {
      options.rpc = requireValue(argv, ++index, arg);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--airdrop-lamports") {
      const raw = requireValue(argv, ++index, arg);
      if (!/^\d+$/.test(raw)) {
        throw new DoctorError("--airdrop-lamports must be a positive integer.", {
          classification: "invalid_input",
        });
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_AIRDROP_LAMPORTS) {
        throw new DoctorError(
          `--airdrop-lamports must be between 1 and ${MAX_AIRDROP_LAMPORTS}.`,
          { classification: "invalid_input" },
        );
      }
      options.airdropLamports = value;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new DoctorError(`Unknown argument: ${arg}`, { classification: "invalid_input" });
    }
  }

  if (!options.help) {
    validateAddress(options.address);
    validateRpcUrl(options.rpc);
  }

  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new DoctorError(`${flag} requires a value.`, { classification: "invalid_input" });
  }
  return value;
}

export function validateAddress(address) {
  if (!BASE58_PUBLIC_KEY.test(address)) {
    throw new DoctorError("Address must look like a Solana base58 public key.", {
      classification: "invalid_public_key",
    });
  }
}

export function validateRpcUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DoctorError("RPC URL is invalid.", { classification: "invalid_rpc_url" });
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new DoctorError("RPC URL must use http or https.", {
      classification: "invalid_rpc_url",
    });
  }
}

export function redactRpcUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "<invalid-rpc-url>";
  }
}

export async function rpcCall(fetchImpl, rpcUrl, method, params = [], id = 1) {
  let response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new DoctorError(`RPC transport failed during ${method}.`, {
      classification: classifyTransportError(error),
      method,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text only long enough to classify; never echo an entire HTML gateway page.
  }

  if (!response.ok) {
    throw new DoctorError(`RPC HTTP ${response.status} during ${method}.`, {
      classification: classifyHttpStatus(response.status),
      method,
      httpStatus: response.status,
      retryAfter: response.headers?.get?.("retry-after") || null,
      responseSnippet: sanitiseSnippet(text),
    });
  }

  if (payload?.error) {
    throw new DoctorError(
      payload.error.message || `JSON-RPC error during ${method}.`,
      {
        classification: classifyRpcError(payload.error),
        method,
        rpcCode: payload.error.code ?? null,
        responseSnippet: sanitiseSnippet(payload.error.message || ""),
      },
    );
  }

  return payload?.result;
}

export function classifyHttpStatus(status) {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "access_controlled";
  if (status >= 500) return "rpc_unavailable";
  return "rpc_http_error";
}

export function classifyTransportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout/i.test(message)) return "rpc_timeout";
  if (/dns|enotfound|getaddrinfo/i.test(message)) return "rpc_dns_error";
  return "rpc_transport_error";
}

export function classifyRpcError(error) {
  const message = String(error?.message || "");
  if (/blockhash not found|block height exceeded|expired/i.test(message)) {
    return "stale_blockhash";
  }
  if (/airdrop|faucet|rate limit|too many requests/i.test(message)) {
    return "faucet_rejected";
  }
  if (/invalid param|invalid pubkey|invalid public key/i.test(message)) {
    return "invalid_input";
  }
  return "rpc_application_error";
}

function sanitiseSnippet(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:api[-_]?key|token|auth)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

async function probe(fetchImpl, rpcUrl, method, params, id) {
  try {
    return { ok: true, value: await rpcCall(fetchImpl, rpcUrl, method, params, id) };
  } catch (error) {
    return { ok: false, error: serialiseError(error) };
  }
}

export function serialiseError(error) {
  if (!(error instanceof Error)) {
    return { message: String(error), classification: "unknown_error" };
  }
  const safe = {
    message: error.message,
    classification: error.classification || "unknown_error",
  };
  for (const key of ["method", "httpStatus", "rpcCode", "retryAfter", "responseSnippet", "cause"]) {
    if (error[key] !== undefined && error[key] !== null) safe[key] = error[key];
  }
  return safe;
}

export async function runDoctor(options, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new DoctorError("A Fetch API implementation is required.", {
      classification: "runtime_unsupported",
    });
  }

  validateAddress(options.address);
  validateRpcUrl(options.rpc);

  const startedAt = new Date().toISOString();
  let id = 1;
  const genesis = await probe(fetchImpl, options.rpc, "getGenesisHash", [], id++);
  const health = await probe(fetchImpl, options.rpc, "getHealth", [], id++);
  const version = await probe(fetchImpl, options.rpc, "getVersion", [], id++);
  const blockhash = await probe(
    fetchImpl,
    options.rpc,
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
    id++,
  );
  const balanceBefore = await probe(
    fetchImpl,
    options.rpc,
    "getBalance",
    [options.address, { commitment: "confirmed" }],
    id++,
  );

  let airdrop = null;
  let balanceAfter = null;
  if (options.airdropLamports !== null && options.airdropLamports !== undefined) {
    airdrop = await probe(
      fetchImpl,
      options.rpc,
      "requestAirdrop",
      [options.address, options.airdropLamports, { commitment: "confirmed" }],
      id++,
    );
    balanceAfter = await probe(
      fetchImpl,
      options.rpc,
      "getBalance",
      [options.address, { commitment: "confirmed" }],
      id++,
    );
  }

  const classification = classifyReport({
    genesis,
    health,
    version,
    blockhash,
    balanceBefore,
    airdrop,
    balanceAfter,
  });

  return {
    tool: "solana-devnet-doctor",
    readOnly: options.airdropLamports === null || options.airdropLamports === undefined,
    startedAt,
    completedAt: new Date().toISOString(),
    rpc: redactRpcUrl(options.rpc),
    address: options.address,
    probes: {
      genesisHash: genesis,
      health,
      version,
      latestBlockhash: summariseBlockhash(blockhash),
      balanceBefore: summariseBalance(balanceBefore),
      airdrop,
      balanceAfter: balanceAfter ? summariseBalance(balanceAfter) : null,
    },
    classification,
    nextAction: nextActionFor(classification),
    secretExposure: "none",
  };
}

function summariseBalance(result) {
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      contextSlot: result.value?.context?.slot ?? null,
      lamports: result.value?.value ?? null,
    },
  };
}

function summariseBlockhash(result) {
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      available: Boolean(result.value?.value?.blockhash),
      lastValidBlockHeight: result.value?.value?.lastValidBlockHeight ?? null,
    },
  };
}

export function classifyReport(report) {
  const core = [report.genesis, report.health, report.version, report.blockhash];
  const failedCore = core.find((item) => !item.ok);
  if (failedCore) return failedCore.error.classification;

  if (!report.balanceBefore.ok) return report.balanceBefore.error.classification;

  if (report.airdrop) {
    if (!report.airdrop.ok) return report.airdrop.error.classification;
    if (!report.balanceAfter?.ok) return report.balanceAfter?.error?.classification || "balance_unverified";
    const before = report.balanceBefore.value?.value ?? 0;
    const after = report.balanceAfter.value?.value ?? 0;
    if (after <= before) return "airdrop_unconfirmed";
    return "funded_and_verified";
  }

  const balance = report.balanceBefore.value?.value ?? 0;
  return balance > 0 ? "healthy_funded" : "healthy_unfunded";
}

export function nextActionFor(classification) {
  const actions = {
    healthy_funded: "Skip faucet requests and continue with the smallest required devnet transaction.",
    healthy_unfunded: "Select one approved funding route; preserve this wallet identity.",
    funded_and_verified: "Continue with the smallest required transaction and fresh blockhash.",
    rate_limited: "Stop public faucet retries; use an authenticated, human, or official proof-of-work route.",
    access_controlled: "Use the official interactive login/CAPTCHA flow or documented agent route.",
    rpc_timeout: "Retry once with bounded backoff, then rotate to a project-approved devnet RPC.",
    rpc_dns_error: "Repair DNS or use a project-approved devnet RPC endpoint.",
    rpc_unavailable: "Check provider status and rotate to a project-approved devnet RPC.",
    stale_blockhash: "Fetch a fresh blockhash, rebuild, re-sign, and submit promptly.",
    airdrop_unconfirmed: "Query signature status and balance; do not request another airdrop yet.",
    balance_unverified: "Verify balance through a healthy RPC before reporting success.",
    invalid_input: "Correct the public address or request parameters; never supply secret material.",
  };
  return actions[classification] || "Inspect the sanitised error and reclassify before changing state.";
}

export function helpText() {
  return `Solana Devnet Doctor\n\nUsage:\n  node scripts/devnet-doctor.mjs --address <PUBLIC_KEY> [--rpc <URL>] [--json]\n  node scripts/devnet-doctor.mjs --address <PUBLIC_KEY> --airdrop-lamports <N> --json\n\nThe tool is read-only unless --airdrop-lamports is explicitly supplied.\nIt never accepts private keys, seed phrases, or keypair files.`;
}

function renderHuman(report) {
  const balance = report.probes.balanceAfter?.ok
    ? report.probes.balanceAfter.value.lamports
    : report.probes.balanceBefore?.ok
      ? report.probes.balanceBefore.value.lamports
      : "unknown";
  return [
    `RPC: ${report.rpc}`,
    `Address: ${report.address}`,
    `Balance: ${balance} lamports`,
    `Classification: ${report.classification}`,
    `Next action: ${report.nextAction}`,
    `Secret exposure: ${report.secretExposure}`,
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(helpText());
      return 0;
    }
    const report = await runDoctor(options);
    console.log(options.json ? JSON.stringify(report, null, 2) : renderHuman(report));
    return report.classification.startsWith("healthy") || report.classification === "funded_and_verified"
      ? 0
      : 2;
  } catch (error) {
    const safe = serialiseError(error);
    console.error(JSON.stringify({ ok: false, ...safe, secretExposure: "none" }, null, 2));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.exitCode = await main();
}
