# Working with this repo

- Do not monitor or watch the running app (dev server, Tauri process, etc.) — the user monitors it themselves.
- After making a code change, automatically build and restart the app (kill the running `npm run tauri dev` process and relaunch it) rather than relying on Vite HMR alone.
- Before every release build, check `git status`. If there are uncommitted changes, bump the
  version number first: increment the rightmost digit (e.g. 0.4.0 -> 0.4.1) in `package.json`,
  `package-lock.json` (both the top-level `version` and the root package's entry under
  `packages[""]`), `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. If the working tree is
  clean, keep the current version.
- On macOS: do not build or package a DMG during a release build unless the user explicitly asks
  for one. Build the app bundle only (`npm run tauri build -- --bundles app`).
- On macOS: after a release build, if Rove ToNote is already running, quit it and relaunch it so
  the new build is the one running. If it isn't running, don't start it.
