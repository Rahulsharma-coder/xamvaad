/**
 * Minimal Google OAuth 2.0 authorization-code flow.
 *
 * Deliberately dependency-free: the app owns its own session cookie (see
 * lib/auth.ts), so all we need from Google is a verified email + profile.
 * Swapping in Auth.js later means replacing these two functions.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

/**
 * The public origin this deployment is reachable at.
 *
 * Google matches `redirect_uri` character for character against the list in
 * the Cloud console, so this has to be exact. Trailing slashes are stripped
 * because pasting the URL out of a browser bar is how they get in, and
 * "https://x.vercel.app//api/auth/google/callback" fails that match with no
 * useful error.
 *
 * Falling back to localhost is right for `npm run dev` and wrong everywhere
 * else: unset in production, the sign-in flow sends people to a machine that
 * isn't theirs. Set NEXT_PUBLIC_APP_URL on the host.
 */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}

export function redirectUri(): string {
  return `${appOrigin()}/api/auth/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
};

export async function exchangeCodeForProfile(
  code: string
): Promise<GoogleProfile> {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!profileRes.ok) {
    throw new Error(`Google userinfo failed: ${await profileRes.text()}`);
  }

  return (await profileRes.json()) as GoogleProfile;
}
