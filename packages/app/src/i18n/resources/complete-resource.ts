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
