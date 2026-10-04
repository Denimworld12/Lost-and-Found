import "server-only";
import { PinataSDK } from "pinata";
import { serverEnv } from "./env";
import { pinataGateway } from "./ipfs";

let pinata: PinataSDK | undefined;

function getPinata(): PinataSDK {
  pinata ??= new PinataSDK({
    pinataJwt: serverEnv.pinataJwt(),
    pinataGateway: pinataGateway(),
  });
  return pinata;
}

/**
 * Pins public, permanent content. File names are generic on purpose: Pinata shows them in the
 * dashboard and they must not carry personal data.
 */
export async function pinImage(webp: Buffer): Promise<string> {
  const file = new File([new Uint8Array(webp)], "item-photo.webp", {
    type: "image/webp",
  });
  const { cid } = await getPinata().upload.public.file(file);
  return cid;
}

export async function pinJson(data: object): Promise<string> {
  const { cid } = await getPinata()
    .upload.public.json(data)
    .name("item-metadata.json");
  return cid;
}
