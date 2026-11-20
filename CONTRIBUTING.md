# Contributing

Thanks for helping. Issues and pull requests are welcome in English or Thai.

## Before you start

- **A bug or a small fix:** open a pull request directly.
- **A new feature or a change in behaviour:** open an issue first, so we can agree on the shape before you write it.
- **A security problem:** do not open an issue. See [SECURITY.md](SECURITY.md).

## What this project will not accept

The rules below are the point of the project. A change that weakens one will be declined, however useful it is otherwise.

- A price comes only from a catalog. The model never writes or changes a price.
- The model may only choose an item from the catalog. It does not invent products.
- A person approves before a quotation is issued, printed or exported.
- Sample catalogs and messages are made up. Do not add real company data, real prices or real customer messages.

## Set up

Needs Node 24 or newer.

```bash
git clone https://github.com/mintelligence-dev/eve-thai-quotation-extension.git
cd eve-thai-quotation-extension
npm install
npm test
```

The repository is an npm workspace:

| Folder | What it is |
|---|---|
| `packages/core` | The rules. Plain TypeScript, no runtime dependencies. |
| `packages/eve` | The eve extension. Build it with `npm run build:eve`. |
| `samples` | Made-up catalogs and messages the tests read. |
| `examples/thai-quotation-agent` | A project of its own, outside the workspace. Run its commands from inside its folder. |

## Before you open a pull request

```bash
npm test
npm run typecheck
npm run lint
```

- Add or update a test for any change to the rules in `packages/core` or `packages/eve`. Matching, review checks and money maths are all covered by tests today; keep it that way.
- If you change how something behaves, update the README that describes it, in English. The Thai root README (`README.th.md`) mirrors `README.md`; update both, or say in the pull request that the Thai text needs doing.
- Add a line to [CHANGELOG.md](CHANGELOG.md) under "Unreleased" when the change affects people who install the packages.
- Say in the pull request what you tested and what you could not test.

## Style

- Code, comments, commit messages and pull requests are in English.
- Text shown to end users is in Thai first, in a formal register, with English where the audience needs it.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat(eve): …`, `fix(core): …`, `docs: …`.
- Keep comments to what the code cannot say: a constraint, a reason, a trap.

## Releases

Maintainers publish `@eve-thai-quotation-extension/core` and `@eve-thai-quotation-extension/eve` to npm. Versions follow [Semantic Versioning](https://semver.org); while they are below 1.0, a minor version may change behaviour. `eve` pins the exact `core` version it was tested with.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
