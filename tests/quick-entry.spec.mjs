// Typing expenses into the add-transaction dialog without the mouse.
import { test, expect } from '@playwright/test';
import { USERS } from '../lib/instance.mjs';
import { describeUi, onboardNewBudget, signIn } from '../lib/app.mjs';

const ACCOUNT = 'Robin Checking';
const SCREENSHOT_DIR = 'screenshots';
const HIDE_TOASTS = '[data-sonner-toaster] { display: none !important; }';
/** Playwright types the keys one by one; a picker needs a moment to open on the first one. */
const TYPING = { delay: 60 };

test('quick entry from the keyboard', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await signIn(page, USERS.robin);
    await onboardNewBudget(page, { accountName: ACCOUNT });

    await page.keyboard.press('Control+Alt+t');
    const dialog = page.getByRole('dialog', { name: 'Add New Transaction' });
    await expect(dialog).toBeVisible();
    const focused = (locator) => expect(locator).toBeFocused();

    await test.step('amount: a comma typed for the decimal point, Enter moves on', async () => {
      await focused(dialog.getByTestId('transaction-amount-input').getByRole('textbox'));
      await page.keyboard.type('12,5', TYPING);
      await page.keyboard.press('Enter');
      await expect(dialog.getByTestId('transaction-amount-input')).toHaveText('12.5');
    });

    await test.step('date: typed relative to today, Enter moves on', async () => {
      const date = dialog.getByTestId('transaction-date-input');
      await focused(date);
      await page.keyboard.type('-1', TYPING);
      await page.keyboard.press('Enter');
      const yesterday = await page.evaluate(() =>
        new Intl.DateTimeFormat('en', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
          new Date(Date.now() - 24 * 60 * 60 * 1000)
        )
      );
      await expect(date).toHaveValue(yesterday);
    });

    await test.step('pickers: type to open, Enter or Tab picks and moves on', async () => {
      const account = dialog.getByTestId('transaction-from-account-select');
      await focused(account);
      await page.keyboard.type('robin', TYPING);
      await page.keyboard.press('Enter');
      await expect(account).toHaveText(ACCOUNT);

      const payee = dialog.getByTestId('transaction-payee-field').getByRole('combobox');
      await focused(payee);
      await page.keyboard.type('Bakery', TYPING);
      await page.keyboard.press('Tab');
      await expect(payee).toHaveText('Bakery');

      const category = dialog.getByTestId('transaction-category-field').getByRole('combobox');
      await focused(category);
      await page.keyboard.type('groc', TYPING);
      await page.keyboard.press('Tab');
      await expect(category).toHaveText('Groceries');

      await focused(dialog.getByTestId('transaction-memo-input'));
      await page.keyboard.type('Bread', TYPING);
    });

    await test.step('Ctrl+Shift+Enter saves and starts the next one', async () => {
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/10-quick-entry.png`,
        style: HIDE_TOASTS,
      });
      await page.keyboard.press('Control+Shift+Enter');
      const saved = dialog.getByTestId('last-saved');
      await expect(saved).toContainText('12.50');
      await expect(saved).toContainText('Groceries');
      await expect(saved).toContainText('Bakery');
      await expect(dialog.getByTestId('transaction-memo-input')).toHaveValue('');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/11-saved-next.png`, style: HIDE_TOASTS });
    });

    await test.step('a leading + makes it income; Escape asks before dropping it', async () => {
      await focused(dialog.getByTestId('transaction-amount-input').getByRole('textbox'));
      await page.keyboard.type('+3000', TYPING);
      await expect(dialog.getByTestId('add-transaction-submit')).toHaveText('Add Income');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      const discard = page.getByRole('alertdialog', { name: 'Discard this transaction?' });
      await expect(discard).toBeVisible();
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      await expect(dialog).toBeVisible();
    });

    await test.step('Alt+1 switches back to expense, Ctrl+Enter saves and closes', async () => {
      await dialog.getByTestId('transaction-memo-input').focus();
      await page.keyboard.press('Alt+1');
      await expect(dialog.getByTestId('add-transaction-submit')).toHaveText('Add Expense');
      await page.keyboard.press('Alt+2');
      await expect(dialog.getByTestId('add-transaction-submit')).toHaveText('Add Income');
      await page.keyboard.press('Control+Enter');
      await expect(dialog).toBeHidden();
    });
  } catch (error) {
    await page.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => {});
    console.log(`--- @ ${page.url()}\n${await describeUi(page).catch(() => '')}`);
    throw error;
  } finally {
    await context.close();
  }
});
