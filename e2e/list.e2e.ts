import { test, expect, type Page, type Locator } from '@playwright/test';

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[type=password]', 'e2e-pass');
	await page.click('button[type=submit]');
	await page.waitForURL('/');
}
async function resetServer(page: Page) {
	const res = await page.request.post('/api/_test/reset');
	expect(res.ok()).toBeTruthy();
}

const quickAdd = (page: Page) => page.locator('.quickadd input');
const item = (page: Page, name: string): Locator => page.locator(`li[data-name="${name}"]`);

async function addItem(page: Page, name: string) {
	await quickAdd(page).fill(name);
	await quickAdd(page).press('Enter');
	await expect(item(page, name)).toBeVisible();
}
async function addItemInSection(page: Page, name: string, section: string) {
	const inp = page.locator(`section[data-zone]:has(h2:has-text("${section}")) .additem input`);
	await inp.fill(name);
	await inp.press('Enter');
	await expect(item(page, name)).toBeVisible();
}
async function setArrange(page: Page, on: boolean) {
	const btn = page.locator('.topbar nav button');
	const label = await btn.textContent();
	if ((label?.trim() === 'Arrange') === on) await btn.click();
}
async function addSection(page: Page, name: string) {
	await setArrange(page, true);
	await page.fill('.addsection input', name);
	await page.press('.addsection input', 'Enter');
	await expect(page.locator(`h2:has-text("${name}")`)).toBeVisible();
}
async function check(page: Page, name: string) {
	await item(page, name).locator('.main').click();
}
async function openRow(page: Page, name: string) {
	await item(page, name).locator('.chev').click();
}

/** SortableJS-friendly drag by the grip handle (needs Arrange mode on). */
async function drag(page: Page, name: string, targetSelector: string) {
	await setArrange(page, true);
	const handle = item(page, name).locator('.item-handle');
	const dst = page.locator(targetSelector).first();
	const s = await handle.boundingBox();
	const d = await dst.boundingBox();
	if (!s || !d) throw new Error('missing boxes');
	await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(80);
	await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2 + 10, { steps: 5 });
	await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 20 });
	await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2 + 2, { steps: 5 });
	await page.waitForTimeout(50);
	await page.mouse.up();
	await page.waitForTimeout(100);
}

async function waitSynced(page: Page) {
	await expect(page.locator('.statusbar')).toHaveCount(0, { timeout: 8000 });
}
async function freshReload(page: Page) {
	await waitSynced(page);
	await page.evaluate(() => indexedDB.deleteDatabase('list'));
	await page.reload();
	await expect(quickAdd(page)).toBeVisible();
}

const sectionZone = (name: string) => `section[data-zone]:has(h2:has-text("${name}")) ul`;

test.beforeEach(async ({ page }) => {
	await login(page);
	await resetServer(page);
	await page.evaluate(async () => {
		indexedDB.deleteDatabase('list');
		localStorage.clear();
	});
	await page.reload();
	await expect(quickAdd(page)).toBeVisible();
});

test('adds items to the end, then drag into a section persists per place', async ({ page }) => {
	await addItem(page, 'Milk');
	await addItem(page, 'Bananas');
	await addSection(page, 'Produce');

	await drag(page, 'Bananas', sectionZone('Produce'));
	await expect(page.locator(sectionZone('Produce')).getByText('Bananas', { exact: true })).toBeVisible();

	await freshReload(page);
	await expect(page.locator(sectionZone('Produce')).getByText('Bananas', { exact: true })).toBeVisible();
});

test('an item added inside a store only appears there (and in All)', async ({ page }) => {
	await addItem(page, 'Milk');
	page.once('dialog', (d) => d.accept('Hardware'));
	await page.click('button.chip.add');
	await page.click('button.chip:has-text("Hardware")');
	await addItem(page, 'Nails');

	await expect(item(page, 'Nails')).toBeVisible();
	await expect(item(page, 'Milk')).toBeVisible();

	page.once('dialog', (d) => d.accept('Costco'));
	await page.click('button.chip.add');
	await page.click('button.chip:has-text("Costco")');
	await expect(item(page, 'Milk')).toBeVisible();
	await expect(item(page, 'Nails')).toHaveCount(0);

	await page.click('button.chip:has-text("All")');
	await expect(item(page, 'Nails')).toBeVisible();
});

test('a section hidden for a store can be un-hidden', async ({ page }) => {
	await addSection(page, 'Pharmacy');
	page.once('dialog', (d) => d.accept('Costco'));
	await page.click('button.chip.add');
	await page.click('button.chip:has-text("Costco")');

	await setArrange(page, true);
	await page.click('section[data-zone]:has(h2:has-text("Pharmacy")) button[title="Hide this section here"]');
	await expect(page.locator('h2:has-text("Pharmacy")')).toHaveCount(0);
	await expect(page.locator('h2:has-text("Hidden sections here")')).toBeVisible();

	await page.click('button.unhide:has-text("Pharmacy")');
	await expect(page.locator('h2:has-text("Pharmacy")')).toBeVisible();
});

test('"only show here" pins an item to the current store', async ({ page }) => {
	await addItem(page, 'Bulk Rice'); // added from All -> everywhere
	page.once('dialog', (d) => d.accept('Costco'));
	await page.click('button.chip.add');
	page.once('dialog', (d) => d.accept('Corner Store'));
	await page.click('button.chip.add');

	await page.click('button.chip:has-text("Costco")');
	await openRow(page, 'Bulk Rice');
	await item(page, 'Bulk Rice').getByRole('button', { name: 'Only show here' }).click();

	await page.click('button.chip:has-text("Corner Store")');
	await expect(item(page, 'Bulk Rice')).toHaveCount(0);
	await page.click('button.chip:has-text("Costco")');
	await expect(item(page, 'Bulk Rice')).toBeVisible();

	// release it back to everywhere
	await openRow(page, 'Bulk Rice');
	await item(page, 'Bulk Rice').getByRole('button', { name: 'Show at every store' }).click();
	await page.click('button.chip:has-text("Corner Store")');
	await expect(item(page, 'Bulk Rice')).toBeVisible();
});

test('hide an item for one store only', async ({ page }) => {
	await addItem(page, 'Soy Milk');
	page.once('dialog', (d) => d.accept('Costco'));
	await page.click('button.chip.add');
	await page.click('button.chip:has-text("Costco")');

	await openRow(page, 'Soy Milk');
	await item(page, 'Soy Milk').getByRole('button', { name: 'Hide here' }).click();
	await expect(page.locator('h2:has-text("Hidden here")')).toBeVisible();

	await page.click('button.chip:has-text("All")');
	await expect(page.locator('h2:has-text("Hidden here")')).toHaveCount(0);
});

test('check off then clear removes from list but remembers placement', async ({ page }) => {
	await addItem(page, 'Eggs');
	await addSection(page, 'Dairy');
	await drag(page, 'Eggs', sectionZone('Dairy'));
	await setArrange(page, false);

	await check(page, 'Eggs');
	await expect(page.locator('h2:has-text("Checked")')).toBeVisible();
	await page.click('h2:has-text("Checked") button:has-text("Clear")');
	await expect(item(page, 'Eggs')).toHaveCount(0);

	await addItem(page, 'Eggs');
	await expect(page.locator(sectionZone('Dairy')).getByText('Eggs', { exact: true })).toBeVisible();
});

test('Sections screen: multi-store visibility, rename, delete', async ({ page }) => {
	page.once('dialog', (d) => d.accept('Costco'));
	await page.click('button.chip.add');
	page.once('dialog', (d) => d.accept('Fred Meyer'));
	await page.click('button.chip.add');

	await page.click('a[href="/sections"]');
	await page.fill('.add input', 'Dairy');
	await page.press('.add input', 'Enter');
	await expect(page.getByRole('button', { name: 'Dairy' })).toBeVisible();
	const id = await page
		.locator('.sec')
		.filter({ has: page.getByRole('button', { name: 'Dairy' }) })
		.getAttribute('data-id');
	const dairy = page.locator(`.sec[data-id="${id}"]`);

	await expect(dairy.locator('.store:has-text("Costco")')).toHaveClass(/on/);
	await dairy.locator('.store:has-text("Costco")').click();
	await expect(dairy.locator('.store:has-text("Costco")')).not.toHaveClass(/on/);

	await page.click('a[href="/"]');
	await page.click('button.chip:has-text("Fred Meyer")');
	await expect(page.locator('h2:has-text("Dairy")')).toBeVisible();
	await page.click('button.chip:has-text("Costco")');
	await expect(page.locator('h2:has-text("Dairy")')).toHaveCount(0);

	await page.click('a[href="/sections"]');
	const row = page.locator(`.sec[data-id="${id}"]`);
	await row.locator('button.name').click();
	await row.locator('input').fill('Cooler');
	await row.locator('input').press('Enter');
	await expect(page.getByRole('button', { name: 'Cooler' })).toBeVisible();
	page.once('dialog', (d) => d.accept());
	await row.locator('button[title="Delete section"]').click();
	await expect(page.locator(`.sec[data-id="${id}"]`)).toHaveCount(0);
});

test('add-item autocomplete suggests catalog items by substring', async ({ page }) => {
	await addItem(page, 'Soy Milk');
	await addItem(page, 'Oat Milk');
	await addItem(page, 'Bread');
	for (const n of ['Soy Milk', 'Oat Milk']) {
		await openRow(page, n);
		await item(page, n).getByRole('button', { name: 'Remove' }).click();
	}

	await quickAdd(page).click();
	await quickAdd(page).fill('milk');
	const menu = page.locator('.quickadd .menu');
	await expect(menu).toContainText('Soy Milk');
	await expect(menu).toContainText('Oat Milk');
	await expect(menu).not.toContainText('Bread');

	await menu.locator('button:has-text("Oat Milk")').click();
	await expect(item(page, 'Oat Milk')).toBeVisible();
	await expect(item(page, 'Soy Milk')).toHaveCount(0);
});

test('Items screen: staples filter, edit, delete, add back to list', async ({ page }) => {
	await addItem(page, 'Coffee');
	await addItem(page, 'Sugar');

	await page.click('a[href="/catalog"]');
	await expect(page.locator('.item:has-text("Coffee")')).toBeVisible();

	await page.click('.item:has-text("Coffee") .star');
	await page.check('.tools input[type=checkbox]');
	await expect(page.locator('.item:has-text("Coffee")')).toBeVisible();
	await expect(page.locator('.item:has-text("Sugar")')).toHaveCount(0);

	await page.click('a[href="/"]');
	await openRow(page, 'Coffee');
	await item(page, 'Coffee').getByRole('button', { name: 'Remove' }).click();
	await expect(item(page, 'Coffee')).toHaveCount(0);

	await page.click('a[href="/catalog"]');
	await page.click('.item:has-text("Coffee") button:has-text("+ list")');
	await expect(page.locator('.item:has-text("Coffee") .badge')).toHaveText('on list');
	await page.click('a[href="/"]');
	await expect(item(page, 'Coffee')).toBeVisible();

	await page.click('a[href="/catalog"]');
	await page.uncheck('.tools input[type=checkbox]');
	await page.click('.item:has-text("Sugar") .body');
	page.once('dialog', (d) => d.accept());
	await page.click('.item:has-text("Sugar") button:has-text("Delete")');
	await expect(page.locator('.item:has-text("Sugar")')).toHaveCount(0);
});

test('typing a quantity bumps one item, and the stepper adjusts it', async ({ page }) => {
	await addItem(page, 'milk');
	await expect(item(page, 'milk')).toBeVisible();

	// "4 milks" -> still one "milk", quantity 5
	await quickAdd(page).fill('4 milks');
	await quickAdd(page).press('Enter');
	await expect(item(page, 'milk').locator('.qty')).toHaveText('×5');
	await expect(page.locator('li[data-id]')).toHaveCount(1);

	// stepper in the options sheet
	await openRow(page, 'milk');
	await item(page, 'milk').getByRole('button', { name: 'Less' }).click();
	await expect(item(page, 'milk').locator('.qty')).toHaveText('×4');
});

test('quick-add API endpoint adds an item; rejects a bad token', async ({ page, playwright, baseURL }) => {
	const res = await page.request.post('/api/quick-add', {
		headers: { authorization: 'Bearer e2e-api-token' },
		data: { name: 'From Voice' }
	});
	expect(res.ok()).toBeTruthy();
	await page.reload();
	await expect(item(page, 'From Voice')).toBeVisible();

	// a fresh context with no session cookie -> bad token is rejected
	const anon = await playwright.request.newContext({ baseURL });
	const bad = await anon.post('/api/quick-add', {
		headers: { authorization: 'Bearer wrong' },
		data: { name: 'nope' }
	});
	expect(bad.status()).toBe(401);
	await anon.dispose();
});

test('setup endpoint refuses once a password is set; login page shows the sign-in form', async ({
	page,
	playwright,
	baseURL
}) => {
	// the e2e server boots with LIST_PASSWORD set, so setup must be closed
	const anon = await playwright.request.newContext({ baseURL });
	const res = await anon.post('/api/setup', { data: { password: 'brand-new-password' } });
	expect(res.status()).toBe(409);

	// the refactored login path still works with the seeded password
	const good = await anon.post('/api/login', { data: { password: 'e2e-pass' } });
	expect(good.ok()).toBeTruthy();
	await anon.dispose();

	// logged out, the login page shows the sign-in form (not the create-password form)
	await page.context().clearCookies();
	await page.goto('/login');
	await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create password' })).toHaveCount(0);
});

test('live sync between two tabs', async ({ page, context }) => {
	await addItem(page, 'Bread');
	const tab2 = await context.newPage();
	await tab2.goto('/');
	await expect(item(tab2, 'Bread')).toBeVisible({ timeout: 5000 });

	await addItem(tab2, 'Butter');
	await expect(item(page, 'Butter')).toBeVisible({ timeout: 5000 });
});

test('offline edits queue and sync on reconnect', async ({ page, context }) => {
	await addItem(page, 'Online Item');
	await context.setOffline(true);
	await addItem(page, 'Offline Item');
	await expect(page.locator('.statusbar')).toContainText('unsynced');

	await context.setOffline(false);
	await expect(page.locator('.statusbar')).toHaveCount(0, { timeout: 8000 });

	await page.evaluate(() => indexedDB.deleteDatabase('list'));
	await page.reload();
	await expect(item(page, 'Offline Item')).toBeVisible();
});
