import type { StreamViewportHandle } from "./strategy";

export type ExtendedStreamViewportHandle = Omit<
  StreamViewportHandle,
  "prepareForViewportChange"
> & {
  scrollToOldest?: () => void;
  prepareForViewportChange: (anchorId?: string) => void;
};

export function prepareStreamViewportChange(
  handle: StreamViewportHandle | null,
  anchorId?: string,
): void {
  (handle as ExtendedStreamViewportHandle | null)?.prepareForViewportChange(anchorId);
}

export function scrollStreamViewportToOldest(handle: StreamViewportHandle | null): void {
  (handle as ExtendedStreamViewportHandle | null)?.scrollToOldest?.();
}
