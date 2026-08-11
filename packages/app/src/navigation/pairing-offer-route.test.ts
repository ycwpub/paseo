import { describe, expect, it } from "vitest";
import { isPairingOfferFragment } from "@/navigation/pairing-offer-route";

describe("isPairingOfferFragment", () => {
  it("recognizes pairing offers hosted under an arbitrary route prefix", () => {
    expect(isPairingOfferFragment("#offer=encoded-offer")).toBe(true);
  });

  it.each([undefined, null, "", "#offer=", "#other=value"])(
    "rejects non-pairing fragment %s",
    (fragment) => {
      expect(isPairingOfferFragment(fragment)).toBe(false);
    },
  );
});
