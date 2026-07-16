# Fleet SDK issue 110 — SigmaJS prover

Public review mirror for `fleet-sdk/fleet#110`.

## Validation base

- Repository: `fleet-sdk/fleet`
- Branch: `master`
- Commit: `8fd834a94a7534069ed78af3538f518068ca1e2e`
- Validated: 2026-07-16

## Implementation

The new `SigmaProver` implements the existing `ISigmaProver` interface.

- Reduces each input ErgoTree through SigmaJS before signing.
- Supports general Sigma propositions, not only P2PK inputs.
- Accepts blockchain context, parameters, network and base cost as options.
- Passes explicitly burned tokens to transaction reduction.
- Uses SigmaJS for message signing and verification.
- Supports all message representations accepted by the existing Fleet prover.
- Uses stable structural option types instead of exposing incomplete dependency declarations.

## Required upstream changes

1. Add `sigmastate-js` version `0.4.6` to the wallet package dependencies.
2. Export `./prover/sigmaProver` from the wallet package index.
3. Add `sigmaProver.ts` and `sigmaProver.spec.ts` from this directory.
4. Regenerate `pnpm-lock.yaml`.

## Checks

Applied to a clean checkout of the upstream commit above:

- Biome format and lint: passed.
- Full workspace build: passed.
- Targeted test file: passed.
- Tests: 5 passed.
- Patch whitespace check: passed.

Coverage includes P2PK, a register-backed proposition, token burning, EIP-12 and byte representations, message encoding variants, raw public-key bytes, missing private material, and invalid public keys.

Patch summary:

```text
packages/wallet/package.json                   |   3 +-
packages/wallet/src/index.ts                   |   1 +
packages/wallet/src/prover/sigmaProver.spec.ts | 132 ++++++++++++++++++++
packages/wallet/src/prover/sigmaProver.ts      | 160 +++++++++++++++++++++++++
pnpm-lock.yaml                                 |  28 +++++
5 files changed, 323 insertions(+), 1 deletion(-)
```

Final patch SHA-256:

```text
e35940f9a16aa97491704a117f5ca40c269f5b3687b01f4b15424ab32af28f89
```
