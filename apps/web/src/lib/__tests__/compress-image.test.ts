import { describe, expect, it } from "vitest";
import { fitWithin, MAX_EDGE } from "../compress-image";

describe("fitWithin", () => {
  it("scales the long edge down to 1600 px and keeps the ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: MAX_EDGE });
  });

  it("never scales a small photo up", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
