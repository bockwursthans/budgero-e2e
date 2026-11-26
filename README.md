# Budgero end-to-end tests

Playwright tests that drive [Budgero](https://github.com/tombadilo-bombadilo/budgero) in a real browser against a throwaway self-host instance. They are kept outside the Budgero repository on purpose: upstream has no browser-test setup, and these can be adopted (or not) independently of any feature PR.

## What is covered

| Test | Needs | What it checks |
| --- | --- | --- |
| `tests/settlement.spec.mjs` | the household settlement ([#3](https://github.com/tombadilo-bombadilo/budgero/issues/3), branch [`feat/household-settlement-pr`](https://github.com/bockwursthans/budgero/tree/feat/household-settlement-pr)) | Alex onboards and invites Sam; Sam joins with their own login. Both record income and spending, Alex sets up the terms, Sam agrees from their own session. Checks the open balance, a personal category paid by the other one, the settle-up dialog (one transfer per item) and that the balance reaches zero. Writes the screenshots used in the discussion. |
| `tests/quick-entry.spec.mjs` | keyboard entry in the add-transaction dialog (branch [`feat/quick-transaction-entry`](https://github.com/bockwursthans/budgero/tree/feat/quick-transaction-entry)) | Opens the dialog with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> and enters an expense without the mouse: amount with a typed decimal comma, a relative date, type-to-search pickers, save-and-next, a leading `+` for income, Escape asking before discarding, <kbd>Alt</kbd>+<kbd>1</kbd>/<kbd>2</kbd> for the kind. |

Each test needs the feature it tests; on a branch that has both, `npx playwright test` runs both. Writing the quick-entry test found three bugs that unit tests missed (an Enter right after the last digit saved the previous amount, a stale caret update moved the cursor, a tab list stealing focus); they are fixed on that branch.

All people, accounts and amounts are made up (Alex, Sam, Robin). The passwords and the JWT secret are fixed and only meant for the local instance the tests start and delete again.

## How it works

`lib/global-setup.mjs` starts the self-host binary on `localhost:3101` with a fresh SQLite file in a temp folder and creates the test users with `budgero admin create-user`. Playwright runs the tests against it, then the instance and its data are deleted. Server output goes to `logs/server.log`.

`lib/app.mjs` holds the page helpers (sign-in, onboarding, invites, accounts, transactions, settlement setup). They use roles, labels and the app's existing `data-testid`s; the English UI is assumed.

## Run

Requirements: Node 22, pnpm, Go, and a Budgero checkout of the branch to test, by default next to this folder (`../budgero`; set `BUDGERO_REPO` otherwise).

```sh
npm install
npx playwright install chromium
./scripts/build-binary.sh         # Windows: pwsh scripts/build-binary.ps1
npx playwright test               # or one file: npx playwright test tests/quick-entry.spec.mjs
```

`npm run serve` keeps such an instance running for manual exploration (<kbd>Ctrl</kbd>+<kbd>C</kbd> stops and wipes it). `BUDGERO_E2E_BINARY` and `BUDGERO_E2E_PORT` override the binary and the port.

## License

AGPL-3.0, like Budgero.
