export function isPairingOfferFragment(hash: string | null | undefined): boolean {
  return typeof hash === "string" && hash.startsWith("#offer=") && hash.length > "#offer=".length;
}
