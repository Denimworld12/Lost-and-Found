import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Off-chain data. The email ↔ wallet link lives only here and in Clerk; it is never sent to
 * the client except a user's own row, the other party of their item, or to admins.
 */

export const studentStatus = pgEnum("student_status", [
  "pending",
  "verified",
  "failed",
  "revoked",
]);

export type StudentStatus = (typeof studentStatus.enumValues)[number];

/** One row per student; one wallet per student and one student per wallet. */
export const students = pgTable(
  "students",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    email: text("email").notNull().unique(),
    /** Lowercase `0x…` address, so the unique index can't be dodged by checksum casing. */
    walletAddress: text("wallet_address").notNull().unique(),
    status: studentStatus("status").notNull().default("pending"),
    verifyTxHash: text("verify_tx_hash"),
    /** Last verification error, shown to admins; never a stack trace. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "students_wallet_lowercase",
      sql`${table.walletAddress} = lower(${table.walletAddress})`,
    ),
  ],
);

export type Student = typeof students.$inferSelect;

/** Every pinned upload, for the per-hour rate limit and abuse tracing. */
export const uploads = pgTable(
  "uploads",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    /** Metadata JSON CID (what goes on-chain). */
    cid: text("cid").notNull(),
    /** Bytes pinned (processed image + metadata JSON). */
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("uploads_user_created_idx").on(table.clerkUserId, table.createdAt),
  ],
);

/** Audit log of admin actions (revoke, retry, and Phase 9's config changes). */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: serial("id").primaryKey(),
    actorClerkId: text("actor_clerk_id").notNull(),
    action: text("action").notNull(),
    /** What was acted on, e.g. a Clerk user ID or an item ID. */
    target: text("target").notNull(),
    txHash: text("tx_hash"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("admin_actions_created_idx").on(table.createdAt)],
);

/** Who saw whose contact details, and when. */
export const contactReveals = pgTable(
  "contact_reveals",
  {
    id: serial("id").primaryKey(),
    itemId: bigint("item_id", { mode: "bigint" }).notNull(),
    viewerClerkId: text("viewer_clerk_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("contact_reveals_item_idx").on(table.itemId)],
);
