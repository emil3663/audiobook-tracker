// @ts-check
/**
 * Audiobook Tracker – Regression Test Suite
 *
 * Covers:
 *  1. Navigation (all three views)
 *  2. Add Book form – validation, narrator, rating, all fields
 *  3. Shelf – book appears, search, status filter, empty state
 *  4. Book Detail – displays all fields, "Where to Listen" links
 *  5. Edit Book – form pre-fills correctly, saves changes
 *  6. Delete Book – removed from shelf
 *  7. Library Access setup – checkboxes, save, localStorage persistence
 *  8. Conditional library links – appear/disappear based on prefs
 *  9. Discover page – source cards, search area visible, no YouTube link
 * 10. Open Library search (Add form) – search + auto-fill
 */

const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8766';

// Helper: clear app state before each test
async function resetState(page) {
    await page.goto(BASE);
    await page.evaluate(() => {
        localStorage.removeItem('audiobook_tracker_books');
        localStorage.removeItem('audiobook_tracker_prefs');
    });
    await page.reload();
}

// ---------------------------------------------------------------------------
// 1. NAVIGATION
// ---------------------------------------------------------------------------
test.describe('Navigation', () => {
    test('My Shelf is the default active view', async ({ page }) => {
        await resetState(page);
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
        await expect(page.locator('.nav-btn[data-view="shelf"]')).toHaveClass(/active/);
    });

    test('clicking Add Book shows the add view', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await expect(page.locator('#view-add')).toHaveClass(/active/);
        await expect(page.locator('#add-form-title')).toHaveText('Add Audiobook');
    });

    test('clicking Discover shows the discover view', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('#view-discover')).toHaveClass(/active/);
    });

    test('clicking My Shelf returns to shelf view', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await page.click('.nav-btn[data-view="shelf"]');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
    });

    test('Cancel button on Add form returns to shelf', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.click('#cancel-add');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
    });
});

// ---------------------------------------------------------------------------
// 2. ADD BOOK FORM
// ---------------------------------------------------------------------------
test.describe('Add Book form', () => {
    test('shows all required fields', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await expect(page.locator('#form-title')).toBeVisible();
        await expect(page.locator('#form-author')).toBeVisible();
        await expect(page.locator('#form-narrator')).toBeVisible();
        await expect(page.locator('#form-status')).toBeVisible();
        await expect(page.locator('#form-source')).toBeVisible();
        await expect(page.locator('#star-input')).toBeVisible();
        await expect(page.locator('#form-notes')).toBeVisible();
    });

    test('status dropdown has correct options', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        const options = await page.locator('#form-status option').allTextContents();
        expect(options).toEqual(['Want to Listen', 'Listening', 'Finished']);
    });

    test('form does not submit when title is empty', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-author', 'Test Author');
        await page.click('#add-form button[type="submit"]');
        // Should stay on add view (HTML5 validation prevents submit)
        await expect(page.locator('#view-add')).toHaveClass(/active/);
    });

    test('form does not submit when author is empty', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', 'Test Title');
        await page.click('#add-form button[type="submit"]');
        await expect(page.locator('#view-add')).toHaveClass(/active/);
    });

    test('adding a book with all fields returns to shelf', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', 'The Hobbit');
        await page.fill('#form-author', 'J.R.R. Tolkien');
        await page.fill('#form-narrator', 'Rob Inglis');
        await page.selectOption('#form-status', 'listening');
        await page.fill('#form-notes', 'Great narrator');
        // Click 4 stars
        await page.click('#star-input span[data-val="4"]');
        await page.click('#add-form button[type="submit"]');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
    });

    test('star rating input works', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.click('#star-input span[data-val="3"]');
        const ratingVal = await page.locator('#form-rating').inputValue();
        expect(ratingVal).toBe('3');
    });

    test('narrator field has correct placeholder', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        const placeholder = await page.locator('#form-narrator').getAttribute('placeholder');
        expect(placeholder).toBe('e.g. Stephen Fry');
    });
});

// ---------------------------------------------------------------------------
// 3. SHELF VIEW
// ---------------------------------------------------------------------------
test.describe('Shelf', () => {
    async function addTestBook(page, { title = 'Test Book', author = 'Test Author', narrator = '', status = 'want', rating = 0, notes = '' } = {}) {
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', title);
        await page.fill('#form-author', author);
        if (narrator) await page.fill('#form-narrator', narrator);
        await page.selectOption('#form-status', status);
        if (notes) await page.fill('#form-notes', notes);
        if (rating > 0) await page.click(`#star-input span[data-val="${rating}"]`);
        await page.click('#add-form button[type="submit"]');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
    }

    test('empty state is shown when shelf is empty', async ({ page }) => {
        await resetState(page);
        await expect(page.locator('#shelf-empty')).toBeVisible();
        await expect(page.locator('#shelf-list')).toBeEmpty();
    });

    test('added book appears on shelf', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert' });
        await expect(page.locator('#shelf-list .book-item')).toHaveCount(1);
        await expect(page.locator('.book-item .title')).toHaveText('Dune');
    });

    test('book shows narrator on shelf card', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert', narrator: 'Scott Brick' });
        await expect(page.locator('.book-item')).toContainText('Narrator: Scott Brick');
    });

    test('book shows status badge', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert', status: 'listening' });
        await expect(page.locator('.status-badge.status-listening')).toBeVisible();
    });

    test('search filters shelf by title', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert' });
        await addTestBook(page, { title: 'Foundation', author: 'Isaac Asimov' });
        await page.click('.nav-btn[data-view="shelf"]');
        await page.fill('#search-shelf', 'Dune');
        await expect(page.locator('#shelf-list .book-item')).toHaveCount(1);
        await expect(page.locator('.book-item .title')).toHaveText('Dune');
    });

    test('search filters shelf by author', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert' });
        await addTestBook(page, { title: 'Foundation', author: 'Isaac Asimov' });
        await page.click('.nav-btn[data-view="shelf"]');
        await page.fill('#search-shelf', 'Asimov');
        await expect(page.locator('#shelf-list .book-item')).toHaveCount(1);
        await expect(page.locator('.book-item .title')).toHaveText('Foundation');
    });

    test('status filter shows only matching books', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert', status: 'want' });
        await addTestBook(page, { title: 'Foundation', author: 'Isaac Asimov', status: 'finished' });
        await page.click('.nav-btn[data-view="shelf"]');
        await page.selectOption('#filter-status', 'finished');
        await expect(page.locator('#shelf-list .book-item')).toHaveCount(1);
        await expect(page.locator('.book-item .title')).toHaveText('Foundation');
    });

    test('status filter "All" shows all books', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert', status: 'want' });
        await addTestBook(page, { title: 'Foundation', author: 'Isaac Asimov', status: 'finished' });
        await page.click('.nav-btn[data-view="shelf"]');
        await page.selectOption('#filter-status', 'all');
        await expect(page.locator('#shelf-list .book-item')).toHaveCount(2);
    });

    test('book with rating shows stars', async ({ page }) => {
        await resetState(page);
        await addTestBook(page, { title: 'Dune', author: 'Frank Herbert', rating: 4 });
        await expect(page.locator('.book-stars')).toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// 4. BOOK DETAIL VIEW
// ---------------------------------------------------------------------------
test.describe('Book Detail', () => {
    async function addAndOpenBook(page, opts = {}) {
        const title = opts.title || 'Ender\'s Game';
        const author = opts.author || 'Orson Scott Card';
        const narrator = opts.narrator || '';
        const notes = opts.notes || 'Amazing story';
        const rating = opts.rating || 3;
        const sourceUrl = opts.sourceUrl || '';

        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', title);
        await page.fill('#form-author', author);
        if (narrator) await page.fill('#form-narrator', narrator);
        if (sourceUrl) await page.fill('#form-source', sourceUrl);
        await page.fill('#form-notes', notes);
        if (rating > 0) await page.click(`#star-input span[data-val="${rating}"]`);
        await page.click('#add-form button[type="submit"]');
        await page.click('.book-item');
        await expect(page.locator('#view-detail')).toHaveClass(/active/);
    }

    test('detail view shows title and author', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page);
        await expect(page.locator('#detail-content h1')).toHaveText("Ender's Game");
        await expect(page.locator('.detail-author').first()).toContainText('Orson Scott Card');
    });

    test('detail view shows narrator when set', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page, { narrator: 'Stefan Rudnicki' });
        await expect(page.locator('#detail-content')).toContainText('Narrated by Stefan Rudnicki');
    });

    test('detail view shows notes', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page, { notes: 'Brilliant sci-fi' });
        await expect(page.locator('.detail-notes')).toContainText('Brilliant sci-fi');
    });

    test('detail view shows LibriVox search link', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page);
        await expect(page.locator('.detail-source a[href*="librivox.org"]')).toBeVisible();
    });

    test('detail view shows Loyal Books search link', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page);
        await expect(page.locator('.detail-source a[href*="loyalbooks.com"]')).toBeVisible();
    });

    test('detail view has Edit and Delete buttons', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page);
        await expect(page.locator('#btn-edit-book')).toBeVisible();
        await expect(page.locator('#btn-delete-book')).toBeVisible();
    });

    test('detail view shows in-app audio player for direct audio URL', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page, { sourceUrl: 'https://example.com/my-book.mp3' });
        await expect(page.locator('#book-audio-player')).toBeVisible();
        await expect(page.locator('#book-audio-player source')).toHaveAttribute('src', 'https://example.com/my-book.mp3');
    });

    test('detail view shows offline download link for direct audio URL', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page, { sourceUrl: 'https://example.com/my-book.mp3' });
        await expect(page.locator('.detail-offline')).toBeVisible();
        await expect(page.locator('#book-download-link')).toBeVisible();
        await expect(page.locator('#book-download-link')).toHaveAttribute('href', 'https://example.com/my-book.mp3');
        await expect(page.locator('#book-download-link')).toHaveAttribute('download', /enders-game-orson-scott-card\.mp3/);
    });

    test('detail view does not show in-app audio player for non-audio URL', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page, { sourceUrl: 'https://openlibrary.org/works/OL45883W' });
        await expect(page.locator('#book-audio-player')).toHaveCount(0);
        await expect(page.locator('.audio-player-hint')).toBeVisible();
        await expect(page.locator('#book-download-link')).toHaveCount(0);
        await expect(page.locator('.detail-offline .audio-offline-hint')).toBeVisible();
    });

    test('back button returns to shelf', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page);
        await page.click('.back-btn');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
    });

    test('no YouTube link in detail view', async ({ page }) => {
        await resetState(page);
        await addAndOpenBook(page);
        const ytLinks = await page.locator('a[href*="youtube.com"]').count();
        expect(ytLinks).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 5. EDIT BOOK
// ---------------------------------------------------------------------------
test.describe('Edit Book', () => {
    async function addBook(page, title, author, narrator = '') {
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', title);
        await page.fill('#form-author', author);
        if (narrator) await page.fill('#form-narrator', narrator);
        await page.click('#add-form button[type="submit"]');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
    }

    test('edit form pre-fills title and author', async ({ page }) => {
        await resetState(page);
        await addBook(page, 'Fahrenheit 451', 'Ray Bradbury');
        await page.click('.book-item');
        await page.click('#btn-edit-book');
        await expect(page.locator('#view-add')).toHaveClass(/active/);
        await expect(page.locator('#form-title')).toHaveValue('Fahrenheit 451');
        await expect(page.locator('#form-author')).toHaveValue('Ray Bradbury');
    });

    test('edit form pre-fills narrator', async ({ page }) => {
        await resetState(page);
        await addBook(page, 'Fahrenheit 451', 'Ray Bradbury', 'Tim Robbins');
        await page.click('.book-item');
        await page.click('#btn-edit-book');
        await expect(page.locator('#form-narrator')).toHaveValue('Tim Robbins');
    });

    test('edit form title shows "Edit Audiobook"', async ({ page }) => {
        await resetState(page);
        await addBook(page, '1984', 'George Orwell');
        await page.click('.book-item');
        await page.click('#btn-edit-book');
        await expect(page.locator('#add-form-title')).toHaveText('Edit Audiobook');
    });

    test('saving edit updates book on shelf', async ({ page }) => {
        await resetState(page);
        await addBook(page, 'Old Title', 'Old Author');
        await page.click('.book-item');
        await page.click('#btn-edit-book');
        await page.fill('#form-title', 'New Title');
        await page.fill('#form-author', 'New Author');
        await page.click('#add-form button[type="submit"]');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
        await expect(page.locator('.book-item .title')).toHaveText('New Title');
    });

    test('editing narrator updates detail view', async ({ page }) => {
        await resetState(page);
        await addBook(page, 'Dune', 'Frank Herbert', 'Scott Brick');
        await page.click('.book-item');
        await page.click('#btn-edit-book');
        await page.fill('#form-narrator', 'Simon Vance');
        await page.click('#add-form button[type="submit"]');
        await page.click('.book-item');
        await expect(page.locator('#detail-content')).toContainText('Narrated by Simon Vance');
    });
});

// ---------------------------------------------------------------------------
// 6. DELETE BOOK
// ---------------------------------------------------------------------------
test.describe('Delete Book', () => {
    test('accepting delete confirmation removes book from shelf', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', 'To Delete');
        await page.fill('#form-author', 'Some Author');
        await page.click('#add-form button[type="submit"]');
        await page.click('.book-item');
        // Accept the confirm dialog
        page.once('dialog', dialog => dialog.accept());
        await page.click('#btn-delete-book');
        await expect(page.locator('#view-shelf')).toHaveClass(/active/);
        await expect(page.locator('#shelf-empty')).toBeVisible();
    });

    test('dismissing delete confirmation keeps book', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', 'Keep Me');
        await page.fill('#form-author', 'Keeper');
        await page.click('#add-form button[type="submit"]');
        await page.click('.book-item');
        page.once('dialog', dialog => dialog.dismiss());
        await page.click('#btn-delete-book');
        await expect(page.locator('#detail-content h1')).toHaveText('Keep Me');
    });
});

// ---------------------------------------------------------------------------
// 7. LIBRARY ACCESS SETUP
// ---------------------------------------------------------------------------
test.describe('Library Access Setup', () => {
    test('library setup section is visible on Discover', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.library-access')).toBeVisible();
        await expect(page.locator('.library-access h2')).toContainText('Library Access');
    });

    test('both library checkboxes are present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('#pref-openlibrary-enabled')).toBeVisible();
        await expect(page.locator('#pref-hoopla-enabled')).toBeVisible();
    });

    test('library card last 4 field is present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('#library-card-last4')).toBeVisible();
        const maxLen = await page.locator('#library-card-last4').getAttribute('maxlength');
        expect(maxLen).toBe('4');
    });

    test('saving library prefs persists across reload', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await page.check('#pref-openlibrary-enabled');
        await page.fill('#library-system-name', 'City Library');
        await page.click('#save-library-prefs');
        await page.reload();
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('#pref-openlibrary-enabled')).toBeChecked();
        await expect(page.locator('#library-system-name')).toHaveValue('City Library');
    });

    test('checkboxes are unchecked by default', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('#pref-openlibrary-enabled')).not.toBeChecked();
        await expect(page.locator('#pref-hoopla-enabled')).not.toBeChecked();
    });

    test('Register Open Library link present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('a[href*="openlibrary.org/account/create"]')).toBeVisible();
    });

    test('Register Hoopla link present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('a[href*="hoopladigital.com"]').first()).toBeVisible();
    });

    test('Your Access sub-heading visible', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.library-subtitle').first()).toContainText('Your Access');
    });

    test('Register sub-heading visible', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        const subtitles = await page.locator('.library-subtitle').allTextContents();
        expect(subtitles.some(t => /register/i.test(t))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 8. CONDITIONAL LIBRARY LINKS
// ---------------------------------------------------------------------------
test.describe('Conditional library links', () => {
    async function enableLibraryPrefs(page) {
        await page.click('.nav-btn[data-view="discover"]');
        await page.check('#pref-openlibrary-enabled');
        await page.check('#pref-hoopla-enabled');
        await page.click('#save-library-prefs');
        await page.reload();
    }

    async function addAndOpenBook(page) {
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', 'Brave New World');
        await page.fill('#form-author', 'Aldous Huxley');
        await page.click('#add-form button[type="submit"]');
        await page.click('.book-item');
    }

    test('Open Library link appears in detail when pref enabled', async ({ page }) => {
        await resetState(page);
        await enableLibraryPrefs(page);
        await addAndOpenBook(page);
        await expect(page.locator('.detail-source a[href*="openlibrary.org/search"]')).toBeVisible();
    });

    test('Hoopla link appears in detail when pref enabled', async ({ page }) => {
        await resetState(page);
        await enableLibraryPrefs(page);
        await addAndOpenBook(page);
        await expect(page.locator('.detail-source a[href*="hoopladigital.com"]')).toBeVisible();
    });

    test('Open Library link absent in detail when pref disabled', async ({ page }) => {
        await resetState(page);
        // Prefs not set → disabled by default
        await addAndOpenBook(page);
        const olLinks = await page.locator('.detail-source a[href*="openlibrary.org/search"]').count();
        expect(olLinks).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 9. DISCOVER PAGE
// ---------------------------------------------------------------------------
test.describe('Discover page', () => {
    test('Free Sources section has source cards', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.source-grid .source-card')).toHaveCount(5);
    });

    test('LibriVox source card is present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.source-card[href*="librivox.org"]')).toBeVisible();
    });

    test('Loyal Books source card is present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.source-card[href*="loyalbooks.com"]')).toBeVisible();
    });

    test('Open Library source card is present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.source-card[href*="openlibrary.org"]')).toBeVisible();
    });

    test('Hoopla source card is present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.source-card[href*="hoopladigital.com"]')).toBeVisible();
    });

    test('no YouTube source card exists', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        const ytCards = await page.locator('.source-card[href*="youtube.com"]').count();
        expect(ytCards).toBe(0);
    });

    test('no YouTube links anywhere on discover page', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        const ytLinks = await page.locator('a[href*="youtube.com"]').count();
        expect(ytLinks).toBe(0);
    });

    test('Search Open Library section is visible', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('.discover-search')).toBeVisible();
        await expect(page.locator('#discover-search')).toBeVisible();
        await expect(page.locator('#discover-search-btn')).toBeVisible();
    });

    test('subject filter dropdown is present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('#discover-subject')).toBeVisible();
    });

    test('sort dropdown is present', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="discover"]');
        await expect(page.locator('#discover-sort')).toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// 10. OPEN LIBRARY SEARCH (Add form)
// ---------------------------------------------------------------------------
test.describe('Open Library lookup (Add form)', () => {
    test('search input and button are visible', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await expect(page.locator('#ol-search')).toBeVisible();
        await expect(page.locator('#ol-search-btn')).toBeVisible();
    });

    test('search mode radios are visible with title selected by default', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await expect(page.locator('input[name="ol-search-mode"][value="title"]')).toBeVisible();
        await expect(page.locator('input[name="ol-search-mode"][value="author"]')).toBeVisible();
        await expect(page.locator('input[name="ol-search-mode"][value="title"]')).toBeChecked();
    });

    test('author mode search sends author query parameter', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');

        let capturedUrl = '';
        await page.route('https://openlibrary.org/search.json**', async route => {
            capturedUrl = route.request().url();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ docs: [] }),
            });
        });

        await page.check('input[name="ol-search-mode"][value="author"]');
        await page.fill('#ol-search', 'jenny han');
        await page.click('#ol-search-btn');

        expect(capturedUrl).toContain('author=jenny+han');
        expect(capturedUrl).not.toContain('title=jenny+han');
        await page.unroute('https://openlibrary.org/search.json**');
    });

    test('search ranks direct audio matches first and fills direct stream URL', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');

        await page.route('https://openlibrary.org/search.json**', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    docs: [
                        {
                            key: '/works/OL111W',
                            title: 'Sample Page Result',
                            author_name: ['Author A'],
                            author_key: ['OL1A'],
                            ia: []
                        },
                        {
                            key: '/works/OL222W',
                            title: 'Sample Direct Result',
                            author_name: ['Author B'],
                            author_key: ['OL2A'],
                            ia: ['sample_direct_item']
                        }
                    ]
                }),
            });
        });

        await page.route('https://archive.org/metadata/sample_direct_item', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    files: [
                        { name: 'audio-track.mp3' }
                    ]
                }),
            });
        });

        await page.fill('#ol-search', 'sample');
        await page.click('#ol-search-btn');

        const firstResult = page.locator('#ol-results .ol-result-item').first();
        await expect(firstResult.locator('.ol-result-badge.direct')).toBeVisible();

        await firstResult.click();
        await expect(page.locator('#form-source')).toHaveValue('https://archive.org/download/sample_direct_item/audio-track.mp3');

        await page.unroute('https://openlibrary.org/search.json**');
        await page.unroute('https://archive.org/metadata/sample_direct_item');
    });

    test('empty search does not show results list', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        // Results should not have "open" class initially
        await expect(page.locator('#ol-results')).not.toHaveClass(/open/);
    });

    test('searching shows results list (live API)', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#ol-search', 'Dune');
        await page.click('#ol-search-btn');
        // Wait for results to populate (live API call — returns multiple items)
        await expect(page.locator('#ol-results.open .ol-result-item').first()).toBeVisible({ timeout: 15000 });
    });

    test('selecting a result keeps search results visible', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#ol-search', 'Dune');
        await page.click('#ol-search-btn');

        const firstResult = page.locator('#ol-results.open .ol-result-item').first();
        await expect(firstResult).toBeVisible({ timeout: 15000 });
        await firstResult.click();

        await expect(page.locator('#ol-results')).toHaveClass(/open/);
        await expect(page.locator('#ol-results .ol-result-item').first()).toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// 11. PERSISTENCE – localStorage survives reload
// ---------------------------------------------------------------------------
test.describe('Persistence', () => {
    test('books survive a page reload', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', 'Persisted Book');
        await page.fill('#form-author', 'Persisted Author');
        await page.click('#add-form button[type="submit"]');
        await page.reload();
        await expect(page.locator('#shelf-list .book-item')).toHaveCount(1);
        await expect(page.locator('.book-item .title')).toHaveText('Persisted Book');
    });

    test('narrator survives reload', async ({ page }) => {
        await resetState(page);
        await page.click('.nav-btn[data-view="add"]');
        await page.fill('#form-title', 'Narrated Book');
        await page.fill('#form-author', 'Some Author');
        await page.fill('#form-narrator', 'Famous Narrator');
        await page.click('#add-form button[type="submit"]');
        await page.reload();
        await expect(page.locator('.book-item')).toContainText('Narrator: Famous Narrator');
    });
});
