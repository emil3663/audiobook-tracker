# 📚 Audiobook Tracker

A lightweight, browser-based app to track the audiobooks you've listened to and discover similar books by the same author — no sign-up, no server, no cost.

All data is stored locally in your browser's **localStorage**.

## Live Demo

Host this folder on [GitHub Pages](https://pages.github.com/) and open `index.html`.

---

## Features

| Feature | Description |
|---|---|
| **My Shelf** | View all your audiobooks with status badges, search, and filter |
| **Add / Edit** | Auto-fill book details from the Open Library API, add source URL, notes, and a star rating |
| **Book Detail** | See full details, notes, source link, and *More by this Author* pulled live from Open Library |
| **Discover** | Search Open Library by title/author or subject; sort results by rating, most-read, newest, title, or author; links directly to free listening sources |
| **Cross-device sync** | Sign in with a free Firebase account to sync your shelf in real-time across all devices |
| **Free sources** | Quick links to LibriVox, Loyal Books, Open Library, Project Gutenberg, Hoopla, and YouTube |

---

## Where to Find Free Audiobooks

| Source | URL | Notes |
|---|---|---|
| **LibriVox** | https://librivox.org | Public domain, volunteer-read, huge catalog |
| **Loyal Books** | https://www.loyalbooks.com | Free public domain audiobooks & ebooks |
| **Open Library** | https://openlibrary.org | Borrow with a free account (Internet Archive) |
| **Project Gutenberg** | https://www.gutenberg.org/browse/categories/1 | Classic texts with audio |
| **Hoopla** | https://www.hoopladigital.com | Free with a public library card |
| **Libby / OverDrive** | https://www.overdrive.com | Free with a public library card |
| **YouTube** | https://youtube.com | Search *"[title] full audiobook free"* |

---

## Cross-Device Sync (Laptop ↔ Phone)

By default the app stores your shelf in your browser's `localStorage` (device-only). To sync automatically between all your devices:

1. **Create a free Firebase project** at https://console.firebase.google.com/
   - No credit card required. The free "Spark" plan covers everything.

2. **Register a Web app** in the project (`</>` button).
   Copy the `firebaseConfig` values.

3. **Open `firebase-config.js`** and replace the placeholder strings with your real values.

4. **Create a Firestore database** ("Firestore Database" → "Create database").
   After creation go to **Rules** and paste:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/books/{bookId} {
         allow read, write: if request.auth != null
                            && request.auth.uid == userId;
       }
     }
   }
   ```

5. **Enable Email/Password sign-in**: "Authentication" → "Sign-in method" → Email/Password → Enable.

6. Reload the app — a **"Sign In to Sync"** button appears in the header.  
   Create an account and sign in on every device. Any change on one device appears on all others instantly.

> If you do not fill in `firebase-config.js`, the app works exactly as before using `localStorage`.

---

## Getting Started

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge).
2. Click **Add Book** to add your first audiobook.
3. Use the Open Library search to auto-fill title, author, and cover art.
4. Set the status (*Want to Listen / Listening / Finished*), add a source URL and any notes.
5. Visit a book's detail page to see other books by the same author.
6. Use **Discover** to search for new titles and find where to listen for free.

---

## Technology

- **HTML / CSS / JavaScript** – no build step, no dependencies.
- **[Open Library API](https://openlibrary.org/developers/api)** – free, no API key required.
- **localStorage** – all your data stays in your browser.

---

## File Structure

```
audiobook-tracker/
├── index.html          # Single-page app shell
├── style.css           # Dark-mode responsive styles
├── app.js              # All app logic
├── firebase-config.js  # Optional Firebase sync configuration
└── README.md           # This file
```

---

## Privacy

- **Without Firebase sync:** All shelf data stays in your browser's `localStorage` and never leaves your device. The app only makes read-only requests to the Open Library API to fetch book metadata.
- **With Firebase sync:** Your shelf (book titles, authors, notes, ratings, and status) is stored in Google Firestore under your account, so it can be accessed from all your signed-in devices. No payment information or passwords are stored in Firestore. Your Firebase password is handled securely by Firebase Authentication and is never visible to the app.
