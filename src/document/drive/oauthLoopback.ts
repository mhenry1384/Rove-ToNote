import { invoke } from "@tauri-apps/api/core";

export interface OAuthCallbackResult {
  code: string | null;
  state: string | null;
  error: string | null;
}

/**
 * Starts the Rust-side loopback listener and returns its port plus a
 * `waitForCallback` closure. Call `waitForCallback()` only after opening the
 * system browser to the consent screen — it resolves once Google's redirect
 * hits the listener (or after a 2-minute timeout).
 */
export async function startLoopbackListener(): Promise<{
  port: number;
  waitForCallback: () => Promise<OAuthCallbackResult>;
}> {
  const port = await invoke<number>("drive_oauth_listen");
  return {
    port,
    waitForCallback: () => invoke<OAuthCallbackResult>("drive_oauth_await_code"),
  };
}
