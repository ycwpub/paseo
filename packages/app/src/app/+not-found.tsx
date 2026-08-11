import React from "react";
import { Redirect } from "expo-router";
import { isPairingOfferFragment } from "@/navigation/pairing-offer-route";
import Index from "./index";

export default function NotFound() {
  // A self-hosted Relay may expose the single-page app at any configured path
  // (for example /app). Expo Router does not know that deployment prefix, so
  // the initial browser URL otherwise lands on its generated unmatched route.
  // Render the normal startup route here so the root layout can import the
  // pairing offer and navigate to the connected host.
  if (typeof window !== "undefined" && isPairingOfferFragment(window.location?.hash)) {
    return <Index />;
  }

  return <Redirect href="/" />;
}
