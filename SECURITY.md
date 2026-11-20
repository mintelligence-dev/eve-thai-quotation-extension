# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: on the repository's **Security** tab choose **Report a vulnerability**
([direct link](https://github.com/mintelligence-dev/eve-thai-quotation-extension/security/advisories/new)).
Include what is affected, how to reproduce it and what an attacker could do with it.

We aim to reply within 5 working days, and will keep you informed until a fix is released.

## What is in scope

- The API routes (`/api/extract`, `/api/select`, `/api/engine`): input handling, size limits, and anything that
  lets a request run up AI costs or reach data it should not.
- Prompt injection that makes the app use a price or an item that is not in the catalog. The
  design rule is that the model never sets prices; a way around that is a vulnerability.
- The pricing and matching code in `src`.

## If you host your own copy

The app has no login. Anyone who can reach your deployment can call the AI routes at your cost, so:

- put a rate limit in front of `/api/extract` and `/api/select` (the public demo uses a firewall rule),
- set a spending limit on the AI Gateway key,
- keep `AI_GATEWAY_API_KEY` in environment variables, never in the repository.
