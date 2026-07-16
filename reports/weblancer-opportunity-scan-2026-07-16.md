# Weblancer opportunity scan — 2026-07-16

- Workflow: `Weblancer opportunity scan`
- Successful run: `29471819095`
- Head commit before merge: `cda36386a271dbe2ff803546cc94038c046c90b2`
- Merge commit: `7ea0227d0d70038388e0d51510ee2f545ff63b10`
- Cards checked: **48**
- Network/parser errors: **0**
- Actionable projects: **0**

## Validation gate

A card is retained only when all of the following are true:

- project status is `Открыт`;
- no more than five applications;
- no older than 21 days;
- customer account is not blocked;
- no selected executor;
- scope matches Python, Node.js/TypeScript, API, Telegram bots, data processing, QA or automation;
- no verification/CAPTCHA bypass, spam, game cheating, gambling, account farming, visa-slot automation or other blocked scope.

## Main rejection patterns in the first run

- closed or awaiting-payment cards;
- more than five applications;
- stale cards older than 21 days;
- blocked customers;
- already selected executors;
- unsafe or disallowed scope.

## Operational rule

The scheduled scan runs every three hours. Only rows with `actionable=true` may proceed to manual page verification and an application draft. The platform may be used only through its free period, without paid tariff or passport verification.
