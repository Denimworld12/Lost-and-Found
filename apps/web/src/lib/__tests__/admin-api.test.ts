import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { withHeldDisputes, type AdminDispute } from "../admin-api";

const dispute = (id: bigint): AdminDispute =>
  ({
    item: {
      id,
      owner: getAddress("0x9FF4CD7D8DaF39334b469D7C009e5BC4830B6947"),
    },
    ownerEmail: null,
    finderEmail: null,
  }) as AdminDispute;

describe("withHeldDisputes", () => {
  it("keeps a resolved dispute listed while its audit entry is unsaved", () => {
    const open = [dispute(2n), dispute(3n)];
    const resolved = dispute(1n);
    expect(withHeldDisputes(open, [resolved])).toEqual([resolved, ...open]);
  });

  it("doesn't repeat a held dispute that is still open", () => {
    const open = [dispute(1n), dispute(2n)];
    expect(withHeldDisputes(open, [dispute(1n)])).toEqual(open);
  });

  it("is just the open disputes when nothing is held", () => {
    const open = [dispute(1n)];
    expect(withHeldDisputes(open, [])).toEqual(open);
  });
});
