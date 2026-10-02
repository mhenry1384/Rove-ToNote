import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "./pkce";
import { startLoopbackListener } from "./oauthLoopback";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

// Refresh this many ms before actual expiry, so a call never races an
// access token that's about to die mid-request.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

export class DriveAuthError extends Error {}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
}

let cachedAccessToken: CachedAccessToken | null = null;
// Lazily loaded from the OS keychain once per app session, then kept here so
// every getAccessToken() call after the first doesn't re-hit the keychain.
let cachedRefreshToken: string | null | undefined;

async function loadRefreshTokenFromKeychain(): Promise<string | null> {
  if (cachedRefreshToken === undefined) {
    cachedRefreshToken = await invoke<string | null>("get_drive_refresh_token");
  }
  return cachedRefreshToken;
}

async function exchangeCodeForTokens(code: string, verifier: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    throw new DriveAuthError(`Google sign-in failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    throw new DriveAuthError(`Couldn't refresh the Google Drive session (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

async function fetchAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new DriveAuthError(`Couldn't read the signed-in Google account (${res.status})`);
  const data = (await res.json()) as { user?: { emailAddress?: string } };
  return data.user?.emailAddress ?? "";
}

/** Runs the full loopback OAuth flow and persists the refresh token. */
export async function performSignIn(): Promise<{ accountEmail: string }> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  const { port, waitForCallback } = await startLoopbackListener();
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", SCOPE);
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);

  await openUrl(authorizeUrl.toString());
  const callback = await waitForCallback();

  if (callback.error) throw new DriveAuthError(`Google sign-in was cancelled or denied: ${callback.error}`);
  if (!callback.code) throw new DriveAuthError("Google sign-in didn't return an authorization code.");
  if (callback.state !== state) throw new DriveAuthError("Google sign-in response failed a security check.");

  const tokens = await exchangeCodeForTokens(callback.code, verifier, redirectUri);
  if (!tokens.refresh_token) {
    throw new DriveAuthError(
      "Google didn't return a refresh token. Try signing out of Rove ToNote's Drive access at " +
        "myaccount.google.com/permissions and signing in again.",
    );
  }

  await invoke("store_drive_refresh_token", { token: tokens.refresh_token });
  cachedRefreshToken = tokens.refresh_token;
  cachedAccessToken = {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };

  return { accountEmail: await fetchAccountEmail(tokens.access_token) };
}

export async function performSignOut(): Promise<void> {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  await invoke("clear_drive_refresh_token");
}

/** Checks the keychain for a prior session without forcing a token refresh. */
export async function hasStoredSession(): Promise<boolean> {
  return (await loadRefreshTokenFromKeychain()) !== null;
}

export async function getSignedInAccountEmail(): Promise<string> {
  return fetchAccountEmail(await getAccessToken());
}

/** Forces the next getAccessToken() call to refresh, e.g. after a Drive API
 * call gets a 401 despite a cached token that looked unexpired (revoked
 * access). */
export function invalidateAccessTokenCache(): void {
  cachedAccessToken = null;
}

/** The chokepoint every Drive REST call goes through. */
export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cachedAccessToken.accessToken;
  }
  const refreshToken = await loadRefreshTokenFromKeychain();
  if (!refreshToken) throw new DriveAuthError("Not signed in to Google Drive.");
  const tokens = await refreshAccessToken(refreshToken);
  cachedAccessToken = {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  return cachedAccessToken.accessToken;
}
