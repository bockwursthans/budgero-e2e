import { test, expect } from '@playwright/test';
import { USERS } from '../lib/instance.mjs';
import {
  SETTLEMENT_PATH,
  TRANSACTION_KIND,
  addCheckingAccount,
  addTransaction,
  createWorkspaceInvite,
  describeUi,
  navigate,
  onboardNewBudget,
  onboardWithInvite,
  refreshWorkspaceMembers,
  returnToTab,
  setUpSettlement,
  signIn,
} from '../lib/app.mjs';

const ACCOUNT = { alex: 'Alex Checking', sam: 'Sam Checking' };
const CATEGORY = {
  rent: 'Rent / Mortgage',
  groceries: 'Groceries',
  utilities: 'Utilities',
  diningOut: 'Dining out',
};
const SCREENSHOT_DIR = 'screenshots';
/** Save confirmations would cover the page in the screenshots. */
const HIDE_TOASTS = '[data-sonner-toaster] { display: none !important; }';
const VIEWPORT = { width: 1440, height: 900 };
const TALL_VIEWPORT = { width: 1440, height: 1200 };

/*
 * Alex earns 3,000 and Sam 2,000, so shared costs split 60 / 40.
 * Shared costs: rent 1,200 (Alex) + groceries 400 and utilities 150 (Sam) = 1,750.
 * Alex's share is 1,050 but paid 1,200; Sam's share is 700 but paid 550: Sam owes 150.
 * Dining out is Sam's personal category; Alex pays Sam's 50 dinner, which Sam owes in full.
 * Sam owes Alex 200 until a transfer of 200 from Sam to Alex brings it to 0.
 */
const AMOUNT = {
  alexIncome: 3000,
  samIncome: 2000,
  rent: 1200,
  groceries: 400,
  utilities: 150,
  samsDinner: 50,
  owed: 200,
};
const euro = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(amount);
const OWED = euro(AMOUNT.owed);
const ZERO = euro(0);

test('household settlement walkthrough', async ({ browser }, testInfo) => {
  const alexContext = await browser.newContext({ viewport: VIEWPORT });
  const samContext = await browser.newContext({ viewport: VIEWPORT });
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();
  const shot = (page, name) =>
    page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true, style: HIDE_TOASTS });

  try {
    await test.step('Alex sets up a budget', async () => {
      await signIn(alex, USERS.alex);
      await onboardNewBudget(alex, { accountName: ACCOUNT.alex });
    });

    const joinUrl = await test.step('Alex invites Sam', () => createWorkspaceInvite(alex));

    await test.step('Sam joins the workspace with their own login', async () => {
      await signIn(sam, USERS.sam);
      await onboardWithInvite(sam, joinUrl);
    });

    await test.step('Sam records their account, income and spending', async () => {
      await addCheckingAccount(sam, ACCOUNT.sam);
      await addTransaction(sam, {
        kind: TRANSACTION_KIND.income,
        amount: AMOUNT.samIncome,
        account: ACCOUNT.sam,
        payee: 'Sam Employer',
      });
      await addTransaction(sam, {
        kind: TRANSACTION_KIND.expense,
        amount: AMOUNT.groceries,
        account: ACCOUNT.sam,
        payee: 'Grocery Store',
        category: CATEGORY.groceries,
      });
      await addTransaction(sam, {
        kind: TRANSACTION_KIND.expense,
        amount: AMOUNT.utilities,
        account: ACCOUNT.sam,
        payee: 'Power Company',
        category: CATEGORY.utilities,
      });
    });

    await test.step('Alex records income and rent', async () => {
      await addTransaction(alex, {
        kind: TRANSACTION_KIND.income,
        amount: AMOUNT.alexIncome,
        account: ACCOUNT.alex,
        payee: 'Alex Employer',
      });
      await addTransaction(alex, {
        kind: TRANSACTION_KIND.expense,
        amount: AMOUNT.rent,
        account: ACCOUNT.alex,
        payee: 'Landlord',
        category: CATEGORY.rent,
      });
      await addTransaction(alex, {
        kind: TRANSACTION_KIND.expense,
        amount: AMOUNT.samsDinner,
        account: ACCOUNT.alex,
        payee: 'Restaurant',
        category: CATEGORY.diningOut,
      });
    });

    await test.step('Alex sets up the settlement terms', async () => {
      await refreshWorkspaceMembers(alex);
      await setUpSettlement(alex, {
        accountsByParticipant: { [USERS.alex.name]: [ACCOUNT.alex], [USERS.sam.name]: [ACCOUNT.sam] },
        personalCategoriesByParticipant: { [USERS.sam.name]: [CATEGORY.diningOut] },
        sharedCategories: [CATEGORY.rent, CATEGORY.groceries, CATEGORY.utilities],
        beforeSave: async (dialog) => {
          // A taller window so the whole form fits without scrolling.
          await alex.setViewportSize(TALL_VIEWPORT);
          await dialog.locator('.overflow-y-auto').evaluate((body) => body.scrollTo(0, 0));
          await shot(alex, '01-terms-dialog');
          await alex.setViewportSize(VIEWPORT);
        },
      });
    });

    await test.step('Sam agrees to the terms from their own login', async () => {
      await refreshWorkspaceMembers(sam);
      await navigate(sam, SETTLEMENT_PATH);
      const agree = sam.getByRole('button', { name: 'I agree to these terms' });
      await expect(agree).toBeVisible();
      await shot(sam, '02-awaiting-consent');
      await agree.click();
      await expect(sam.getByRole('button', { name: 'Withdraw my consent' })).toBeVisible();
    });

    await test.step('Alex sees the open balance once Sam has agreed', async () => {
      await returnToTab(alex);
      await expect(alex.getByText(OWED).first()).toBeVisible();
      await expect(alex.getByText(`-${OWED}`)).toBeVisible(); // Sam's balance
      await expect(alex.getByRole('columnheader', { name: 'Paid for each other' })).toBeVisible();
      await shot(alex, '03-open-balance');
      await alex
        .locator('button[aria-expanded]')
        .filter({ hasText: USERS.sam.name })
        .click();
      await expect(alex.getByText(CATEGORY.groceries).first()).toBeVisible();
      await expect(alex.getByText(CATEGORY.diningOut).first()).toBeVisible();
      await shot(alex, '04-details-by-category');
    });

    await test.step('Sam settles up from the report, one transfer per item', async () => {
      await navigate(sam, SETTLEMENT_PATH);
      await expect(sam.getByText('Nothing settled yet.')).toBeVisible();
      await sam.getByRole('button', { name: 'Settle up' }).click();
      const dialog = sam.getByRole('dialog');
      await expect(dialog.getByText(`Sam pays Alex ${OWED}`, { exact: false })).toBeVisible();
      await dialog.getByRole('radio', { name: /One transfer per item/ }).click();
      await expect(dialog.getByText('Settles the open balance')).toBeVisible();
      await shot(sam, '06-settle-up');
      await dialog.getByRole('button', { name: 'Record 2 transfers' }).click();
      await expect(dialog).toBeHidden();

      for (const user of [USERS.alex, USERS.sam]) {
        const row = sam
          .getByRole('row')
          .filter({ has: sam.locator('button[aria-expanded]').filter({ hasText: user.name }) });
        await expect(row.getByRole('cell').last()).toHaveText(ZERO);
      }
      await expect(sam.getByText('Nothing to settle', { exact: false })).toBeVisible();
      await expect(sam.getByText('Everything is settled.')).toBeVisible();
      const dinner = sam.getByRole('row').filter({ hasText: CATEGORY.diningOut });
      await expect(dinner.getByText('Settled', { exact: true })).toBeVisible();
      await shot(sam, '05-settled');
    });
  } catch (error) {
    for (const [name, page] of [
      ['alex', alex],
      ['sam', sam],
    ]) {
      await page.screenshot({ path: testInfo.outputPath(`${name}-failure.png`) }).catch(() => {});
      console.log(`--- ${name} @ ${page.url()}\n${await describeUi(page).catch(() => '')}`);
    }
    throw error;
  } finally {
    await alexContext.close();
    await samContext.close();
  }
});
