# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: on the repository's **Security** tab choose **Report a vulnerability**
([direct link](https://github.com/mintelligence-dev/eve-thai-quotation-extension/security/advisories/new)).
Include what is affected, how to reproduce it and what an attacker could do with it.

We aim to reply within 5 working days, and will keep you informed until a fix is released.

## What is in scope

- **Prices and items.** Anything that makes the software use a price or an item that is not in the catalog, including through prompt injection. The design rule is that the model never sets prices; a way around that is a vulnerability.
- **Approval.** Anything that issues a quotation without the approval the configuration requires, or after the total changed.
- **The extension's shared drafts and catalogs** (`packages/eve`): reading or changing a draft without its link, reading files outside the configured storage, changing the shop's catalog without going through the desk.
- **The web demo's API routes** (`/api/extract`, `/api/select`, `/api/engine`) and **the example agent's pages and server actions**: input handling, size limits, and anything that lets a request run up AI costs or reach data it should not.
- **The pricing and matching code** in `packages/core`.

Supported versions are the latest release of each package on npm and the `main` branch.

## Known and by design

These are documented behaviours, not vulnerabilities. They are still worth knowing before you deploy.

- **A draft's link is its key.** With `sharing` on, whoever holds a draft's link can read, change and, through a page that offers it, approve that draft.
- **Whoever can reach the catalog calls sets the prices.** `allowUploadedCatalogs` and `managedCatalog` are off by default for that reason.
- **The web demo has no login.**

## If you host your own copy

Anyone who can reach your deployment can use its AI at your cost and, depending on what you turned on, do the things above. So:

- set a spending limit on the AI Gateway key,
- put a rate limit in front of the routes that call a model (the public web demo uses a firewall rule),
- put your own sign-in in front of draft and catalog pages when links may travel beyond the people allowed to approve,
- keep keys, bot tokens and passwords in environment variables, never in the repository.
