# Working with this repo

- Do not monitor or watch the running app (dev server, Tauri process, etc.) — the user monitors it themselves.
- After making a code change, automatically build and restart the app (kill the running `npm run tauri dev` process and relaunch it) rather than relying on Vite HMR alone.
