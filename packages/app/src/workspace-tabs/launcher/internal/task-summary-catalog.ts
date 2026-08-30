import {
  getBuiltInLaunchOrder as getBaseBuiltInLaunchOrder,
  type BuiltInLaunchItemId as BaseBuiltInLaunchItemId,
} from "./catalog";

export type BuiltInLaunchItemId = BaseBuiltInLaunchItemId | "taskSummary";

export function getBuiltInLaunchOrder(
  purpose: "primary" | "supporting"
): readonly BuiltInLaunchItemId[] {
  const order = getBaseBuiltInLaunchOrder(purpose);
  const filesIndex = order.indexOf("files");
  if (filesIndex < 0) {
    return [...order, "taskSummary"];
  }
  return [
    ...order.slice(0, filesIndex + 1),
    "taskSummary",
    ...order.slice(filesIndex + 1),
  ];
}
