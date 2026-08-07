import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { exchangeCodeForProfile, googleConfigured } from "@/lib/google";
import { generateUsername } from "@/lib/username";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function backToLogin(reason: string) {
  return NextResponse.redirect(
    `${appUrl()}/login?error=${encodeURIComponent(reason)}`
  );
}

export const GET = handler(async (req: Request) => {
  if (!googleConfigured()) return backToLogin("Google sign-in is not configured.");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expectedState = jar.get("xamvaad_oauth_state")?.value;
  jar.delete("xamvaad_oauth_state");

  if (url.searchParams.get("error")) return backToLogin("Google sign-in was cancelled.");
  if (!code) return backToLogin("Google did not return an authorization code.");
  if (!state || state !== expectedState) {
    return backToLogin("Sign-in session expired. Please try again.");
  }

  const profile = await exchangeCodeForProfile(code);
  if (!profile.email_verified) {
    return backToLogin("Your Google email is not verified.");
  }

  const email = profile.email.toLowerCase();

  // Link by googleId first, then fall back to email so an existing
  // password account can adopt Google sign-in without duplicating.
  let user = await db.user.findFirst({
    where: { OR: [{ googleId: profile.sub }, { email }] },
    select: { id: true, googleId: true },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        name: profile.name,
        email,
        googleId: profile.sub,
        image: profile.picture ?? null,
        username: await generateUsername(profile.name || email),
      },
      select: { id: true, googleId: true },
    });
  } else if (!user.googleId) {
    await db.user.update({
      where: { id: user.id },
      data: { googleId: profile.sub, image: profile.picture ?? undefined },
    });
  }

  await createSession(user.id);
  return NextResponse.redirect(appUrl() + "/");
});
