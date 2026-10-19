import { account, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/*
 * One person's journey through Mustard, in order. Each test continues on the
 * same device (its saved data carries over), and each is recorded to
 * videos/<test name>.webm.
 *
 * Expected numbers are worked out by hand from the inputs:
 *   Salary   $5,000 every 2 weeks = $130,000 a year = $10,833.33 a month
 *   Dividends $6,000 a year = $500 a month
 *   Pension  starts in 2040, so it isn't counted today
 *   Expenses Rent $2,400 + Groceries $900 = $3,300 a month
 */

test.describe.configure({ mode: 'serial' });

/** Opens a top-level section from the navigation menu. */
async function openSection(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click();
}

/**
 * Text the user can see. Screens stay mounted after you leave them and
 * dropdowns hold their options as hidden elements, so the same text can also
 * exist out of sight; this skips those copies.
 */
function shown(page: Page, text: string | RegExp, options?: { exact?: boolean }) {
  return page.getByText(text, options).filter({ visible: true }).first();
}

/** A record's row on a section's overview page (its name, then a summary). */
function listed(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByRole('link', { name: new RegExp(`^${escaped} `) });
}

/** Saves the open add/edit form with its main button. */
async function save(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

test('01 Sign up and turn on sync', async ({ app }) => {
  const { email, password } = account();
  await app.goto('/');
  await expect(shown(app, 'Welcome to Mustard')).toBeVisible();

  await app.goto('/settings');
  await app.getByRole('switch', { name: 'Save to server' }).click();
  await app.getByRole('button', { name: 'Create account', exact: true }).click();

  await app.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await app.getByLabel('Password', { exact: true }).filter({ visible: true }).fill(password);
  await app.getByRole('button', { name: 'Create account', exact: true }).click();

  // Back on Settings, signed in and synced.
  await expect(app).toHaveURL(/\/settings/);
  await expect(shown(app, `Signed in as ${email}`)).toBeVisible();
  await expect(shown(app, /Synced at/)).toBeVisible();
});

test('02 Fill in the profile', async ({ app }) => {
  await app.goto('/profile');
  await app.getByRole('textbox', { name: 'ZIP code', exact: true }).fill('94103');
  await app.getByRole('radio', { name: 'Married filing jointly' }).click();
  await app.getByRole('textbox', { name: 'Default expected investment return, % a year', exact: true }).fill('6');
  await app.getByRole('textbox', { name: 'Expected inflation, % a year', exact: true }).fill('2.5');

  // The Profile holds no tax rates: taxes are worked out on the server (see test 04).
  await expect(shown(app, /worked out by the Mustard server/)).toBeVisible();
  await expect(shown(app, 'Federal income tax')).toHaveCount(0);
});

test('03 Add, edit and remove household members', async ({ app }) => {
  await app.goto('/');
  await openSection(app, 'Household');
  await app.getByRole('button', { name: 'Add profile' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Alex');
  await app.getByRole('radio', { name: 'Me' }).click();
  await app.getByRole('textbox', { name: 'Birth year (optional)', exact: true }).fill('1988');
  await save(app, 'Save profile');
  await expect(shown(app, 'Alex')).toBeVisible();

  await app.getByRole('link', { name: '+ Add profile' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Sam');
  await app.getByRole('radio', { name: 'Child' }).click();
  await save(app, 'Save profile');

  // Edit from the menu: give Sam a birth year.
  await app.getByRole('button', { name: 'Edit Sam' }).click();
  await app.getByRole('textbox', { name: 'Birth year (optional)', exact: true }).fill('2019');
  await save(app, 'Save changes');
  await expect(shown(app, /2019/)).toBeVisible();

  // Add someone by mistake, then delete them from the menu.
  await app.getByRole('link', { name: '+ Add profile' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Typo');
  await save(app, 'Save profile');
  await app.getByRole('button', { name: 'Delete Typo' }).click();
  // Deleting the open record returns to the Household list.
  await expect(app.getByRole('link', { name: /^Alex Me/ })).toBeVisible();
  await expect(app.getByRole('link', { name: /^Sam Child · age \d+/ })).toBeVisible();
  await expect(app.getByRole('link', { name: /^Typo/ })).toHaveCount(0);
});

test('04 Add W-2 income with workplace savings', async ({ app }) => {
  await app.goto('/');
  await openSection(app, 'Income');
  await app.getByRole('button', { name: 'Add income' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Salary');
  await app.getByRole('textbox', { name: 'Amount', exact: true }).fill('5000');
  await app.getByRole('combobox', { name: 'How often', exact: true }).selectOption({ label: 'Bi-weekly' });
  await expect(app.getByRole('combobox', { name: 'Income type', exact: true })).toHaveValue('w2');

  const retirement = app.getByRole('group', { name: '401(k) / 403(b)' });
  await retirement.getByRole('textbox', { name: 'Your contribution, % of pay', exact: true }).fill('10');
  await retirement.getByRole('textbox', { name: 'Employer match, % of your contribution', exact: true }).fill('50');
  await retirement.getByRole('textbox', { name: 'Up to, % of pay (blank if no limit)', exact: true }).fill('6');
  await retirement.getByRole('textbox', { name: 'Balance', exact: true }).fill('80000');
  const hsa = app.getByRole('group', { name: 'Health savings account (HSA)' });
  await hsa.getByRole('textbox', { name: 'Your contributions per year', exact: true }).fill('4000');
  await hsa.getByRole('textbox', { name: 'Employer contributions per year', exact: true }).fill('1000');
  await hsa.getByRole('checkbox', { name: 'Family coverage' }).click();

  // The live summary: 10% of $130,000, and 50% of the first 6% of pay.
  await expect(
    shown(app, '401(k) / 403(b) - Traditional: $13,000 a year from you, $3,900 from your employer')
  ).toBeVisible();
  await save(app, 'Save income');

  // The item page estimates taxes and withholding per paycheck.
  await expect(shown(app, 'Estimated taxes and withholding')).toBeVisible();
  // Computed by the signed-in server for the Profile's ZIP code (San Francisco):
  // federal and California income tax.
  await expect(app.getByRole('row', { name: /^Federal income tax/ })).toBeVisible();
  await expect(app.getByRole('row', { name: /^State income tax · California/ })).toBeVisible();
  await expect(shown(app, 'W-2 wages')).toBeVisible();
  const contribution = app.getByRole('row', { name: /401\(k\) \/ 403\(b\) - Traditional contribution/ });
  // A new job starts this month, so this year counts only the months left:
  // $13,000 a year prorated, and still $500 a paycheck ($13,000 / 26).
  const now = new Date();
  const months = 12 - now.getMonth();
  const thisYear = (13_000 * months) / 12;
  await expect(app.getByRole('combobox', { name: 'Tax year' })).toBeVisible();
  await expect(contribution).toContainText(
    `-$${thisYear.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  await expect(contribution).toContainText('-$500.00');
  await expect(app.getByRole('row', { name: /Take-home pay/ })).toBeVisible();

  // Each plan is also an investment, linked both ways: the income lists them...
  await expect(shown(app, 'Workplace accounts')).toBeVisible();
  await app.getByRole('link', { name: /401\(k\) - Traditional from Salary · About \$80,000 today/ }).click();
  // ...and the account's page links back to the income.
  await expect(shown(app, '401(k) - Traditional')).toBeVisible();
  await expect(app.getByRole('link', { name: /401\(k\) \/ 403\(b\) - Traditional at Salary/ })).toBeVisible();
});

test('05 Add dividends and a future pension', async ({ app }) => {
  await app.goto('/income/new');
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Dividends');
  await app.getByRole('textbox', { name: 'Amount', exact: true }).fill('6000');
  await app.getByRole('combobox', { name: 'How often', exact: true }).selectOption({ label: 'Yearly' });
  await app.getByRole('combobox', { name: 'Income type', exact: true }).selectOption({ label: '1099-DIV dividends' });
  await save(app, 'Save income');
  await expect(shown(app, '1099-DIV dividends')).toBeVisible();

  await app.getByRole('link', { name: '+ Add income' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Pension');
  await app.getByRole('textbox', { name: 'Amount', exact: true }).fill('2000');
  await app.getByRole('combobox', { name: 'Income type', exact: true }).selectOption({ label: '1099-R pensions, retirement plans' });
  const starts = app.getByRole('group', { name: 'Starts' });
  await starts.getByRole('combobox', { name: 'Month (optional)', exact: true }).selectOption({ label: 'Jul' });
  await starts.getByRole('textbox', { name: 'Year', exact: true }).fill('2040');
  await save(app, 'Save income');
  await expect(shown(app, 'From July 2040')).toBeVisible();

  // Today's total leaves out the pension: $10,833.33 + $500.
  await openSection(app, 'Income');
  await expect(shown(app, '$11,333.33')).toBeVisible();
  await expect(shown(app, '1 income isn’t in effect today and isn’t counted.')).toBeVisible();
});

test('06 Add investments with a withdrawal plan', async ({ app }) => {
  await app.goto('/investments/new');
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Brokerage');
  await app.getByRole('textbox', { name: 'Value', exact: true }).fill('50000');
  await save(app, 'Save investment');
  await expect(shown(app, 'Brokerage (taxable)')).toBeVisible();

  await app.getByRole('link', { name: '+ Add investment' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Rollover IRA');
  await app.getByRole('textbox', { name: 'Value', exact: true }).fill('300000');
  await app.getByRole('combobox', { name: 'Account type', exact: true }).selectOption({ label: 'IRA - Traditional' });
  const withdrawals = app.getByRole('group', { name: 'Withdrawals start' });
  await withdrawals.getByRole('textbox', { name: 'Year', exact: true }).fill('2045');
  await app.getByRole('textbox', { name: 'Withdraw each year, % of balance', exact: true }).fill('4');
  await save(app, 'Save investment');
  await expect(shown(app, '4% of the balance a year, from 2045')).toBeVisible();

  // Total: $50,000 + $300,000 + the $80,000 401(k) entered on Salary, which is in
  // the list with Salary's HSA (from $0) as investments of their own.
  await openSection(app, 'Investments');
  await expect(shown(app, '$430,000.00')).toBeVisible();
  await expect(app.getByRole('link', { name: /^401\(k\) - Traditional from Salary \$80,000\.00/ })).toBeVisible();
  await expect(app.getByRole('link', { name: /^HSA from Salary \$0\.00/ })).toBeVisible();
  await expect(shown(app, 'Paycheck contributions')).toBeVisible();
});

test('07 Add expenses', async ({ app }) => {
  await app.goto('/expenses/new');
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Rent');
  await app.getByRole('textbox', { name: 'Amount', exact: true }).fill('2400');
  // New expenses default to one-time.
  await expect(app.getByRole('combobox', { name: 'How often', exact: true })).toHaveValue('once');
  await app.getByRole('combobox', { name: 'How often', exact: true }).selectOption({ label: 'Monthly' });
  await save(app, 'Save expense');

  await app.getByRole('link', { name: '+ Add expense' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Groceries');
  await app.getByRole('textbox', { name: 'Amount', exact: true }).fill('900');
  await app.getByRole('combobox', { name: 'How often', exact: true }).selectOption({ label: 'Monthly' });
  await save(app, 'Save expense');

  await openSection(app, 'Expenses');
  await expect(shown(app, '$3,300.00')).toBeVisible();
});

test('08 Check the income statement on Home', async ({ app }) => {
  await app.goto('/');
  await expect(shown(app, 'Income statement')).toBeVisible();
  const total = app.getByRole('row', { name: /Total income/ });
  await expect(total).toContainText('$11,333');
  await expect(app.getByRole('row', { name: /Total expenses/ })).toContainText('-$3,300');
  await expect(app.getByRole('row', { name: /Total saved/ })).toBeVisible();

  await app.getByRole('radio', { name: 'Yearly' }).click();
  await expect(total).toContainText('$136,000');
  await expect(shown(app, 'Passive income')).toBeVisible();
});

test('09 Plan a scenario with a life event', async ({ app }) => {
  await app.goto('/');
  await openSection(app, 'Scenarios');
  await app.getByRole('button', { name: 'Add scenario' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Retire at 60');
  await app.getByRole('button', { name: 'Create scenario' }).click();
  await expect(app.getByRole('link', { name: 'Retire at 60', exact: true })).toBeVisible();

  await app.getByRole('button', { name: '+ Add life event' }).click();
  await app.getByRole('textbox', { name: 'Name', exact: true }).last().fill('New roof');
  await app.getByRole('textbox', { name: 'Year it starts (1 = first year)', exact: true }).fill('3');
  await app.getByRole('textbox', { name: 'Amount (today’s dollars)', exact: true }).fill('30000');
  await app.getByRole('button', { name: 'Add event' }).click();

  await expect(shown(app, 'New roof')).toBeVisible();
  await expect(shown(app, 'Year 3: $30,000')).toBeVisible();
  await expect(shown(app, 'Investments after 20 years, in today’s dollars')).toBeVisible();
});

test('10 Ask the assistant to add an expense', async ({ app }) => {
  await app.goto('/');
  await app.getByRole('button', { name: 'Open the assistant' }).click();
  const message = app.getByRole('textbox', { name: 'Message', exact: true });

  // The stand-in model proposes the expense plus an invalid change.
  await message.fill('Please add my car insurance');
  await message.press('Enter');
  await expect(shown(app, 'Add expense: Car insurance, $1,200.00 / year')).toBeVisible();
  await expect(shown(app, '1 proposed change wasn’t valid and was left out.')).toBeVisible();
  await app.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(shown(app, 'Applied', { exact: true })).toBeVisible();

  // Its answers see the data on the device, including what was just added.
  await message.fill('What do I have?');
  await message.press('Enter');
  await expect(shown(app, /You have \d+ items: .*Car insurance.*Salary/)).toBeVisible();

  await app.getByRole('button', { name: 'Close the assistant' }).last().click();
  await openSection(app, 'Expenses');
  await expect(listed(app, 'Car insurance')).toBeVisible();
});

test('11 Sign in on a second device and find everything synced', async ({ newDevice }) => {
  const { email, password } = account();
  await newDevice.goto('/settings');
  await newDevice.getByRole('switch', { name: 'Save to server' }).click();
  await newDevice.getByRole('button', { name: 'Sign in', exact: true }).click();
  // The account page has Sign in and Join tabs; Settings' "Sign in" opens the first.
  await expect(newDevice.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
  await expect(newDevice.getByRole('tab', { name: 'Join' })).toHaveAttribute('aria-selected', 'false');
  await newDevice.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await newDevice.getByLabel('Password', { exact: true }).filter({ visible: true }).fill(password);
  await newDevice.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(shown(newDevice, `Signed in as ${email}`)).toBeVisible();
  await expect(shown(newDevice, /Synced at/)).toBeVisible();

  await openSection(newDevice, 'Income');
  for (const name of ['Salary', 'Dividends', 'Pension']) {
    await expect(listed(newDevice, name)).toBeVisible();
  }
  await openSection(newDevice, 'Expenses');
  for (const name of ['Rent', 'Groceries', 'Car insurance']) {
    await expect(listed(newDevice, name)).toBeVisible();
  }
  await openSection(newDevice, 'Household');
  await expect(listed(newDevice, 'Sam')).toBeVisible();
  await expect(listed(newDevice, 'Typo')).toHaveCount(0);

  await newDevice.goto('/profile');
  await expect(newDevice.getByRole('textbox', { name: 'ZIP code', exact: true })).toHaveValue('94103');
});

test('12 Search the articles', async ({ app }) => {
  await app.goto('/articles');
  await app.getByRole('searchbox', { name: 'Search articles' }).fill('trade school');
  // The best match comes first (row 0 is the table header).
  await expect(app.getByRole('row').nth(1)).toContainText('Trade vs college');
});
