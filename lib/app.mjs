// Page helpers for the parts of Budgero the tests pass through (English UI).
import { expect } from '@playwright/test';
import { MASTER_PASSWORD } from './instance.mjs';

export const SETTLEMENT_PATH = '/reports/settlement';

/** Tabs of the add-transaction dialog (data-testid suffix). */
export const TRANSACTION_KIND = { income: 'inflow', expense: 'outflow', transfer: 'transfer' };

const LOGIN_PATH = '/auth/local/login';
const ONBOARDING_CURRENCY = /EUR Euro/;
const AMOUNT_PLACEHOLDER = '100 + 25 or 150 / 2';

/** Every page guide id (packages/app/src/features/page-guides/model/page-guides.ts). */
const PAGE_GUIDE_IDS = [
  'budget',
  'accounts',
  'transactions',
  'reports',
  'home',
  'rules',
  'recurring',
  'imports',
  'workspaces',
  'security',
  'currencies',
];
const PAGE_GUIDES_SEEN_KEY = 'budgero:page-guides';

/** Fields of the add-transaction dialog around its pickers (data-testid). */
const TRANSACTION_FIELD = {
  payee: 'transaction-payee-field',
  category: 'transaction-category-field',
};

// ---------------------------------------------------------------------------
// Sign-in, onboarding, navigation
// ---------------------------------------------------------------------------

/**
 * Marks every "How this works" guide as seen for the user, so none opens on a timer
 * in the middle of a dialog.
 */
async function skipPageGuides(page, userId) {
  await page.evaluate(
    ({ key, id, guides }) => localStorage.setItem(key, JSON.stringify({ [id]: guides })),
    { key: PAGE_GUIDES_SEEN_KEY, id: userId, guides: PAGE_GUIDE_IDS },
  );
}

export async function signIn(page, user) {
  await page.goto('/auth');
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Password').fill(user.password);
  const login = page.waitForResponse((response) => response.url().endsWith(LOGIN_PATH));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const { user: signedIn } = await (await login).json();
  await expect(page.getByRole('heading', { name: 'Welcome to Budgero.' })).toBeVisible();
  await skipPageGuides(page, signedIn.id);
}

async function setMasterPassword(page) {
  await page.getByPlaceholder('at least 8 characters').fill(MASTER_PASSWORD);
  await page.getByPlaceholder('type it once more').fill(MASTER_PASSWORD);
  await page.getByRole('button', { name: /Next/ }).click();
}

/** Onboarding for a new budget: euro, one checking account, the default envelopes. */
export async function onboardNewBudget(page, { accountName }) {
  await page.getByRole('button', { name: /Start my own budget/ }).click();
  await page.getByRole('button', { name: /Set up my budget/ }).click();
  await page.getByRole('button', { name: ONBOARDING_CURRENCY }).click();
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByPlaceholder('Checking name').fill(accountName);
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('button', { name: /Next/ }).click(); // default envelopes
  await setMasterPassword(page);
  await page.getByRole('button', { name: /Open my budget/ }).click();
  await expect(page).toHaveURL(/\/budgeting/);
}

/** Onboarding for an invitee: redeem the invite link instead of creating a budget. */
export async function onboardWithInvite(page, joinUrl) {
  await page.getByRole('button', { name: /Join with an invite code/ }).click();
  await page.getByRole('button', { name: /Enter my code/ }).click();
  await page.getByPlaceholder('paste the code or link here').fill(joinUrl);
  await page.getByRole('button', { name: /Check code/ }).click();
  await setMasterPassword(page);
  await page.getByRole('button', { name: /Join workspace|Open my budget/ }).click();
  await expect(page).toHaveURL(/\/budgeting/, { timeout: 60_000 });
}

/**
 * Client-side navigation. A full reload would drop the unlocked workspace (its key
 * only lives in memory), so the walkthrough never uses page.goto after sign-in.
 */
export async function navigate(page, path) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, '\\$&')}$`));
}

/** The user comes back to the tab (React Query listens for visibilitychange on window). */
export async function returnToTab(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
}

// ---------------------------------------------------------------------------
// Workspace sharing
// ---------------------------------------------------------------------------

/** Creates an invite for the active workspace and returns its join link. */
export async function createWorkspaceInvite(page) {
  await navigate(page, '/settings/workspaces');
  await page.getByRole('button', { name: 'Create Invite' }).click();
  const link = page.getByText(/\/join#code=/).last();
  await expect(link).toBeVisible();
  return (await link.innerText()).trim();
}

/**
 * Settings → Workspaces → Refresh. The member list is cached for half a minute, so a
 * member who just joined only shows up on the settlement page after a refresh.
 */
export async function refreshWorkspaceMembers(page) {
  await navigate(page, '/settings/workspaces');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Workspace list refreshed').first()).toBeVisible();
}

// ---------------------------------------------------------------------------
// Accounts and transactions
// ---------------------------------------------------------------------------

/** Accounts page → New Account: an on-budget checking account without opening balance. */
export async function addCheckingAccount(page, name) {
  await navigate(page, '/accounts');
  await page.getByTestId('add-account-trigger').click();
  const dialog = page.getByTestId('add-account-modal');
  await dialog.getByTestId('account-name-input').fill(name);
  await dialog.getByTestId('account-type-select').click();
  await page.getByRole('option', { name: 'Checking', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add Account' }).click();
  await expect(dialog).toBeHidden();
  // The app opens the new account's register.
  await expect(page).toHaveURL(/\/accounts\/\d+$/);
}

/** Opens a searchable picker, types the query and picks the matching (or new) entry. */
async function pickFromCombobox(page, combobox, value) {
  await combobox.click();
  await page.keyboard.type(value);
  const name = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Category options carry their balance after the name ("Groceries €0.00").
  const option = page.getByRole('option', {
    name: new RegExp(`^(Create "${name}"|${name})(\\s|$)`),
  });
  await option.first().click();
}

async function openTransactionDialog(page, kind) {
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add New Transaction' });
  await dialog.getByTestId(`transaction-type-${kind}`).click();
  return dialog;
}

async function fillAmount(page, dialog, amount) {
  const field = dialog
    .getByPlaceholder(AMOUNT_PLACEHOLDER)
    .or(dialog.getByText(AMOUNT_PLACEHOLDER));
  await field.first().click();
  await page.keyboard.type(String(amount));
}

async function submitTransaction(dialog) {
  await dialog.getByTestId('add-transaction-submit').click();
  await expect(dialog).toBeHidden();
}

/** Header → Add Transaction: an income or expense in one account. */
export async function addTransaction(page, { kind, amount, account, payee, category }) {
  const dialog = await openTransactionDialog(page, kind);
  await fillAmount(page, dialog, amount);
  const picker = (field) => dialog.getByTestId(field).getByRole('combobox');
  await pickFromCombobox(page, dialog.getByTestId('transaction-from-account-select'), account);
  await pickFromCombobox(page, picker(TRANSACTION_FIELD.payee), payee);
  // Income defaults to the Income category.
  if (category) await pickFromCombobox(page, picker(TRANSACTION_FIELD.category), category);
  await submitTransaction(dialog);
}

/** Header → Add Transaction → Transfer between two of the budget's accounts. */
export async function addTransfer(page, { amount, from, to }) {
  const dialog = await openTransactionDialog(page, TRANSACTION_KIND.transfer);
  await fillAmount(page, dialog, amount);
  await pickFromCombobox(page, dialog.getByTestId('transaction-from-account-select'), from);
  await pickFromCombobox(page, dialog.getByTestId('transaction-to-account-select'), to);
  await submitTransaction(dialog);
}

// ---------------------------------------------------------------------------
// Household settlement
// ---------------------------------------------------------------------------

/** The trigger of a settlement multi-select shows "None selected" / "2 selected". */
const multiSelectTrigger = (scope) => scope.locator('button').filter({ hasText: /selected$/ });

/** The settlement dialog's form fields are a label above their control. */
const labelledField = (page, scope, label) =>
  scope.locator('div.flex.flex-col.gap-1').filter({ has: page.getByText(label, { exact: true }) });

/** Picks entries in one of the settlement dialog's multi-selects, then closes it. */
async function chooseInMultiSelect(page, dialog, trigger, names) {
  await trigger.click();
  for (const name of names) {
    await page.getByRole('option', { name, exact: true }).click();
  }
  // Escape closes only the topmost layer (the picker), not the dialog under it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(dialog).toBeVisible();
}

/**
 * Settlement page → Set up settlement. Every member is prefilled as a participant and
 * the strategy defaults to "By income"; this adds accounts and shared categories.
 */
export async function setUpSettlement(
  page,
  { accountsByParticipant, personalCategoriesByParticipant = {}, sharedCategories, beforeSave },
) {
  await navigate(page, SETTLEMENT_PATH);
  await page.getByRole('button', { name: 'Set up settlement' }).click();
  const dialog = page.getByRole('dialog');
  const rows = dialog.locator('div.rounded-md.border').filter({ hasText: 'Budgero user' });
  await expect(rows).toHaveCount(Object.keys(accountsByParticipant).length);
  const rowOf = (participant) =>
    rows.filter({ has: page.getByRole('combobox').filter({ hasText: participant }) });
  for (const [participant, accounts] of Object.entries(accountsByParticipant)) {
    const field = labelledField(page, rowOf(participant), 'Personal accounts');
    await chooseInMultiSelect(page, dialog, multiSelectTrigger(field), accounts);
  }
  for (const [participant, categories] of Object.entries(personalCategoriesByParticipant)) {
    const field = labelledField(page, rowOf(participant), 'Personal categories');
    await chooseInMultiSelect(page, dialog, multiSelectTrigger(field), categories);
  }
  const sharedField = labelledField(page, dialog, 'Shared expense categories');
  await chooseInMultiSelect(page, dialog, multiSelectTrigger(sharedField), sharedCategories);
  if (beforeSave) await beforeSave(dialog);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

// ---------------------------------------------------------------------------
// Debugging
// ---------------------------------------------------------------------------

/** Lists the visible interactive elements – used to read selectors off a failing step. */
export async function describeUi(page) {
  return page.evaluate(() => {
    const out = [];
    const selector =
      'button, a, input, select, textarea, [role=button], [role=radio], [role=tab], [role=option], [role=menuitem], [role=checkbox], [role=combobox], label, h1, h2, h3';
    for (const el of document.querySelectorAll(selector)) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 70);
      const attrs = ['aria-label', 'placeholder', 'role', 'data-testid', 'id', 'name']
        .map((name) => el.getAttribute(name) && `${name}=${el.getAttribute(name)}`)
        .filter(Boolean)
        .join(' ');
      out.push(`${el.tagName.toLowerCase()} "${text}" ${attrs}`);
    }
    return out.join('\n');
  });
}
