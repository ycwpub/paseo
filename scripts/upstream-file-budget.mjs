export const UPSTREAM_BASELINE_SHA = "463415ae846cbcfef0df691e413a1a73a9213757";
export const LEGACY_CONFLICT_FILE_CEILING = 264;

export function parseNameStatus(output) {
  const fields = output.split("\0");
  const changes = [];

  for (let index = 0; index < fields.length; ) {
    const status = fields[index];
    index += 1;
    if (!status) continue;

    if (status.startsWith("R") || status.startsWith("C")) {
      const from = fields[index];
      const to = fields[index + 1];
      index += 2;
      if (from && to) changes.push({ status, paths: [from, to] });
      continue;
    }

    const path = fields[index];
    index += 1;
    if (path) changes.push({ status, paths: [path] });
  }

  return changes;
}

export function collectUpstreamOwnedChanges(changes, upstreamPaths) {
  const paths = new Set();
  for (const change of changes) {
    for (const path of change.paths) {
      if (upstreamPaths.has(path)) paths.add(path);
    }
  }
  return [...paths].sort();
}

export function excludeEquivalentRestoredDeletions(changes, isEquivalentRestoration) {
  return changes.filter((change) => {
    if (change.status !== "D" || change.paths.length !== 1) return true;
    return !isEquivalentRestoration(change.paths[0]);
  });
}

export function parseFileBudgetArguments(argv) {
  const options = {
    upstream: UPSTREAM_BASELINE_SHA,
    maxModified: 100,
    legacyCeiling: LEGACY_CONFLICT_FILE_CEILING,
    cached: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--upstream":
        options.upstream = requireValue(argv, ++index, argument);
        break;
      case "--max-modified":
        options.maxModified = parseMaximum(requireValue(argv, ++index, argument));
        break;
      case "--legacy-ceiling":
        options.legacyCeiling = parseMaximum(requireValue(argv, ++index, argument));
        break;
      case "--cached":
        options.cached = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function requireValue(argv, index, argument) {
  const value = argv[index];
  if (!value) throw new Error(`${argument} requires a value`);
  return value;
}

function parseMaximum(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --max-modified value: ${value}`);
  }
  return parsed;
}
