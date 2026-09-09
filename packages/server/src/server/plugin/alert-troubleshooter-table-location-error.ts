import { describeLarkApiError } from "../channels/lark/lark-api-request.js";

const STALE_TABLE_LOCATION_CODES = new Set([1002, 1254004, 1254041]);
const STALE_TABLE_LOCATION_MESSAGE =
  /\b(?:1002|1254004|1254041|note has been deleted|WrongTableId|TableIdNotFound)\b/iu;

export function isStaleAlertTroubleshooterTableLocation(error: unknown): boolean {
  const described = describeLarkApiError(error);
  return (
    (described.code !== null && STALE_TABLE_LOCATION_CODES.has(described.code)) ||
    STALE_TABLE_LOCATION_MESSAGE.test(described.message)
  );
}
