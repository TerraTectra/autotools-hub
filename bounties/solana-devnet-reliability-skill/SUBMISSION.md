# Solana AI Kit Skill Bounty Submission

## Skill name

Solana Devnet Reliability

## One-line description

A production-grade skill and dependency-free diagnostic CLI that helps coding agents recover Solana devnet RPC, faucet, wallet-funding, blockhash, CI-state, and secret-management failures safely.

## Problem

Solana builders lose time when an otherwise correct application is blocked by shared test infrastructure:

- public RPC or faucet HTTP 429/403 responses;
- an unfunded fee payer;
- a workflow that creates a fresh wallet on each retry;
- expired blockhashes misdiagnosed as program bugs;
- CI secrets or keypair arrays leaking into logs and patches;
- tests using public devnet when a local validator would be deterministic and cheaper;
- automated agents unable to complete a human CAPTCHA flow.

Existing development skills teach transaction construction and program patterns. They do not provide a strict operational recovery procedure for keeping the devnet environment reliable.

## Solution

The skill provides:

- a progressive `SKILL.md` entry point;
- RPC/error classification guides;
- a bounded faucet recovery ladder;
- official human vs agent proof-of-work routing;
- protected wallet persistence patterns for GitHub Actions;
- key and token hygiene rules;
- local validator / LiteSVM / Mollusk / Surfpool decision guidance;
- a dedicated `devnet-operator` agent;
- a `/devnet-doctor` command;
- a dependency-free Node diagnostic CLI;
- mocked tests that never contact Solana or request funds;
- Unix and PowerShell installers.

## Novelty

The skill focuses on the operational gap between “the code compiles” and “an autonomous agent can reliably complete a signed devnet integration.” Its recovery ladder was derived from real failure modes encountered while activating a Solana devnet service:

1. public faucet returning 429 even for very small requests;
2. alternative public RPC pools rejecting shared runner IPs with 403;
3. the official proof-of-work client requiring a tiny fee-paying bootstrap balance before it can claim its first reward;
4. ephemeral CI losing funded wallet identity between retries;
5. service credentials needing a protected server-side snapshot rather than browser exposure.

## Quality evidence

Independent GitHub Actions validation passed:

- Node syntax check;
- seven mocked RPC/faucet tests;
- read-only default behaviour;
- explicit single-airdrop path and balance verification;
- 429 classification and retry-stop behaviour;
- secret-bearing argument rejection;
- Unix installer test;
- PowerShell installer test;
- package secret-file hygiene check.

The diagnostic CLI has no runtime dependencies and never reads a keypair file.

## Fit with Solana AI Kit

The skill is cross-domain and complements rather than duplicates core Solana development guidance. It applies to:

- payments;
- games;
- DeFi;
- agents;
- hackathons;
- oracle/data integrations;
- CI/CD;
- frontend/backend smoke tests.

It follows the reference kit pattern with a primary `SKILL.md`, progressive reference files, commands, an agent, installers, and tests.

## Safety

- no seed/private-key input;
- no mainnet funding or trading;
- no CAPTCHA bypass;
- no repeated faucet loops after rate-limit classification;
- no secret-bearing browser requests;
- no success claim until balance is confirmed;
- no automatic state change without an explicit flag or authorised workflow.

## Public link

https://github.com/TerraTectra/autotools-hub/tree/main/bounties/solana-devnet-reliability-skill

## Builder

- GitHub: `TerraTectra`
- Telegram: `@tahioff`
- Communication: written messages only
