# Resources

Prefer primary sources and verify dates because Solana RPC, faucet, and tooling behaviour changes.

## Solana

- Developer documentation: https://solana.com/docs
- Clusters and endpoints: https://solana.com/docs/core/clusters
- JSON-RPC methods: https://solana.com/docs/rpc
- Official developer faucet: https://faucet.solana.com/
- Solana CLI installation and configuration: https://solana.com/docs/intro/installation
- Local validator guide: https://solana.com/developers/guides/getstarted/solana-test-validator

## Agent funding route

- Proof-of-work faucet repository: https://github.com/jarry-xiao/proof-of-work-faucet
- CLI package used by the project: `devnet-pow`

Before mining, inspect current faucet availability:

```bash
devnet-pow get-all-faucets --url dev
```

Do not assume README sample faucet balances remain current.

## Testing and local environments

- LiteSVM: https://github.com/LiteSVM/litesvm
- Mollusk: https://github.com/anza-xyz/mollusk
- Surfpool: https://github.com/txtx/surfpool
- Anchor: https://www.anchor-lang.com/

## GitHub Actions security

- Security hardening: https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- Encrypted secrets: https://docs.github.com/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
- Workflow artifacts: https://docs.github.com/actions/using-workflows/storing-workflow-data-as-artifacts
- Fork pull-request security: https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/

## Operational references

- Solana status: https://status.solana.com/
- Explorer devnet selector: https://explorer.solana.com/?cluster=devnet

## Verification checklist for new resources

Before adding a faucet, RPC endpoint, binary, or installer:

1. Is it an official or clearly identified operator?
2. Does it explicitly support devnet/testnet?
3. Does it avoid requesting seed phrases/private keys?
4. Are terms, quotas, and authentication requirements visible?
5. Is the repository/package actively maintained?
6. Can checksums or source builds be verified?
7. Does it require a mainnet payment or deposit? If yes, reject it for routine devnet recovery.
8. Does it bypass CAPTCHA or access controls? If yes, reject it.

## Date-sensitive note

The public Solana faucet and shared RPCs may change authentication, CAPTCHA, quotas, or agent guidance. Re-check official pages before automating a new route. Treat sample commands as patterns, not permanent service guarantees.
