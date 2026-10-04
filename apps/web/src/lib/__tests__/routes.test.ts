import { describe, expect, it } from "vitest";
import { decideRoute, type RouteRequest } from "../routes";
import type { AppMetadata } from "../session";

const domains = ["college.edu.in"];

function request(
  pathname: string,
  overrides: Partial<RouteRequest> = {},
): RouteRequest {
  return {
    pathname,
    userId: null,
    claims: null,
    allowedDomains: domains,
    ...overrides,
  };
}

const student = (metadata: AppMetadata = {}): Partial<RouteRequest> => ({
  userId: "user_1",
  claims: { email: "riya@college.edu.in", metadata },
});

describe("decideRoute: public pages", () => {
  it.each([
    "/",
    "/items",
    "/items/12",
    "/how-it-works",
    "/transparency",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/not-eligible",
  ])("lets a logged-out visitor open %s", (path) => {
    expect(decideRoute(request(path))).toEqual({ type: "next" });
  });

  it("keeps public pages open to a signed-in user outside the college domain", () => {
    expect(
      decideRoute(
        request("/items", { userId: "u", claims: { email: "x@gmail.com" } }),
      ),
    ).toEqual({ type: "next" });
  });
});

describe("decideRoute: signed-in pages", () => {
  it("sends logged-out visitors to sign in", () => {
    for (const path of [
      "/onboarding",
      "/post",
      "/me",
      "/admin",
      "/admin/students",
    ]) {
      expect(decideRoute(request(path))).toEqual({ type: "sign-in" });
    }
  });

  it("opens /onboarding to any college user", () => {
    expect(decideRoute(request("/onboarding", student()))).toEqual({
      type: "next",
    });
  });

  it("sends non-college emails to /not-eligible", () => {
    const outsider = {
      userId: "u",
      claims: { email: "riya@gmail.com", metadata: {} },
    };
    for (const path of ["/onboarding", "/post", "/me", "/admin"]) {
      expect(decideRoute(request(path, outsider))).toEqual({
        type: "redirect",
        to: "/not-eligible",
      });
    }
  });

  it("honours the webhook's ineligible flag even without the email claim", () => {
    expect(
      decideRoute(
        request("/onboarding", {
          userId: "u",
          claims: { metadata: { ineligible: true } },
        }),
      ),
    ).toEqual({ type: "redirect", to: "/not-eligible" });
  });

  it("leaves the domain check to the server when the email claim or domain config is missing", () => {
    expect(
      decideRoute(request("/onboarding", { userId: "u", claims: {} })),
    ).toEqual({
      type: "next",
    });
    expect(
      decideRoute(
        request("/onboarding", {
          userId: "u",
          claims: { email: "x@gmail.com" },
          allowedDomains: [],
        }),
      ),
    ).toEqual({ type: "next" });
  });
});

describe("decideRoute: verified pages", () => {
  it("opens /post and /me once onchainVerified is true", () => {
    for (const path of ["/post", "/me", "/me/history"]) {
      expect(
        decideRoute(request(path, student({ onchainVerified: true }))),
      ).toEqual({
        type: "next",
      });
    }
  });

  it("sends unverified students to /onboarding", () => {
    for (const metadata of [
      {},
      { onchainVerified: false },
      { role: "student" as const },
    ]) {
      expect(decideRoute(request("/post", student(metadata)))).toEqual({
        type: "redirect",
        to: "/onboarding",
      });
    }
  });
});

describe("decideRoute: admin", () => {
  it("opens every admin section to admins", () => {
    for (const path of ["/admin", "/admin/students", "/admin/settings"]) {
      expect(decideRoute(request(path, student({ role: "admin" })))).toEqual({
        type: "next",
      });
    }
  });

  it("limits arbiters to disputes", () => {
    const arbiter = student({ role: "arbiter" });
    expect(decideRoute(request("/admin", arbiter))).toEqual({ type: "next" });
    expect(decideRoute(request("/admin/disputes", arbiter))).toEqual({
      type: "next",
    });
    expect(decideRoute(request("/admin/students", arbiter))).toEqual({
      type: "redirect",
      to: "/admin/disputes",
    });
  });

  it("turns students away", () => {
    expect(
      decideRoute(request("/admin", student({ role: "student" }))),
    ).toEqual({
      type: "redirect",
      to: "/",
    });
  });
});

describe("decideRoute: API", () => {
  it("leaves webhooks public (signature-verified in the handler)", () => {
    expect(decideRoute(request("/api/webhooks/clerk"))).toEqual({
      type: "next",
    });
  });

  it("answers 401 to logged-out API calls and passes signed-in ones to the handler", () => {
    expect(decideRoute(request("/api/onboarding/status"))).toEqual({
      type: "unauthorized",
    });
    expect(
      decideRoute(request("/api/admin/students", { userId: "u" })),
    ).toEqual({
      type: "next",
    });
  });

  it("does not apply page redirects to API routes", () => {
    expect(
      decideRoute(
        request("/api/upload", {
          userId: "u",
          claims: { email: "x@gmail.com" },
        }),
      ),
    ).toEqual({ type: "next" });
  });
});
