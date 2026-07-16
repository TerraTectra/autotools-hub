# Jing MM Safe: RFQ operator can indefinitely suppress lost-key recovery

## Target

- Contract: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-mm-safe`
- Audited source: `Rapha-btc/jing-contracts-v3/contracts/rfq/deployed/jing-mm-safe.clar`
- AIBTC bounty: stress-test deployed `pillar-safe-v2` / `jing-mm-safe`

## Summary

The wallet's lost-key recovery becomes available only when:

```clarity
(> burn-block-height (+ INACTIVITY-PERIOD (var-get last-activity-block)))
```

The dedicated RFQ operator is independently authorized to call `fix-rfq` and `fulfill-rfq`; it does not need to be the owner, an admin, or the registered passkey. Both functions call `update-activity()` after a successful market action.

As a result, an operational or compromised RFQ hot key can periodically complete a small, self-controlled RFQ and reset the recovery timer. If the owner and passkey are lost, the designated recovery address can be kept permanently unable to call `recover-inactive-wallet` even though the RFQ key has no custody-recovery authority.

## Relevant source flow

```clarity
(define-read-only (is-inactive)
  (> burn-block-height (+ INACTIVITY-PERIOD (var-get last-activity-block))))

(define-private (update-activity)
  (var-set last-activity-block burn-block-height))

(define-private (is-rfq-authorized)
  (or
    (is-eq contract-caller (var-get rfq-operator))
    (is-some (map-get? admins contract-caller))))
```

After a successful `fix-price` call, `fix-rfq` executes:

```clarity
(update-activity)
```

`fulfill-rfq` does the same after settlement.

## Attack sequence

1. The owner key and passkey become unavailable; a valid recovery address exists.
2. The RFQ operator key remains active or is compromised.
3. Before the inactivity period completes, the operator uses a controlled client to open a small RFQ and successfully calls `fix-rfq` through the safe.
4. `last-activity-block` is overwritten with the current burn height.
5. `recover-inactive-wallet` remains blocked with `err-inactive-required` for another full inactivity period.
6. The operator repeats the process indefinitely.

The client side of the v1 RFQ market is permissionless, so the operator does not depend on an honest third party. It only needs a small sBTC position and a valid client signature for its own RFQ.

## Mainnet-fork reproduction

The test deploys the exact audited source on a Stxer mainnet fork and changes only:

```diff
-(define-constant INACTIVITY-PERIOD u52560)
+(define-constant INACTIVITY-PERIOD u3)
```

All authorization, recovery, RFQ, and activity-update logic remains byte-for-byte unchanged. Shortening the delay makes two complete reset cycles practical in CI without changing the security property.

Fork block: `8568880`

Simulation:

`https://stxer.xyz/simulations/mainnet/cb7cc63cdaacc5bf8d3b413fb340422b`

GitHub Actions run: `TerraTectra/auto-income-bot` run `29543348849`

### Observed sequence

```text
owner                         = burn principal, not the RFQ hot key
rfq-operator-is-admin         = (err u4001)
pubkey-initialized            = false
inactive-before-first-reset   = true
hot-key-fix-first-rfq         = (ok u1)
inactive-after-first-reset    = false
inactive-before-second-reset  = true
hot-key-fix-second-rfq        = (ok u2)
inactive-after-second-reset   = false
```

All eleven assertions passed. The structured result is in `report.json`.

## Impact

- Persistent denial of the wallet's intended lost-key recovery path.
- A non-custodial operational key can prevent the designated recovery principal from restoring control.
- Funds may remain inaccessible indefinitely after owner/passkey loss.
- The reset can be repeated using ordinary market operations and does not require changing wallet configuration.

## Severity

**Medium — persistent recovery/custody availability denial by a separately privileged hot key.**

The attacker needs the RFQ operator credential, but that role is intentionally online and is not supposed to control owner recovery. The impact becomes permanent loss of access when the owner and passkey are unavailable.

## Recommended fix

Track custody activity separately from operational market activity. The inactivity recovery gate should only be reset by actions authenticated by the owner/admin or passkey.

At minimum, do not reset the recovery timer when `fix-rfq` or `fulfill-rfq` is called solely through the RFQ operator role. Preserve the reset when an admin directly invokes the same function:

```clarity
(if (is-some (map-get? admins contract-caller))
  (update-activity)
  true)
```

A stronger design uses a dedicated `last-custody-activity-block` updated only after owner/admin/passkey authorization, while RFQ operations maintain a separate operational-activity counter.

Add a regression test that:

1. reaches the inactivity threshold;
2. performs a successful RFQ action using a non-admin RFQ operator;
3. confirms the wallet remains inactive and recovery remains available;
4. confirms an admin-authenticated action still resets the custody timer.

## Scope and safety

The reproduction uses a fork and synthetic assets only. No live funds were transferred and no production state was modified.
