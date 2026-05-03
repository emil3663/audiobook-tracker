/* =====================================================
   AUDIOBOOK TRACKER – app.js
   Storage: Firestore (when signed in) or localStorage.
   Real-time cross-device sync via Firebase onSnapshot.
   Uses Open Library API for metadata and search.
   ===================================================== */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'audiobook_tracker_books';
const PREFS_KEY = 'audiobook_tracker_prefs';
const OL_API = 'https://openlibrary.org';
const OL_COVERS = 'https://covers.openlibrary.org/b/id';

// ── State ────────────────────────────────────────────────────────────────────
let books = [];
let editingId = null;
let currentUser = null;
let db = null;
let firestoreUnsub = null;  // onSnapshot unsubscribe handle
let libraryPrefs = loadLibraryPrefs();

// ── Firebase Setup ────────────────────────────────────────────────────────────
// Firebase is optional. It activates only when firebase-config.js has real values.
const firebaseReady = (() => {
  try {
    if (typeof FIREBASE_CONFIG === 'undefined') return false;
    if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') return false;
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    return true;
  } catch (_) {
    return false;
  }
})();

if (firebaseReady) {
  // Reveal auth button in header once Firebase is configured
  document.getElementById('auth-btn').hidden = false;

  firebase.auth().onAuthStateChanged(user => {
    currentUser = user;
    updateAuthUI();
    if (user) {
      setupFirestoreListener(user.uid);
    } else {
      // Signed out — tear down Firestore listener, fall back to localStorage
      if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
      books = loadFromLocalStorage();
      renderShelf();
    }
  });
} else {
  // No Firebase config — use localStorage from the start
  books = loadFromLocalStorage();
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadFromLocalStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch (_) { return []; }
}

function defaultLibraryPrefs() {
  return {
    openLibraryEnabled: false,
    hooplaEnabled: false,
    librarySystemName: '',
    libraryCardLast4: ''
  };
}

function loadLibraryPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      ...defaultLibraryPrefs(),
      ...raw,
      libraryCardLast4: String(raw.libraryCardLast4 || '').replace(/\D/g, '').slice(0, 4)
    };
  } catch (_) {
    return defaultLibraryPrefs();
  }
}

function saveLibraryPrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(libraryPrefs));
}

function applyLibraryPrefsToUi() {
  const open = document.getElementById('pref-openlibrary-enabled');
  const hoopla = document.getElementById('pref-hoopla-enabled');
  const libName = document.getElementById('library-system-name');
  const last4 = document.getElementById('library-card-last4');
  if (!open || !hoopla || !libName || !last4) return;

  open.checked = Boolean(libraryPrefs.openLibraryEnabled);
  hoopla.checked = Boolean(libraryPrefs.hooplaEnabled);
  libName.value = libraryPrefs.librarySystemName || '';
  last4.value = libraryPrefs.libraryCardLast4 || '';
}

function readLibraryPrefsFromUi() {
  const open = document.getElementById('pref-openlibrary-enabled');
  const hoopla = document.getElementById('pref-hoopla-enabled');
  const libName = document.getElementById('library-system-name');
  const last4 = document.getElementById('library-card-last4');
  if (!open || !hoopla || !libName || !last4) return;

  libraryPrefs = {
    openLibraryEnabled: open.checked,
    hooplaEnabled: hoopla.checked,
    librarySystemName: libName.value.trim(),
    libraryCardLast4: last4.value.replace(/\D/g, '').slice(0, 4)
  };
  last4.value = libraryPrefs.libraryCardLast4;
  saveLibraryPrefs();
}

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

// ── Firestore helpers ─────────────────────────────────────────────────────────
function booksRef(uid) {
  return db.collection('users').doc(uid).collection('books');
}

function setupFirestoreListener(uid) {
  if (firestoreUnsub) firestoreUnsub();
  setSyncStatus('syncing');
  firestoreUnsub = booksRef(uid).onSnapshot(
    snapshot => {
      books = snapshot.docs.map(d => d.data());
      setSyncStatus('synced');
      renderShelf();
    },
    () => setSyncStatus('error')
  );
}

async function persistBook(book) {
  if (currentUser && db) {
    setSyncStatus('syncing');
    await booksRef(currentUser.uid).doc(book.id).set(book);
    // onSnapshot will update books[] and re-render
  } else {
    const idx = books.findIndex(b => b.id === book.id);
    if (idx !== -1) books[idx] = book;
    else books.push(book);
    saveToLocalStorage();
    renderShelf();
  }
}

async function removeBook(id) {
  if (currentUser && db) {
    setSyncStatus('syncing');
    await booksRef(currentUser.uid).doc(id).delete();
    // onSnapshot will update
  } else {
    books = books.filter(b => b.id !== id);
    saveToLocalStorage();
  }
}

// On first sign-in, migrate any existing localStorage books to Firestore
async function migrateLocalStorageToFirestore(uid) {
  const local = loadFromLocalStorage();
  if (local.length === 0) return;
  const snapshot = await booksRef(uid).limit(1).get();
  if (!snapshot.empty) return;  // Firestore already has data — don't overwrite
  const batch = db.batch();
  local.forEach(book => {
    batch.set(booksRef(uid).doc(book.id), book);
  });
  await batch.commit();
  localStorage.removeItem(STORAGE_KEY);
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function updateAuthUI() {
  const btn = document.getElementById('auth-btn');
  const status = document.getElementById('sync-status');
  if (!firebaseReady) return;

  if (currentUser) {
    btn.textContent = 'Sign Out';
    btn.title = currentUser.email;
    status.hidden = false;
  } else {
    btn.textContent = 'Sign In to Sync';
    btn.title = '';
    status.hidden = true;
  }
}

function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const cfg = {
    syncing: { icon: '🔄', label: 'Syncing…', cls: 'sync-syncing' },
    synced: { icon: '☁️', label: 'Synced', cls: 'sync-synced' },
    error: { icon: '⚠️', label: 'Sync error', cls: 'sync-error' },
  };
  const c = cfg[state] || cfg.synced;
  el.textContent = `${c.icon} ${c.label}`;
  el.className = `sync-status ${c.cls}`;
}

// Header auth button
document.getElementById('auth-btn').addEventListener('click', () => {
  if (!firebaseReady) return;
  if (currentUser) {
    if (confirm(`Sign out of ${currentUser.email}?`)) firebase.auth().signOut();
  } else {
    openAuthModal('signin');
  }
});

// Auth modal open/close
function openAuthModal(mode) {
  const modal = document.getElementById('auth-modal');
  modal.dataset.mode = mode;
  setAuthModalMode(mode);
  modal.hidden = false;
  document.getElementById('auth-email').focus();
}

function closeAuthModal() {
  document.getElementById('auth-modal').hidden = true;
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-form').reset();
}

function setAuthModalMode(mode) {
  const isSignUp = mode === 'signup';
  document.getElementById('auth-modal-title').textContent = isSignUp ? 'Create Account' : 'Sign In to Sync';
  document.getElementById('auth-submit-btn').textContent = isSignUp ? 'Create Account' : 'Sign In';
  document.getElementById('auth-toggle').textContent = isSignUp
    ? 'Already have an account? Sign in'
    : "Don't have an account? Sign up";
}

document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
document.getElementById('auth-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAuthModal();
});

document.getElementById('auth-toggle').addEventListener('click', () => {
  const modal = document.getElementById('auth-modal');
  const newMode = modal.dataset.mode === 'signup' ? 'signin' : 'signup';
  modal.dataset.mode = newMode;
  setAuthModalMode(newMode);
  document.getElementById('auth-error').textContent = '';
});

document.getElementById('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-password').value;
  const isSignUp = document.getElementById('auth-modal').dataset.mode === 'signup';
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit-btn');
  errEl.textContent = '';
  btn.disabled = true;
  try {
    if (isSignUp) {
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, pass);
      await migrateLocalStorageToFirestore(cred.user.uid);
    } else {
      await firebase.auth().signInWithEmailAndPassword(email, pass);
    }
    closeAuthModal();
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
  } finally {
    btn.disabled = false;
  }
});

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential': 'Incorrect email or password.',
  };
  return map[code] || 'An error occurred. Please try again.';
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function safeUrl(url) {
  try {
    const p = new URL(url);
    return (p.protocol === 'http:' || p.protocol === 'https:') ? url : '#';
  } catch (_) { return '#'; }
}

function audioMimeFromUrl(url) {
  try {
    const p = new URL(url);
    const path = p.pathname.toLowerCase();
    if (path.endsWith('.mp3')) return 'audio/mpeg';
    if (path.endsWith('.m4a') || path.endsWith('.aac')) return 'audio/mp4';
    if (path.endsWith('.ogg') || path.endsWith('.oga')) return 'audio/ogg';
    if (path.endsWith('.wav')) return 'audio/wav';
    if (path.endsWith('.opus')) return 'audio/opus';
    if (path.endsWith('.flac')) return 'audio/flac';
    return '';
  } catch (_) {
    return '';
  }
}

function isPlayableAudioUrl(url) {
  return Boolean(audioMimeFromUrl(url));
}

function downloadFileNameForBook(book) {
  const safeTitle = String(book.title || 'audiobook')
    .trim()
    .replace(/[^a-z0-9\-\s]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const safeAuthor = String(book.author || '')
    .trim()
    .replace(/[^a-z0-9\-\s]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  let ext = '.mp3';
  try {
    const p = new URL(book.sourceUrl || '');
    const m = p.pathname.toLowerCase().match(/\.(mp3|m4a|aac|ogg|oga|wav|opus|flac)$/);
    if (m) ext = `.${m[1]}`;
  } catch (_) {
    // keep default extension
  }

  const parts = [safeTitle, safeAuthor].filter(Boolean);
  const base = parts.length ? parts.join('-') : 'audiobook';
  return `${base}${ext}`;
}

function starsHtml(rating) {
  const n = Number(rating) || 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function statusLabel(status) {
  const map = { want: 'Want to Listen', listening: 'Listening', finished: 'Finished' };
  return map[status] || status;
}

function coverUrl(coverId, size = 'M') {
  return coverId ? `${OL_COVERS}/${coverId}-${size}.jpg` : null;
}

function librivoxSearchUrl(title) {
  return `https://librivox.org/search?q=${encodeURIComponent(title)}&search_form=advanced&search_order=alpha`;
}

function loyalBooksSearchUrl(title) {
  return `https://www.loyalbooks.com/search?q=${encodeURIComponent(title)}`;
}

function hooplaSearchUrl(title) {
  return `https://www.hoopladigital.com/search?q=${encodeURIComponent(title)}`;
}

const SEARCH_STOP_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with']);

function normalizeSearchText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchTokens(text) {
  return normalizeSearchText(text)
    .split(' ')
    .filter(t => t && !SEARCH_STOP_WORDS.has(t));
}

function openLibraryResultScore(query, title, authors, mode = 'title') {
  const q = normalizeSearchText(query);
  if (!q) return 0;

  const t = normalizeSearchText(title);
  const a = normalizeSearchText(authors);
  let score = 0;

  if (mode === 'author') {
    if (a === q) score += 140;
    if (a.startsWith(q)) score += 80;
    if (a.includes(q)) score += 60;
    if (t.includes(q)) score += 30;
  } else {
    if (t === q) score += 140;
    if (t.startsWith(q)) score += 80;
    if (t.includes(q)) score += 60;
    if (a.includes(q)) score += 30;
  }

  const qTokens = searchTokens(q);
  if (qTokens.length) {
    const titleTokens = new Set(searchTokens(t));
    const authorTokens = new Set(searchTokens(a));
    let matches = 0;

    for (const tok of qTokens) {
      if (titleTokens.has(tok) || authorTokens.has(tok)) matches += 1;
    }

    score += Math.round((matches / qTokens.length) * 60);
    if (matches === qTokens.length) score += 40;
    if (matches === 0 && !t.includes(q) && !a.includes(q)) score -= 100;
  }

  return score;
}

function getOlSearchMode() {
  return document.querySelector('input[name="ol-search-mode"]:checked')?.value === 'author'
    ? 'author'
    : 'title';
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (view) view.classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'shelf') renderShelf();
}

document.addEventListener('click', e => {
  const target = e.target.closest('[data-view]');
  if (!target) return;
  const view = target.dataset.view;
  if (view === 'add') { resetAddForm(); showView('add'); }
  else showView(view);
});

// ── Shelf ─────────────────────────────────────────────────────────────────────
function renderShelf() {
  const search = document.getElementById('search-shelf').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const list = document.getElementById('shelf-list');
  const empty = document.getElementById('shelf-empty');

  let filtered = books.filter(b => {
    const matchSearch = !search ||
      b.title.toLowerCase().includes(search) ||
      b.author.toLowerCase().includes(search);
    const matchStatus = status === 'all' || b.status === status;
    return matchSearch && matchStatus;
  });

  const order = { listening: 0, want: 1, finished: 2 };
  filtered.sort((a, b) => {
    const od = order[a.status] - order[b.status];
    return od !== 0 ? od : (b.addedAt || 0) - (a.addedAt || 0);
  });

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = filtered.map(book => {
    const cover = coverUrl(book.coverId, 'S');
    const thumbHtml = cover
      ? `<img class="book-cover-thumb" src="${escapeHtml(cover)}" alt="" loading="lazy" />`
      : `<div class="book-cover-placeholder">📚</div>`;

    return `
      <li class="book-item" data-id="${escapeHtml(book.id)}" role="button" tabindex="0">
        ${thumbHtml}
        <div class="book-info">
          <div class="title">${escapeHtml(book.title)}</div>
          <div class="author">${escapeHtml(book.author)}</div>
          ${book.narrator ? `<div class="author">Narrator: ${escapeHtml(book.narrator)}</div>` : ''}
          ${book.rating > 0 ? `<div class="book-stars">${starsHtml(book.rating)}</div>` : ''}
        </div>
        <span class="status-badge status-${escapeHtml(book.status)}">${statusLabel(book.status)}</span>
      </li>`;
  }).join('');

  list.querySelectorAll('.book-item').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openDetail(el.dataset.id); });
  });
}

document.getElementById('search-shelf').addEventListener('input', renderShelf);
document.getElementById('filter-status').addEventListener('change', renderShelf);

// ── Book Detail ───────────────────────────────────────────────────────────────
async function openDetail(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  showView('detail');
  renderDetail(book);
  loadMoreByAuthor(book);
}

function renderDetail(book) {
  const cover = coverUrl(book.coverId, 'M');
  const coverHtml = cover
    ? `<img class="detail-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />`
    : `<div class="detail-cover-placeholder">📚</div>`;

  const audioMime = book.sourceUrl ? audioMimeFromUrl(book.sourceUrl) : '';
  const canPlayInApp = Boolean(book.sourceUrl) && isPlayableAudioUrl(book.sourceUrl);
  const sourceHtml = book.sourceUrl
    ? `<p><strong>Source:</strong> <a href="${escapeHtml(safeUrl(book.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(book.sourceUrl)}</a></p>`
    : `<p style="color:var(--text-muted)">No source URL saved.</p>`;
  const inAppPlayerHtml = canPlayInApp
    ? `<div class="audio-player-wrap">
         <p class="audio-player-label">Play in app:</p>
         <audio id="book-audio-player" controls preload="metadata">
           <source src="${escapeHtml(safeUrl(book.sourceUrl))}" type="${escapeHtml(audioMime)}" />
           Your browser does not support audio playback.
         </audio>
       </div>`
    : (book.sourceUrl
      ? `<p class="audio-player-hint">To play in app, paste a direct audio file URL (for example .mp3, .m4a, .ogg, .wav) in the Add/Edit form.</p>`
      : '');

  const offlineHtml = canPlayInApp
    ? `<div class="detail-offline">
         <h2>Offline</h2>
         <p class="audio-offline-copy">Download this audio file to your device for offline listening.</p>
         <a id="book-download-link" class="btn-secondary" href="${escapeHtml(safeUrl(book.sourceUrl))}" download="${escapeHtml(downloadFileNameForBook(book))}">Download Audio</a>
         <p class="audio-offline-hint">Downloaded files are kept on your device in your browser download location.</p>
       </div>`
    : (book.sourceUrl
      ? `<div class="detail-offline">
           <h2>Offline</h2>
           <p class="audio-offline-hint">Offline download is available when the source is a direct audio file URL (.mp3, .m4a, .ogg, .wav, .opus, .flac).</p>
         </div>`
      : '');

  const notesHtml = book.notes
    ? `<p>${escapeHtml(book.notes)}</p>`
    : `<p style="color:var(--text-muted)">No notes yet.</p>`;

  const librarySearchLinks = [];
  if (libraryPrefs.openLibraryEnabled) {
    const olTitle = encodeURIComponent(book.title);
    librarySearchLinks.push(`<a href="https://openlibrary.org/search?q=${olTitle}" target="_blank" rel="noopener noreferrer">Open Library</a>`);
  }
  if (libraryPrefs.hooplaEnabled) {
    librarySearchLinks.push(`<a href="${hooplaSearchUrl(book.title)}" target="_blank" rel="noopener noreferrer">Hoopla</a>`);
  }
  const librarySearchHtml = librarySearchLinks.length
    ? `<p style="margin-top:.5rem; font-size:.82rem; color:var(--text-muted)">Library options: ${librarySearchLinks.join(' · ')}</p>`
    : '';

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-hero">
      ${coverHtml}
      <div class="detail-meta">
        <h1>${escapeHtml(book.title)}</h1>
        <div class="detail-author">${escapeHtml(book.author)}</div>
        ${book.narrator ? `<div class="detail-author">Narrated by ${escapeHtml(book.narrator)}</div>` : ''}
        <div class="detail-stars">${starsHtml(book.rating)}</div>
        <span class="status-badge status-${escapeHtml(book.status)}">${statusLabel(book.status)}</span>
        <div class="detail-actions">
          <button class="btn-secondary btn-small" id="btn-edit-book">✏️ Edit</button>
          <button class="btn-danger btn-small" id="btn-delete-book">🗑 Delete</button>
        </div>
      </div>
    </div>

    <div class="detail-source"><h2>Where to Listen</h2>${sourceHtml}
      ${inAppPlayerHtml}
      <p style="margin-top:.5rem; font-size:.82rem; color:var(--text-muted)">
        Search free:
        <a href="${librivoxSearchUrl(book.title)}" target="_blank" rel="noopener noreferrer">LibriVox</a> ·
        <a href="${loyalBooksSearchUrl(book.title)}" target="_blank" rel="noopener noreferrer">Loyal Books</a>
      </p>
      ${librarySearchHtml}
    </div>

    ${offlineHtml}

    <div class="detail-notes"><h2>Notes</h2>${notesHtml}</div>

    <div class="more-by" id="more-by-section">
      <h2>More by ${escapeHtml(book.author)}</h2>
      <div id="more-by-content" style="color:var(--text-muted); font-size:.875rem;">Loading…</div>
    </div>
  `;

  document.getElementById('btn-edit-book').addEventListener('click', () => startEdit(book.id));
  document.getElementById('btn-delete-book').addEventListener('click', () => deleteBook(book.id));
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deleteBook(id) {
  if (!confirm('Delete this audiobook from your shelf?')) return;
  await removeBook(id);
  showView('shelf');
}

// ── Edit ──────────────────────────────────────────────────────────────────────
function startEdit(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  editingId = id;
  document.getElementById('add-form-title').textContent = 'Edit Audiobook';
  document.getElementById('form-id').value = book.id;
  document.getElementById('form-title').value = book.title;
  document.getElementById('form-author').value = book.author;
  document.getElementById('form-narrator').value = book.narrator || '';
  document.getElementById('form-status').value = book.status;
  document.getElementById('form-source').value = book.sourceUrl || '';
  document.getElementById('form-notes').value = book.notes || '';
  document.getElementById('form-ol-key').value = book.olKey || '';
  document.getElementById('form-cover-id').value = book.coverId || '';
  document.getElementById('form-rating').value = book.rating || 0;
  document.getElementById('add-form').dataset.authorKey = book.authorKey || '';
  updateStars(book.rating || 0);
  document.getElementById('ol-results').classList.remove('open');
  showView('add');
}

// ── More by Author ────────────────────────────────────────────────────────────
async function loadMoreByAuthor(book) {
  const container = document.getElementById('more-by-content');
  if (!container) return;
  if (!book.authorKey && !book.author) {
    container.textContent = 'No author data available.';
    return;
  }

  try {
    let works = [];
    if (book.authorKey) {
      const res = await fetch(`${OL_API}/authors/${book.authorKey}/works.json?limit=20`);
      const data = await res.json();
      works = (data.entries || []).filter(w => w.title !== book.title);
    } else {
      const res = await fetch(`${OL_API}/search.json?author=${encodeURIComponent(book.author)}&limit=20`);
      const data = await res.json();
      works = (data.docs || []).filter(w => w.title !== book.title);
    }

    if (works.length === 0) { container.textContent = 'No other works found.'; return; }

    const shown = works.slice(0, 8);
    container.innerHTML = `<ul class="more-by-list">
      ${shown.map(w => {
      const wTitle = escapeHtml(w.title || 'Unknown');
      const year = w.first_publish_year ? escapeHtml(String(w.first_publish_year)) : '';
      const covId = w.cover_id || (w.covers && w.covers[0]);
      const wCover = covId ? `<img src="${OL_COVERS}/${covId}-S.jpg" alt="" loading="lazy" />` : '';
      const rawTitle = w.title || '';
      const lvUrl = librivoxSearchUrl(rawTitle);
      const olUrl = `https://openlibrary.org${escapeHtml(w.key || '')}`;
      const hpUrl = hooplaSearchUrl(rawTitle);
      const libraryLinks = [];
      if (libraryPrefs.openLibraryEnabled) {
        libraryLinks.push(`<a class="mbi-link" href="${olUrl}" target="_blank" rel="noopener noreferrer">Open Library ↗</a>`);
      }
      if (libraryPrefs.hooplaEnabled) {
        libraryLinks.push(`<a class="mbi-link" href="${hpUrl}" target="_blank" rel="noopener noreferrer">Hoopla ↗</a>`);
      }
      return `
          <li class="more-by-item">
            ${wCover}
            <div>
              <div class="mbi-title">${wTitle}</div>
              ${year ? `<div class="mbi-year">${year}</div>` : ''}
            </div>
            <a class="mbi-link" href="${lvUrl}" target="_blank" rel="noopener noreferrer">LibriVox ↗</a>
            ${libraryLinks.join('')}
          </li>`;
    }).join('')}
    </ul>`;
  } catch (_) {
    container.textContent = 'Could not load author works (check your connection).';
  }
}

// ── Open Library Search (Add form) ───────────────────────────────────────────
document.getElementById('ol-search-btn').addEventListener('click', runOlSearch);
document.getElementById('ol-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); runOlSearch(); }
});

async function runOlSearch() {
  const q = document.getElementById('ol-search').value.trim();
  if (!q) return;
  const mode = getOlSearchMode();
  const list = document.getElementById('ol-results');
  list.innerHTML = '<li style="padding:.6rem .85rem;color:var(--text-muted)">Searching…</li>';
  list.classList.add('open');

  try {
    const params = new URLSearchParams({
      limit: '20',
      fields: 'key,title,author_name,author_key,cover_i,first_publish_year',
    });
    params.set(mode === 'author' ? 'author' : 'title', q);

    const res = await fetch(`${OL_API}/search.json?${params}`);
    const data = await res.json();
    const rawDocs = data.docs || [];
    const docs = rawDocs
      .map(d => ({
        ...d,
        _score: openLibraryResultScore(q, d.title || '', (d.author_name || []).join(' '), mode)
      }))
      .filter(d => d._score >= 20)
      .sort((a, b) => b._score - a._score)
      .slice(0, 10);

    if (docs.length === 0) {
      list.innerHTML = '<li style="padding:.6rem .85rem;color:var(--text-muted)">No relevant results found. Try adding author name for better matches.</li>';
      return;
    }

    list.innerHTML = docs.map(d => {
      const rawTitle = d.title || 'Unknown';
      const rawAuthor = (d.author_name || []).join(', ') || 'Unknown';
      const cover = d.cover_i
        ? `<img src="${OL_COVERS}/${d.cover_i}-S.jpg" alt="" loading="lazy" />`
        : '<div style="width:32px;height:44px;background:var(--surface)"></div>';
      const year = d.first_publish_year ? ` (${d.first_publish_year})` : '';
      return `<li class="ol-result-item"
                  data-title="${escapeHtml(rawTitle)}" data-author="${escapeHtml(rawAuthor)}"
                  data-olkey="${escapeHtml(d.key || '')}" data-coverid="${escapeHtml(String(d.cover_i || ''))}"
                  data-authorkey="${escapeHtml((d.author_key || [])[0] || '')}">
                ${cover}
                <div>
                  <div class="r-title">${escapeHtml(rawTitle)}${year}</div>
                  <div class="r-author">${escapeHtml(rawAuthor)}</div>
                </div>
              </li>`;
    }).join('');

    list.querySelectorAll('.ol-result-item').forEach(el => {
      el.addEventListener('click', () => fillFormFromResult(el));
    });
  } catch (_) {
    list.innerHTML = '<li style="padding:.6rem .85rem;color:var(--text-muted)">Search failed. Check your connection.</li>';
  }
}

function fillFormFromResult(el) {
  document.getElementById('form-title').value = el.dataset.title;
  document.getElementById('form-author').value = el.dataset.author;
  document.getElementById('form-ol-key').value = el.dataset.olkey;
  document.getElementById('form-cover-id').value = el.dataset.coverid;
  document.getElementById('add-form').dataset.authorKey = el.dataset.authorkey;
  document.getElementById('form-title').focus();
}

// ── Star Rating ───────────────────────────────────────────────────────────────
function updateStars(value) {
  document.querySelectorAll('#star-input span').forEach(s => {
    s.classList.toggle('filled', Number(s.dataset.val) <= value);
  });
  document.getElementById('form-rating').value = value;
}

document.getElementById('star-input').addEventListener('click', e => {
  const star = e.target.closest('[data-val]');
  if (star) updateStars(Number(star.dataset.val));
});

document.getElementById('star-input').addEventListener('keydown', e => {
  const star = e.target.closest('[data-val]');
  if (star && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); updateStars(Number(star.dataset.val)); }
});

document.getElementById('star-input').addEventListener('mouseover', e => {
  const star = e.target.closest('[data-val]');
  if (!star) return;
  const val = Number(star.dataset.val);
  document.querySelectorAll('#star-input span').forEach(s => {
    s.style.color = Number(s.dataset.val) <= val ? 'var(--yellow)' : '';
  });
});
document.getElementById('star-input').addEventListener('mouseleave', () => {
  const cur = Number(document.getElementById('form-rating').value);
  document.querySelectorAll('#star-input span').forEach(s => {
    s.style.color = '';
    s.classList.toggle('filled', Number(s.dataset.val) <= cur);
  });
});

// ── Add / Edit Form Submission ────────────────────────────────────────────────
document.getElementById('add-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;

  const title = document.getElementById('form-title').value.trim();
  const author = document.getElementById('form-author').value.trim();
  const narrator = document.getElementById('form-narrator').value.trim();
  const status = document.getElementById('form-status').value;
  const sourceUrl = document.getElementById('form-source').value.trim();
  const rating = Number(document.getElementById('form-rating').value);
  const notes = document.getElementById('form-notes').value.trim();
  const olKey = document.getElementById('form-ol-key').value;
  const coverId = document.getElementById('form-cover-id').value;
  const authorKey = form.dataset.authorKey || '';

  if (!title || !author) return;

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    if (editingId) {
      const existing = books.find(b => b.id === editingId) || {};
      await persistBook({ ...existing, title, author, narrator, status, sourceUrl, rating, notes, olKey, coverId, authorKey });
      editingId = null;
    } else {
      await persistBook({ id: genId(), title, author, narrator, status, sourceUrl, rating, notes, olKey, coverId, authorKey, addedAt: Date.now() });
    }
  } finally {
    btn.disabled = false;
  }

  resetAddForm();
  showView('shelf');
});

document.getElementById('cancel-add').addEventListener('click', () => {
  editingId = null;
  resetAddForm();
  showView('shelf');
});

function resetAddForm() {
  editingId = null;
  document.getElementById('add-form-title').textContent = 'Add Audiobook';
  document.getElementById('add-form').reset();
  document.getElementById('add-form').dataset.authorKey = '';
  document.getElementById('form-id').value = '';
  document.getElementById('form-ol-key').value = '';
  document.getElementById('form-cover-id').value = '';
  document.getElementById('form-rating').value = '0';
  updateStars(0);
  document.getElementById('ol-results').classList.remove('open');
}

// ── Discover Search ───────────────────────────────────────────────────────────
document.getElementById('discover-search-btn').addEventListener('click', runDiscoverSearch);
document.getElementById('discover-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') runDiscoverSearch();
});
// Re-sort in-place when sort dropdown changes without a new search
document.getElementById('discover-sort').addEventListener('change', () => {
  const results = document.getElementById('discover-results');
  if (results.children.length > 0) runDiscoverSearch();
});

// Cached raw results so client-side re-sort doesn't need another API call
let lastDiscoverItems = [];

async function runDiscoverSearch() {
  const q = document.getElementById('discover-search').value.trim();
  const subject = document.getElementById('discover-subject').value;
  const sort = document.getElementById('discover-sort').value;
  const results = document.getElementById('discover-results');
  const loading = document.getElementById('discover-loading');

  if (!q && !subject) return;

  results.innerHTML = '';
  loading.classList.remove('hidden');

  try {
    // Always use /search.json so all sort options work consistently
    const params = new URLSearchParams({
      limit: '40',
      fields: 'key,title,author_name,author_key,cover_i,first_publish_year,ratings_average,readinglog_count',
    });
    if (q) params.set('q', q);
    if (subject) params.set('subject', subject);
    if (sort && sort !== 'editions') params.set('sort', sort);

    const res = await fetch(`${OL_API}/search.json?${params}`);
    const data = await res.json();
    lastDiscoverItems = data.docs || [];

    loading.classList.add('hidden');
    renderDiscoverResults(lastDiscoverItems, sort);
  } catch (_) {
    loading.classList.add('hidden');
    results.innerHTML = '<p style="color:var(--text-muted); padding:1rem 0;">Search failed. Please check your connection.</p>';
  }
}

function renderDiscoverResults(items, sort) {
  const results = document.getElementById('discover-results');

  if (items.length === 0) {
    results.innerHTML = '<p style="color:var(--text-muted); padding:1rem 0;">No results found. Try a different search.</p>';
    return;
  }

  // Client-side sort for cases the API can't handle, and to respect "Default" relevance order
  const sorted = [...items];
  if (sort === 'rating') {
    sorted.sort((a, b) => (b.ratings_average || 0) - (a.ratings_average || 0));
  } else if (sort === 'readinglog') {
    sorted.sort((a, b) => (b.readinglog_count || 0) - (a.readinglog_count || 0));
  } else if (sort === 'new') {
    sorted.sort((a, b) => (b.first_publish_year || 0) - (a.first_publish_year || 0));
  } else if (sort === 'title') {
    sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sort === 'author') {
    sorted.sort((a, b) => {
      const aA = (a.author_name || [])[0] || '';
      const bA = (b.author_name || [])[0] || '';
      return aA.localeCompare(bA);
    });
  }

  results.innerHTML = sorted.map(item => {
    const title = escapeHtml(item.title || 'Unknown');
    const authors = escapeHtml((item.author_name || []).join(', ') || 'Unknown');
    const covId = item.cover_i;
    const coverHtml = covId
      ? `<img src="${OL_COVERS}/${covId}-M.jpg" alt="" loading="lazy" />`
      : `<div class="disc-card-placeholder">📚</div>`;
    const lvUrl = librivoxSearchUrl(item.title || '');
    const lbUrl = loyalBooksSearchUrl(item.title || '');
    const olUrl = `https://openlibrary.org${escapeHtml(item.key || '')}`;
    const hpUrl = hooplaSearchUrl(item.title || '');

    const rating = item.ratings_average ? Number(item.ratings_average).toFixed(1) : null;
    const reads = item.readinglog_count ? item.readinglog_count.toLocaleString() : null;
    const year = item.first_publish_year ? String(item.first_publish_year) : null;

    const metaParts = [];
    if (rating) metaParts.push(`★ ${escapeHtml(rating)}`);
    if (reads) metaParts.push(`📖 ${escapeHtml(reads)}`);
    if (year) metaParts.push(`📅 ${escapeHtml(year)}`);
    const metaHtml = metaParts.length
      ? `<div class="dc-meta">${metaParts.join('  ·  ')}</div>`
      : '';

    const libraryLinks = [];
    if (libraryPrefs.openLibraryEnabled) {
      libraryLinks.push(`<a href="${olUrl}" target="_blank" rel="noopener noreferrer">Open Library ↗</a>`);
    }
    if (libraryPrefs.hooplaEnabled) {
      libraryLinks.push(`<a href="${hpUrl}" target="_blank" rel="noopener noreferrer">Hoopla ↗</a>`);
    }
    const libraryActions = libraryLinks.length
      ? `<div class="disc-card-actions library-actions-row"><span class="library-tag">Library:</span>${libraryLinks.join('')}</div>`
      : '';

    return `
      <div class="disc-card">
        ${coverHtml}
        <div class="disc-card-body">
          <div class="dc-title">${title}</div>
          <div class="dc-author">${authors}</div>
          ${metaHtml}
          <div class="disc-card-actions">
            <a href="${lvUrl}" target="_blank" rel="noopener noreferrer">LibriVox ↗</a>
            <a href="${lbUrl}" target="_blank" rel="noopener noreferrer">Loyal Books ↗</a>
          </div>
          ${libraryActions}
        </div>
      </div>`;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
const saveLibraryPrefsBtn = document.getElementById('save-library-prefs');
if (saveLibraryPrefsBtn) {
  saveLibraryPrefsBtn.addEventListener('click', () => {
    readLibraryPrefsFromUi();
    alert('Library setup saved. Discover results now reflect your selected access.');
    if (document.getElementById('discover-results').children.length > 0) {
      renderDiscoverResults(lastDiscoverItems, document.getElementById('discover-sort').value);
    }
  });
}
applyLibraryPrefsToUi();
renderShelf();
