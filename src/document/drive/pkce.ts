/** PKCE (RFC 7636) + CSRF-state helpers for the Google OAuth loopback flow. */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** 43–128 char base64url string, per RFC 7636. 32 random bytes -> 43 chars. */
export function generateCodeVerifier(): string {
  return randomBase64Url(32);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function generateState(): string {
  return randomBase64Url(16);
}
