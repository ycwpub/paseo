function interpolationPlaceholders(value: string): string[] {
  return [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => match[1] ?? "").sort();
}

function hasMatchingPlaceholders(reference: string, candidate: string): boolean {
  const expected = interpolationPlaceholders(reference);
  const actual = interpolationPlaceholders(candidate);
  return (
    expected.length === actual.length && expected.every((value, index) => value === actual[index])
  );
}

export function completeTranslationResource<T>(reference: T, overrides: unknown): T {
  if (typeof reference === "string") {
    return (
      typeof overrides === "string" && hasMatchingPlaceholders(reference, overrides)
        ? overrides
        : reference
    ) as T;
  }
  if (Array.isArray(reference)) {
    const candidates = Array.isArray(overrides) ? overrides : [];
    return reference.map((value, index) =>
      completeTranslationResource(value, candidates[index]),
    ) as T;
  }
  if (reference && typeof reference === "object") {
    const candidates =
      overrides && typeof overrides === "object" && !Array.isArray(overrides)
        ? (overrides as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(reference).map(([key, value]) => [
        key,
        completeTranslationResource(value, candidates[key]),
      ]),
    ) as T;
  }
  return reference;
}

export type MergedTranslationResources<TBase, TAdditions> = TBase extends readonly unknown[]
  ? TAdditions
  : TBase extends object
    ? TAdditions extends object
      ? {
          [K in keyof TBase | keyof TAdditions]: K extends keyof TAdditions
            ? K extends keyof TBase
              ? MergedTranslationResources<TBase[K], TAdditions[K]>
              : TAdditions[K]
            : K extends keyof TBase
              ? TBase[K]
              : never;
        }
      : TAdditions
    : TAdditions;

export function mergeTranslationResources<TBase, TAdditions>(
  base: TBase,
  additions: TAdditions,
): MergedTranslationResources<TBase, TAdditions> {
  if (
    !base ||
    typeof base !== "object" ||
    Array.isArray(base) ||
    !additions ||
    typeof additions !== "object" ||
    Array.isArray(additions)
  ) {
    return additions as MergedTranslationResources<TBase, TAdditions>;
  }

  const baseRecord = base as Record<string, unknown>;
  const additionsRecord = additions as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...baseRecord };
  for (const [key, value] of Object.entries(additionsRecord)) {
    const current = baseRecord[key];
    merged[key] =
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
        ? mergeTranslationResources(current, value)
        : value;
  }
  return merged as MergedTranslationResources<TBase, TAdditions>;
}
