import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseAllowedDomains } from "@/lib/env";
import { decideRoute } from "@/lib/routes";

/** Clerk session + route rules from `src/lib/routes.ts` (Next.js 16 calls middleware "proxy"). */
export default clerkMiddleware(
  async (auth, request) => {
    const { userId, sessionClaims, redirectToSignIn } = await auth();
    const decision = decideRoute({
      pathname: request.nextUrl.pathname,
      userId,
      claims: sessionClaims
        ? { metadata: sessionClaims.metadata, email: sessionClaims.email }
        : null,
      allowedDomains: parseAllowedDomains(
        process.env.ALLOWED_EMAIL_DOMAIN ?? "",
      ),
    });

    switch (decision.type) {
      case "next":
        return NextResponse.next();
      case "sign-in":
        return redirectToSignIn({ returnBackUrl: request.url });
      case "redirect":
        return NextResponse.redirect(new URL(decision.to, request.url));
      case "unauthorized":
        return NextResponse.json(
          {
            error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
          },
          { status: 401 },
        );
    }
  },
  {
    // Our own pages, not Clerk's hosted Account Portal (the provider's props don't reach here).
    signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/sign-in",
    signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || "/sign-up",
  },
);

export const config = {
  matcher: [
    // Everything except Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
