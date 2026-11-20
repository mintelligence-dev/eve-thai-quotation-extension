# Changelog

Changes that matter to people who install the packages or run the apps. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## Unreleased

### Added
- `examples/thai-quotation-agent`: a complete eve agent with a web page and a Telegram channel, deployed at <https://thai-quotation-agent.vercel.app>.
- `README.th.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, this changelog, and issue and pull request templates.

### Changed
- The root README is in English, with the Thai version in `README.th.md`.

## eve 0.2.0 (2026-11-20)

`@eve-thai-quotation-extension/eve`. `core` stays at 0.1.1. Nothing changes for an agent that does not turn `sharing` on.

### Added
- `sharing` setting: a draft is also kept in storage and gets a link, so a person can open the draft the agent is working on. Storage is a folder (`{ dir }`) or private Vercel Blob (`{ blob }`).
- `@eve-thai-quotation-extension/eve/desk`: `openDesk()` reads, revises and issues a shared draft with the same rules as the tools and no model, for a web page.
- Document details per draft: quotation number, date, valid days, seller name and address, customer address, notes, VAT rate, prices include VAT.
- `allowUploadedCatalogs` (off by default): price a draft from an uploaded catalog instead of the configured one.
- `managedCatalog` (off by default): replace the shop's catalog, change one price, and undo, through the desk; the stored catalog is then used by the tools too.
- `draft` takes an optional `catalogId`; `search` takes an optional `draftId`; `revise` with only a `draftId` returns the draft as it is now.
- The draft view has `problemCodes` and, with sharing, `editUrl`.

### Changed
- An issued quotation carries `notes`, `sellerName`, `sellerDetails` and `customerDetails`.

## 0.1.1 (2026-11-20)

`core` and `eve`. Documentation only: the READMEs on npm now match the repository.

## 0.1.0 (2026-11-20)

First release on npm.

- `@eve-thai-quotation-extension/core`: catalog import with row and column errors, Thai and English matching, review checks, pricing in integer satang with VAT on the document total.
- `@eve-thai-quotation-extension/eve`: `draft`, `search`, `revise` and `issue` tools for an eve agent. `issue` always waits for a person's approval and refuses a total that changed after it was shown.

## Before the packages

The web demo at <https://thai-quotation-copilot.vercel.app> came first: paste a message, review the draft in a table, approve, print or export. Its rules became `core`.
