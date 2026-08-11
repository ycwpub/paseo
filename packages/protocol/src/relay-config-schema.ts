import { z } from "zod";

export const RelayEndpointConfigSchema = z
  .object({
    endpoint: z.string().trim().min(1),
    useTls: z.boolean(),
    publicEndpoint: z.string().trim().min(1).optional(),
    publicUseTls: z.boolean().optional(),
    pairingBaseUrl: z.url().optional(),
  })
  .passthrough();

export const MutableLocalRelayConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    listen: z.string().trim().min(1).default("0.0.0.0:6769"),
    publicEndpoint: z.string().trim().min(1).optional(),
    pairingBaseUrl: z.url().optional(),
    webApp: z
      .object({
        enabled: z.boolean().default(false),
        path: z.string().trim().min(1).default("/app"),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const MutableRelayConfigSchema = z
  .object({
    endpoints: z.array(RelayEndpointConfigSchema).default([]),
    pairingBaseUrls: z.array(z.url()).default([]),
    local: MutableLocalRelayConfigSchema.default({
      enabled: false,
      listen: "0.0.0.0:6769",
    }),
  })
  .passthrough();
