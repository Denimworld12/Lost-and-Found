import { describe, expect, it } from "vitest";
import { parseAllowedDomains } from "../env";
import { displayDomain, isAllowedEmail, roleOf } from "../session";

describe("isAllowedEmail", () => {
  const domains = ["college.edu.in"];

  it("accepts an exact domain match, ignoring case", () => {
    expect(isAllowedEmail("riya@college.edu.in", domains)).toBe(true);
    expect(isAllowedEmail("Riya@College.EDU.in", domains)).toBe(true);
  });

  it("rejects other domains, subdomains and look-alike suffixes", () => {
    expect(isAllowedEmail("riya@gmail.com", domains)).toBe(false);
    expect(isAllowedEmail("riya@cs.college.edu.in", domains)).toBe(false);
    expect(isAllowedEmail("riya@evilcollege.edu.in", domains)).toBe(false);
    expect(isAllowedEmail("riya@college.edu.in.evil.com", domains)).toBe(false);
  });

  it("uses the part after the last @", () => {
    expect(isAllowedEmail("a@college.edu.in@gmail.com", domains)).toBe(false);
    expect(isAllowedEmail('"a@gmail.com"@college.edu.in', domains)).toBe(true);
  });

  it("rejects missing input, malformed addresses and an empty allowlist", () => {
    expect(isAllowedEmail(null, domains)).toBe(false);
    expect(isAllowedEmail("", domains)).toBe(false);
    expect(isAllowedEmail("@college.edu.in", domains)).toBe(false);
    expect(isAllowedEmail("riya@", domains)).toBe(false);
    expect(isAllowedEmail("riya@college.edu.in", [])).toBe(false);
  });

  it("allows a subdomain only when it is listed", () => {
    const listed = parseAllowedDomains("college.edu.in, cs.college.edu.in");
    expect(isAllowedEmail("riya@cs.college.edu.in", listed)).toBe(true);
  });
});

describe("parseAllowedDomains", () => {
  it("splits, trims, lowercases and drops a leading @", () => {
    expect(
      parseAllowedDomains(" @College.edu.in ,cs.college.edu.in,, "),
    ).toEqual(["college.edu.in", "cs.college.edu.in"]);
    expect(parseAllowedDomains("")).toEqual([]);
  });
});

describe("roleOf", () => {
  it("reads known roles only", () => {
    expect(roleOf({ role: "admin" })).toBe("admin");
    expect(roleOf({ role: "arbiter" })).toBe("arbiter");
    expect(roleOf({ role: "student" })).toBe("student");
    expect(roleOf({ role: "superuser" })).toBeNull();
    expect(roleOf({ role: 1 })).toBeNull();
    expect(roleOf(undefined)).toBeNull();
  });
});

describe("displayDomain", () => {
  it("shows the first configured domain", () => {
    expect(displayDomain("College.edu.in,cs.college.edu.in")).toBe(
      "college.edu.in",
    );
    expect(displayDomain(undefined)).toBeNull();
    expect(displayDomain(" ")).toBeNull();
  });
});
