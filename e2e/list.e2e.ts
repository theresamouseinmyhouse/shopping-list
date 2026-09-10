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
const listOrder = (page: Page) => page.locator('.list li[data-name]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.name));
/** a row inside a named store's group in the All view */
const inGroup = (page: Page, storeName: string, itemName: string): Locator =>
	page.locator(`.group:has(.gname:text-is("${storeName}")) li[data-name="${itemName}"]`);

async function addItem(page: Page, name: string) {
	await quickAdd(page).fill(name);
	await quickAdd(page).press('Enter');
	await expect(item(page, name)).toBeVisible();
}
async function addStore(page: Page, name: string) {
	await page.click('nav.tabbar a:has-text("Stores")');
	await page.click('.screen-head button[aria-label="Add store"]');
	await page.fill('.sheet-panel input.field', name);
	await page.click('.sheet-panel button:has-text("Add")');
	await expect(page.locator(`.store-row:has-text("${name}")`)).toBeVisible();
}
async function openStore(page: Page, name: string) {
	await page.click('nav.tabbar a:has-text("Stores")');
	await page.click(`.store-row:has-text("${name}")`);
	await expect(page).toHaveURL(/\/stores\/[^/]+$/);
}
async function check(page: Page, name: string) {
	await item(page, name).locator('.check').click();
}
async function openRow(page: Page, name: string) {
	await item(page, name).locator('.chev').click();
}

/** SortableJS-friendly drag of one row's grip handle onto another row (handles are always visible). */
async function drag(page: Page, name: string, targetName: string) {
	const handle = item(page, name).locator('.item-handle');
	const dst = item(page, targetName);
	await handle.waitFor({ state: 'visible' });
	await dst.waitFor({ state: 'visible' });
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

test('bottom tab bar navigates between sections without Back', async ({ page }) => {
	await expect(page.locator('nav.tabbar a[aria-current="page"]')).toHaveText(/List/);

	await page.locator('nav.tabbar a', { hasText: 'Items' }).click();
	await expect(page).toHaveURL(/\/catalog$/);
	await expect(page.locator('nav.tabbar a[aria-current="page"]')).toHaveText(/Items/);

	await page.locator('nav.tabbar a', { hasText: 'Recipes' }).click();
	await expect(page).toHaveURL(/\/recipes$/);

	await page.locator('nav.tabbar a', { hasText: 'List' }).click();
	await expect(page).toHaveURL(/\/$/);
});

test('no tab bar on the login screen', async ({ page, context }) => {
	await context.clearCookies();
	await page.goto('/login');
	await expect(page.locator('nav.tabbar')).toHaveCount(0);
});

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

test('new items land at the top; drag reorders and persists', async ({ page }) => {
	await addItem(page, 'Milk');
	await addItem(page, 'Bananas');
	await addItem(page, 'Bread');
	expect(await listOrder(page)).toEqual(['Bread', 'Bananas', 'Milk']); // newest first

	await drag(page, 'Bread', 'Milk'); // move Bread down past Milk
	await expect.poll(() => listOrder(page)).toEqual(['Bananas', 'Milk', 'Bread']);

	await freshReload(page);
	expect(await listOrder(page)).toEqual(['Bananas', 'Milk', 'Bread']);
});

test('a per-store order does not change the item in the All view', async ({ page }) => {
	await addItem(page, 'Rice');
	await addItem(page, 'Beans');

	await addStore(page, 'Costco');
	await openStore(page, 'Costco');

	await drag(page, 'Rice', 'Beans'); // Rice after Beans, at Costco only
	await expect.poll(() => listOrder(page)).toEqual(['Beans', 'Rice']);

	await page.click('nav.tabbar a:has-text("List")');
	expect(await listOrder(page)).toEqual(['Beans', 'Rice']); // All still by the default order (newest-first: Beans, Rice)
});

test('an item added inside a store only appears there (and in All)', async ({ page }) => {
	await addItem(page, 'Milk');
	await addStore(page, 'Hardware');
	await openStore(page, 'Hardware');
	await addItem(page, 'Nails');

	await expect(item(page, 'Nails')).toBeVisible();
	await expect(item(page, 'Milk')).toBeVisible(); // a global item still shows inside a store

	await addStore(page, 'Costco');
	await openStore(page, 'Costco');
	await expect(item(page, 'Milk')).toBeVisible();
	await expect(item(page, 'Nails')).toHaveCount(0);

	await page.click('nav.tabbar a:has-text("List")');
	await expect(item(page, 'Nails')).toBeVisible();
});

test('All view: dragging an item into a store group sorts it there and pins it', async ({ page }) => {
	await addItem(page, 'Ketchup'); // loose — "Not sorted yet"
	await addStore(page, 'Costco');
	await openStore(page, 'Costco');
	await addItem(page, 'Paper Towels'); // pinned to Costco
	await page.click('nav.tabbar a:has-text("List")');

	await expect(inGroup(page, 'Costco', 'Paper Towels')).toBeVisible();
	await drag(page, 'Ketchup', 'Paper Towels'); // drop into the Costco group
	await expect(inGroup(page, 'Costco', 'Ketchup')).toBeVisible();

	await freshReload(page);
	await expect(inGroup(page, 'Costco', 'Ketchup')).toBeVisible();
	await openStore(page, 'Costco');
	expect(await listOrder(page)).toContain('Ketchup'); // now on Costco's own list
});

test('checking off and clearing a store item, then re-adding from All, keeps its store', async ({ page }) => {
	await addItem(page, 'Pepitas');
	await addStore(page, 'Local Grocery');
	await openStore(page, 'Local Grocery');
	await addItem(page, 'Anchor'); // a second row to drop onto
	await page.click('nav.tabbar a:has-text("List")');

	await drag(page, 'Pepitas', 'Anchor'); // Pepitas -> Local Grocery group
	await expect(inGroup(page, 'Local Grocery', 'Pepitas')).toBeVisible();

	await check(page, 'Pepitas');
	await page.click('h2:has-text("Checked") button:has-text("Clear")');
	await expect(item(page, 'Pepitas')).toHaveCount(0);

	await addItem(page, 'Pepitas'); // re-add from the All view
	await expect(inGroup(page, 'Local Grocery', 'Pepitas')).toBeVisible();
});

test('"only show here" pins an item to the current store', async ({ page }) => {
	await addItem(page, 'Bulk Rice');
	await addStore(page, 'Costco');
	await addStore(page, 'Corner Store');

	await openStore(page, 'Costco');
	await openRow(page, 'Bulk Rice');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	await page.locator('.sheet-panel').getByRole('button', { name: 'Only show here' }).click();

	await openStore(page, 'Corner Store');
	await expect(item(page, 'Bulk Rice')).toHaveCount(0);
	await openStore(page, 'Costco');
	await expect(item(page, 'Bulk Rice')).toBeVisible();

	await openRow(page, 'Bulk Rice');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	await page.locator('.sheet-panel').getByRole('button', { name: 'Show at every store' }).click();
	await openStore(page, 'Corner Store');
	await expect(item(page, 'Bulk Rice')).toBeVisible();
});

test('hide an item for one store only', async ({ page }) => {
	await addItem(page, 'Soy Milk');
	await addStore(page, 'Costco');
	await openStore(page, 'Costco');

	await openRow(page, 'Soy Milk');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	await page.locator('.sheet-panel').getByRole('button', { name: 'Hide here' }).click();
	await expect(page.locator('h2:has-text("Not carried here")')).toBeVisible();

	await page.click('nav.tabbar a:has-text("List")');
	await expect(page.locator('h2:has-text("Not carried here")')).toHaveCount(0);
});

test('check off then clear removes from list but remembers position', async ({ page }) => {
	await addItem(page, 'Apples');
	await addItem(page, 'Flour');
	await addItem(page, 'Eggs'); // newest-first: Eggs, Flour, Apples
	await drag(page, 'Eggs', 'Apples'); // Eggs -> last
	await expect.poll(() => listOrder(page)).toEqual(['Flour', 'Apples', 'Eggs']);

	await check(page, 'Eggs');
	await expect(page.locator('h2:has-text("Checked")')).toBeVisible();
	await page.click('h2:has-text("Checked") button:has-text("Clear")');
	await expect(item(page, 'Eggs')).toHaveCount(0);

	await addItem(page, 'Eggs'); // re-add -> remembered spot (last), not top
	await expect.poll(() => listOrder(page)).toEqual(['Flour', 'Apples', 'Eggs']);
});

test('add-item autocomplete suggests catalog items by substring', async ({ page }) => {
	await addItem(page, 'Soy Milk');
	await addItem(page, 'Oat Milk');
	await addItem(page, 'Bread');
	for (const n of ['Soy Milk', 'Oat Milk']) {
		await openRow(page, n);
		await expect(page.locator('.sheet-panel')).toBeVisible();
		await page.locator('.sheet-panel').getByRole('button', { name: 'Remove from list' }).click();
		await expect(page.locator('.sheet-panel')).toHaveCount(0);
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

	await page.click('nav.tabbar a:has-text("Items")');
	await expect(page.locator('h1.screen-title')).toHaveText('Items');
	await expect(page.locator('.item:has-text("Coffee")')).toBeVisible();

	await page.click('.item:has-text("Coffee") .star');
	await page.check('.staple-toggle input[type=checkbox]');
	await expect(page.locator('.item:has-text("Coffee")')).toBeVisible();
	await expect(page.locator('.item:has-text("Sugar")')).toHaveCount(0);

	await page.click('nav.tabbar a:has-text("List")');
	await openRow(page, 'Coffee');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	await page.locator('.sheet-panel').getByRole('button', { name: 'Remove from list' }).click();
	await expect(item(page, 'Coffee')).toHaveCount(0);

	await page.click('nav.tabbar a:has-text("Items")');
	await page.click('.item:has-text("Coffee") button:has-text("+ list")');
	await expect(page.locator('.item:has-text("Coffee") .badge')).toHaveText('on list');
	await page.click('nav.tabbar a:has-text("List")');
	await expect(item(page, 'Coffee')).toBeVisible();

	await page.click('nav.tabbar a:has-text("Items")');
	await page.uncheck('.staple-toggle input[type=checkbox]');
	await page.click('.item:has-text("Sugar") .body');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	page.once('dialog', (d) => d.accept());
	await page.click('.sheet-panel button:has-text("Delete")');
	await expect(page.locator('.item:has-text("Sugar")')).toHaveCount(0);
});

test('typing a quantity bumps one item, and the stepper adjusts it', async ({ page }) => {
	await addItem(page, 'milk');
	await quickAdd(page).fill('4 milks');
	await quickAdd(page).press('Enter');
	await expect(item(page, 'milk').locator('.qty')).toHaveText('×5');
	await expect(page.locator('li[data-id]')).toHaveCount(1);

	await openRow(page, 'milk');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	await page.locator('.sheet-panel button[aria-label="Less"]').click();
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
	const anon = await playwright.request.newContext({ baseURL });
	const res = await anon.post('/api/setup', { data: { password: 'brand-new-password' } });
	expect(res.status()).toBe(409);

	const good = await anon.post('/api/login', { data: { password: 'e2e-pass' } });
	expect(good.ok()).toBeTruthy();
	await anon.dispose();

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

test('recipes: create, view, add to list from the sheet', async ({ page }) => {
	await page.click('nav.tabbar a:has-text("Recipes")');
	await page.click('.screen-head a:has-text("New")');
	await page.fill('input.rec-input', 'Test Salad');
	await page.locator('textarea').first().fill('2 cups spinach\n1 tbsp oil');
	await page.locator('textarea').nth(1).fill('Toss the spinach with the oil.');
	await page.click('button[type=submit]:has-text("Create recipe"), .rec-btn:has-text("Save")');
	await expect(page.locator('h1.screen-title')).toHaveText('Test Salad');

	await page.click('.screen-head button:has-text("Add to list")');
	await expect(page.locator('.sheet-panel')).toBeVisible();
	await page.click('.sheet-panel button[type=submit]:has-text("Add")');
	await page.click('nav.tabbar a:has-text("List")');
	await expect(page.locator('li[data-name="spinach"]')).toBeVisible();
});
