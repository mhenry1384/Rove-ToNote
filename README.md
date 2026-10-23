# Rove ToNote

A desktop notes app for Windows, built with [Tauri 2](https://tauri.app/), React and TypeScript. All your notes live in one `.tonote` file that you choose where to keep: on your disk, in a synced folder, or on Google Drive.

## Features

### Notes in a tree

- Notes are arranged in a tree in the left-hand pane. Folders and nested sub-notes are supported.
- Drag and drop to reorder or re-parent notes. Tab, or the note's menu, indents a note under the one above it. Shift+Tab outdents it back up a level.
- F2 renames the selected note.
- The filter box narrows the tree to notes whose title or content matches. Locked encrypted notes match on title only.
- Each note can have a background color (a Google Keep-style palette) or a background image URL with adjustable opacity. The app remembers recently used image URLs.
- Deleted notes can be restored from **Recently Deleted** or with **Edit → Undo Delete** until the app closes.

### Note types

- **Markdown**: a rich editor based on [Milkdown Crepe](https://milkdown.dev/). **Edit → Sort Lines** sorts the selected lines alphabetically. If nothing is selected, it sorts the list under the cursor, or else the whole note.
- **To-do list**: tasks with checkboxes, drag-to-reorder, high/medium/low priority, and notes on each task. Sort by hand, by priority or alphabetically. Only the 10 most recently completed tasks are kept. A to-do list is stored as ordinary GFM task-list markdown, with its extra data in HTML comments, so it still reads well in any markdown viewer.
- **Password grid**: a table of name, username, password and note that is always sorted by name. It has its own filter box and undo for deleted rows. Clicking into a password copies it to the clipboard.
- **Folder**: a container for other notes.

### Encryption

- Any note can be encrypted. A folder's menu can also encrypt or decrypt everything under it.
- All encrypted notes in a document share one password. The key is derived with PBKDF2-SHA256 (210,000 iterations), and each note is encrypted with AES-256-GCM using the Web Crypto API.
- The password and the key are only kept in memory while the document is unlocked. The document file never contains either one. The password can be changed, and every encrypted note is then re-encrypted.

### Saving and backups

- The app autosaves 30 seconds after your last change. Ctrl+S saves right away. On startup it reopens the last document you used.
- It takes a snapshot backup when you switch documents, when you close the app, and after 5 minutes without mouse or keyboard activity, but only if something changed. Each document keeps its 20 most recent backups in the app-data folder.
- **File → View Backups…** lists a document's backups. A backup opens in a separate window, so the document you're working on isn't touched.

### Google Drive

- **File → Open from Google Drive…** and **Save a Copy to Google Drive…** let you keep a document on Drive. The app uses the `drive.file` scope, so it can only see files it created or that you open with it.
- Sign-in uses OAuth with PKCE and a loopback redirect. The refresh token is kept in the Windows Credential Manager.
- While a Drive document is open, the app checks Drive for changes every 45 seconds. If the file changed on Drive and you also have unsaved edits, a banner asks whether to keep your edits or use the version on Drive.

## File format

A `.tonote` file is JSON. It holds a format version, the vault data (the salt, the iteration count and a password verifier) and a flat list of notes. Each note has its parent id, sort order, type, color and content. Markdown and to-do content is stored as markdown, password grids as JSON, and encrypted notes as an `{iv, ciphertext}` envelope.

Settings that only apply to one machine, such as the last opened file, window size, which tree nodes are expanded and recent image URLs, are kept in `prefs.json` in the app-data folder rather than in the document.

## Development

You need [Node.js](https://nodejs.org/) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Rust and the WebView2 runtime).

```sh
npm install
npm run tauri dev     # run the app with hot reload
npm test              # run the Vitest unit tests
npm run tauri build   # build an installer
```

### Google Drive setup

Drive features need a Google OAuth client:

1. In the Google Cloud Console, enable the Google Drive API.
2. Under **APIs & Services → Credentials**, create an **OAuth client ID** with the application type **Desktop app**.
3. Copy `.env.example` to `.env` and fill in `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_SECRET`.

Everything else in the app works without these values.

### Project layout

- `src/components/`: React UI (tree view, the editor for each note type, Drive, vault and backup dialogs).
- `src/document/`: the document model, file I/O, encryption, the to-do markdown format, backups and the Drive client.
- `src/stores/`: Zustand stores for app state.
- `src/menu/`: the native app menu.
- `src-tauri/`: the Rust side, which handles the OAuth loopback listener, keyring access and launching a separate instance to view a backup.
