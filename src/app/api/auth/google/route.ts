import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appOrigin, buildAuthUrl, googleConfigured } from "@/lib/google";
import { handler } from "@/lib/api";

export const GET = handler(async () => {
  if (!googleConfigured()) {
    // Send the visitor back to a real screen with a readable message rather
    // than dumping JSON in the browser window.
    //
    // The remedy differs by environment, and naming the wrong one costs real
    // debugging time: telling someone to edit .env and restart the dev server
    // is useless advice when they are staring at a deployed site.
    const remedy =
      process.env.NODE_ENV === "production"
        ? "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing from this deployment. Set both in your host's environment variables (scoped to Production) and redeploy — adding them without a new deployment has no effect."
        : "Google sign-in isn't configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env, then restart the dev server.";

    return NextResponse.redirect(
      `${appOrigin()}/login?error=${encodeURIComponent(remedy)}`
    );
  }

  // CSRF protection: round-trip a random state through Google and compare it
  // against a short-lived cookie in the callback.
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("xamvaad_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
});
