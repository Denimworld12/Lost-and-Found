import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchMetadata,
  ipfsUrl,
  isCid,
  itemMetadataSchema,
  MetadataUnavailableError,
  pinataGateway,
} from "../ipfs";

const CID_V1 = "bafkreihtny7ve5ohrklxftqiqib3xjq254ak7ljwrvydyomnwgsh32j3xm";
const CID_V0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

const valid = {
  title: "Casio fx-991 calculator",
  category: "Electronics",
  location: "Library, 2nd floor",
  lostOn: "2026-10-02",
  description: "Black, sticker on the back",
  image: CID_V1,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ipfsUrl", () => {
  it("builds a Pinata gateway URL for v0 and v1 CIDs", () => {
    expect(ipfsUrl(CID_V1)).toBe(`https://gateway.pinata.cloud/ipfs/${CID_V1}`);
    expect(isCid(CID_V0)).toBe(true);
  });

  it("uses the configured gateway host, even if given as a URL", () => {
    vi.stubEnv("NEXT_PUBLIC_PINATA_GATEWAY", "https://my-gw.mypinata.cloud/");
    vi.stubEnv("NEXT_PUBLIC_PINATA_GATEWAY_KEY", "");
    expect(pinataGateway()).toBe("my-gw.mypinata.cloud");
    expect(ipfsUrl(CID_V1)).toBe(`https://my-gw.mypinata.cloud/ipfs/${CID_V1}`);
  });

  it("adds the gateway key to dedicated gateway URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_PINATA_GATEWAY", "my-gw.mypinata.cloud");
    vi.stubEnv("NEXT_PUBLIC_PINATA_GATEWAY_KEY", " k3y ");
    expect(ipfsUrl(CID_V1)).toBe(
      `https://my-gw.mypinata.cloud/ipfs/${CID_V1}?pinataGatewayToken=k3y`,
    );
  });

  it("never sends the gateway key to the shared gateway", () => {
    vi.stubEnv("NEXT_PUBLIC_PINATA_GATEWAY", "");
    vi.stubEnv("NEXT_PUBLIC_PINATA_GATEWAY_KEY", "k3y");
    expect(ipfsUrl(CID_V1)).toBe(`https://gateway.pinata.cloud/ipfs/${CID_V1}`);
  });

  it("refuses anything that isn't a CID", () => {
    expect(ipfsUrl("../../etc/passwd")).toBeNull();
    expect(ipfsUrl(`${CID_V1}/x`)).toBeNull();
    expect(ipfsUrl("")).toBeNull();
  });
});

describe("itemMetadataSchema", () => {
  it("accepts the upload API's shape", () => {
    expect(itemMetadataSchema.parse(valid)).toEqual(valid);
  });

  it("rejects unknown categories, long titles and bad dates", () => {
    expect(
      itemMetadataSchema.safeParse({ ...valid, category: "Pets" }).success,
    ).toBe(false);
    expect(
      itemMetadataSchema.safeParse({ ...valid, title: "x".repeat(61) }).success,
    ).toBe(false);
    expect(
      itemMetadataSchema.safeParse({ ...valid, lostOn: "2 Oct" }).success,
    ).toBe(false);
  });
});

describe("fetchMetadata", () => {
  it("returns validated metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(valid))),
    );
    await expect(fetchMetadata(CID_V1)).resolves.toEqual(valid);
  });

  it("throws MetadataUnavailableError on HTTP errors, bad JSON and bad shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 504 })),
    );
    await expect(fetchMetadata(CID_V1)).rejects.toBeInstanceOf(
      MetadataUnavailableError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{not json")),
    );
    await expect(fetchMetadata(CID_V1)).rejects.toBeInstanceOf(
      MetadataUnavailableError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ title: "x" }))),
    );
    await expect(fetchMetadata(CID_V1)).rejects.toBeInstanceOf(
      MetadataUnavailableError,
    );
  });

  it("never calls the gateway for a non-CID", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchMetadata("not-a-cid")).rejects.toBeInstanceOf(
      MetadataUnavailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
