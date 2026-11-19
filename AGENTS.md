# Working with this repo

- Work directly on the `main` branch. Do not create feature branches; commit features straight
  to `main`.
- Do not monitor or watch the running app (dev server, Tauri process, etc.) — the user monitors it themselves.
- Do not use the dev app (`npm run tauri dev`) unless the user asks for it.
- After making a code change, automatically do a release build (see the release build rules
  below), then quit any running Rove ToNote and launch the new release build, even if it wasn't
  running before.
- Before every release build, check `git status`. If there are uncommitted changes, bump the
  version number first. Versions are a simple incrementing number (v5, v6, v7, ...); because
  Cargo and Tauri require semver, store it as `N.0.0` and increment the first number
  (e.g. 5.0.0 -> 6.0.0). Update it in `package.json`,
  `package-lock.json` (both the top-level `version` and the root package's entry under
  `packages[""]`), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`
  (the version of the `tonote` package entry). If the working tree is
  clean, keep the current version.
- On Windows: do not generate an installer (MSI or NSIS setup.exe) during a release build unless
  the user explicitly asks for one. Build the executable only
  (`npm run tauri build -- --no-bundle`).
- On macOS: do not build or package a DMG during a release build unless the user explicitly asks
  for one. Build the app bundle only (`npm run tauri build -- --bundles app`).
- On macOS: after a release build, if Rove ToNote is already running, quit it and relaunch it so
  the new build is the one running. If it isn't running, don't start it.
