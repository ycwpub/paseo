#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import ts from "typescript";
import { UPSTREAM_BASELINE_SHA } from "./upstream-file-budget.mjs";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseArguments(argv) {
  const options = {
    apply: false,
    addOnly: false,
    allowDeletions: false,
    pruneExisting: false,
    upstream: UPSTREAM_BASELINE_SHA,
    files: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--apply":
        options.apply = true;
        break;
      case "--add-only":
        options.addOnly = true;
        break;
      case "--allow-deletions":
        options.allowDeletions = true;
        break;
      case "--prune-existing":
        options.pruneExisting = true;
        break;
      case "--upstream":
        options.upstream = argv[++index];
        if (!options.upstream) {
          throw new Error("--upstream requires a value");
        }
        break;
      default:
        options.files.push(argument);
        break;
    }
  }

  return options;
}

function listCapabilityRegressionTests() {
  return git(["ls-files", "-co", "--exclude-standard", "-z"])
    .split("\0")
    .filter(
      (path) =>
        path.includes(".capability-regressions.") &&
        /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u.test(path) &&
        existsSync(path),
    );
}

function listModifiedTests(upstream) {
  const upstreamPaths = new Set(
    git(["ls-tree", "-r", "--name-only", "-z", upstream]).split("\0").filter(Boolean),
  );
  return git(["diff", "--name-only", "-z", upstream])
    .split("\0")
    .filter(
      (path) =>
        upstreamPaths.has(path) &&
        /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u.test(path) &&
        existsSync(path),
    );
}

function parseNumstat(upstream, path) {
  const [additions, deletions] = git(["diff", "--numstat", upstream, "--", path])
    .trim()
    .split(/\s+/u);
  return {
    additions: Number.parseInt(additions, 10),
    deletions: Number.parseInt(deletions, 10),
  };
}

function parseChangedCurrentLines(upstream, path) {
  const output = git(["diff", "--unified=0", upstream, "--", path]);
  const changedLines = new Set();
  let currentLine = null;
  let hasDeletedOnlyHunk = false;

  for (const line of output.split("\n")) {
    const header = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u);
    if (header) {
      currentLine = Number.parseInt(header[1], 10);
      const currentCount = header[2] === undefined ? 1 : Number.parseInt(header[2], 10);
      if (currentCount === 0) {
        hasDeletedOnlyHunk = true;
      }
      continue;
    }
    if (currentLine === null || line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("+")) {
      changedLines.add(currentLine);
      currentLine += 1;
      continue;
    }
    if (!line.startsWith("-")) {
      currentLine += 1;
    }
  }

  return { changedLines, hasDeletedOnlyHunk };
}

function getRootCallName(expression) {
  let current = expression;
  while (
    ts.isCallExpression(current) ||
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : null;
}

function getTestCallKind(statement) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
    return null;
  }
  const rootName = getRootCallName(statement.expression);
  if (rootName === "describe") {
    return "suite";
  }
  if (rootName === "test" || rootName === "it") {
    return "test";
  }
  return null;
}

function nodeTouchesChangedLine(sourceFile, node, changedLines) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  for (let line = start; line <= end; line += 1) {
    if (changedLines.has(line)) {
      return true;
    }
  }
  return false;
}

function findSuiteCallback(call) {
  const index = call.arguments.findIndex(
    (argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
  );
  if (index < 0) {
    return null;
  }
  const callback = call.arguments[index];
  if (
    (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
    !ts.isBlock(callback.body)
  ) {
    return null;
  }
  return { callback, index };
}

function updateSuiteStatement(statement, sourceFile, changedLines) {
  const call = statement.expression;
  const callbackEntry = findSuiteCallback(call);
  if (!callbackEntry) {
    return nodeTouchesChangedLine(sourceFile, statement, changedLines) ? statement : null;
  }

  const selectedStatements = [];
  let selectedTestCount = 0;
  for (const child of callbackEntry.callback.body.statements) {
    const kind = getTestCallKind(child);
    if (kind === "test") {
      if (nodeTouchesChangedLine(sourceFile, child, changedLines)) {
        selectedStatements.push(child);
        selectedTestCount += 1;
      }
      continue;
    }
    if (kind === "suite") {
      const selectedSuite = updateSuiteStatement(child, sourceFile, changedLines);
      if (selectedSuite) {
        selectedStatements.push(selectedSuite);
        selectedTestCount += 1;
      }
      continue;
    }
    selectedStatements.push(child);
  }

  if (selectedTestCount === 0) {
    return null;
  }

  const body = ts.factory.updateBlock(callbackEntry.callback.body, selectedStatements);
  const callback = ts.isArrowFunction(callbackEntry.callback)
    ? ts.factory.updateArrowFunction(
        callbackEntry.callback,
        callbackEntry.callback.modifiers,
        callbackEntry.callback.typeParameters,
        callbackEntry.callback.parameters,
        callbackEntry.callback.type,
        callbackEntry.callback.equalsGreaterThanToken,
        body,
      )
    : ts.factory.updateFunctionExpression(
        callbackEntry.callback,
        callbackEntry.callback.modifiers,
        callbackEntry.callback.asteriskToken,
        callbackEntry.callback.name,
        callbackEntry.callback.typeParameters,
        callbackEntry.callback.parameters,
        callbackEntry.callback.type,
        body,
      );
  const argumentsList = [...call.arguments];
  argumentsList[callbackEntry.index] = callback;
  const updatedCall = ts.factory.updateCallExpression(
    call,
    call.expression,
    call.typeArguments,
    argumentsList,
  );
  return ts.factory.updateExpressionStatement(statement, updatedCall);
}

function collectBindingIdentifiers(name, identifiers) {
  if (ts.isIdentifier(name)) {
    identifiers.push(name);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingIdentifiers(element.name, identifiers);
    }
  }
}

function isNonReferenceIdentifier(node) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  const namedNonReferences = [
    ts.isPropertyAccessExpression,
    ts.isPropertyAssignment,
    ts.isMethodDeclaration,
    ts.isPropertyDeclaration,
    ts.isPropertySignature,
    ts.isMethodSignature,
    ts.isGetAccessorDeclaration,
    ts.isSetAccessorDeclaration,
    ts.isEnumMember,
    ts.isJsxAttribute,
  ];
  if (namedNonReferences.some((predicate) => predicate(parent) && parent.name === node)) {
    return true;
  }
  if (
    (ts.isLabeledStatement(parent) && parent.label === node) ||
    (ts.isBreakOrContinueStatement(parent) && parent.label === node) ||
    ts.isImportSpecifier(parent)
  ) {
    return true;
  }
  if (ts.isExportSpecifier(parent) && parent.propertyName === node) {
    return true;
  }
  return false;
}

function collectDeclaredIdentifierPositions(sourceFile) {
  const positions = new Set();
  const visit = (node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isTypeParameterDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      positions.add(node.name.getStart(sourceFile));
    } else if (ts.isVariableDeclaration(node) || ts.isBindingElement(node)) {
      const identifiers = [];
      collectBindingIdentifiers(node.name, identifiers);
      for (const identifier of identifiers) {
        positions.add(identifier.getStart(sourceFile));
      }
    } else if (ts.isImportClause(node) && node.name) {
      positions.add(node.name.getStart(sourceFile));
    } else if (ts.isNamespaceImport(node)) {
      positions.add(node.name.getStart(sourceFile));
    } else if (ts.isImportSpecifier(node)) {
      positions.add(node.name.getStart(sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return positions;
}

function countIdentifierReferences(sourceFile) {
  const declaredPositions = collectDeclaredIdentifierPositions(sourceFile);
  const references = new Map();
  const visit = (node) => {
    if (
      ts.isIdentifier(node) &&
      !declaredPositions.has(node.getStart(sourceFile)) &&
      !isNonReferenceIdentifier(node)
    ) {
      const positions = references.get(node.text) ?? [];
      positions.push(node.getStart(sourceFile));
      references.set(node.text, positions);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function sourceContainsJsx(sourceFile) {
  let found = false;
  const visit = (node) => {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function hasReference(references, identifier) {
  return (references.get(identifier.text)?.length ?? 0) > 0;
}

function hasReferenceOutsideNode(references, identifier, excludedNode) {
  const start = excludedNode.getStart();
  const end = excludedNode.getEnd();
  return (references.get(identifier.text) ?? []).some(
    (position) => position < start || position >= end,
  );
}

function updateImportStatement(statement, references) {
  const clause = statement.importClause;
  if (!clause) {
    return statement;
  }

  const defaultImport = clause.name && hasReference(references, clause.name) ? clause.name : undefined;
  let namedBindings;
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    namedBindings = hasReference(references, clause.namedBindings.name)
      ? clause.namedBindings
      : undefined;
  } else if (clause.namedBindings) {
    const elements = clause.namedBindings.elements.filter((element) =>
      hasReference(references, element.name),
    );
    if (elements.length > 0) {
      namedBindings = ts.factory.updateNamedImports(clause.namedBindings, elements);
    }
  }

  if (!defaultImport && !namedBindings) {
    return null;
  }
  const updatedClause = ts.factory.updateImportClause(
    clause,
    clause.isTypeOnly,
    defaultImport,
    namedBindings,
  );
  return ts.factory.updateImportDeclaration(
    statement,
    statement.modifiers,
    updatedClause,
    statement.moduleSpecifier,
    statement.attributes,
  );
}

function updateVariableStatement(statement, references) {
  const declarations = statement.declarationList.declarations.filter((declaration) => {
    const identifiers = [];
    collectBindingIdentifiers(declaration.name, identifiers);
    return identifiers.some((identifier) =>
      hasReferenceOutsideNode(references, identifier, declaration),
    );
  });
  if (declarations.length === 0) {
    return null;
  }
  const declarationList = ts.factory.updateVariableDeclarationList(
    statement.declarationList,
    declarations,
  );
  return ts.factory.updateVariableStatement(statement, statement.modifiers, declarationList);
}

function updateDeclarationStatement(statement, references) {
  if (ts.isImportDeclaration(statement)) {
    return updateImportStatement(statement, references);
  }
  if (ts.isVariableStatement(statement)) {
    return updateVariableStatement(statement, references);
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)) &&
    statement.name &&
    ts.isIdentifier(statement.name) &&
    !hasReferenceOutsideNode(references, statement.name, statement)
  ) {
    return null;
  }
  return statement;
}

function pruneUnusedTopLevelDeclarations(source, path, scriptKind) {
  let current = source;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const sourceFile = ts.createSourceFile(
      path,
      current,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );
    const references = countIdentifierReferences(sourceFile);
    if (scriptKind === ts.ScriptKind.TSX && sourceContainsJsx(sourceFile)) {
      references.set("React", [-1, ...(references.get("React") ?? [])]);
    }
    const result = ts.transform(sourceFile, [
      (context) => {
        const visit = (node) => {
          if (ts.isSourceFile(node) || ts.isBlock(node)) {
            const statements = node.statements
              .map((statement) => {
                const retained = updateDeclarationStatement(statement, references);
                return retained ? ts.visitEachChild(retained, visit, context) : null;
              })
              .filter((statement) => statement !== null);
            return ts.isSourceFile(node)
              ? ts.factory.updateSourceFile(node, statements)
              : ts.factory.updateBlock(node, statements);
          }
          return ts.visitEachChild(node, visit, context);
        };
        return visit;
      },
    ]);
    const updated = result.transformed[0];
    const next = `${printer.printFile(updated).trimEnd()}\n`;
    result.dispose();
    if (next === current) {
      return next;
    }
    current = next;
  }

  return current;
}

function extractRegressionSource(path, changedLines) {
  const source = readFileSync(path, "utf8");
  const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind);
  const selectedTestStatements = new Map();
  let selectedTestCount = 0;

  for (const statement of sourceFile.statements) {
    const kind = getTestCallKind(statement);
    if (kind === "test") {
      if (nodeTouchesChangedLine(sourceFile, statement, changedLines)) {
        selectedTestStatements.set(statement, statement);
        selectedTestCount += 1;
      }
      continue;
    }
    if (kind === "suite") {
      const selectedSuite = updateSuiteStatement(statement, sourceFile, changedLines);
      if (selectedSuite) {
        selectedTestStatements.set(statement, selectedSuite);
        selectedTestCount += 1;
      }
    }
  }

  if (selectedTestCount === 0) {
    return null;
  }

  const statements = sourceFile.statements.flatMap((statement) => {
    const kind = getTestCallKind(statement);
    if (!kind) {
      return [statement];
    }
    const selected = selectedTestStatements.get(statement);
    return selected ? [selected] : [];
  });
  const extracted = ts.factory.updateSourceFile(sourceFile, statements);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return pruneUnusedTopLevelDeclarations(
    `${printer.printFile(extracted).trimEnd()}\n`,
    path,
    scriptKind,
  );
}

function getRegressionPath(path) {
  const extension = extname(path);
  const stem = path.slice(0, -extension.length);
  let marker = "";
  if (stem.endsWith(".test")) {
    marker = ".test";
  } else if (stem.endsWith(".spec")) {
    marker = ".spec";
  }
  if (!marker) {
    throw new Error(`Unsupported test filename: ${path}`);
  }
  return `${stem.slice(0, -marker.length)}.capability-regressions${marker}${extension}`;
}

function restoreUpstreamFile(upstream, path) {
  writeFileSync(path, git(["show", `${upstream}:${path}`]));
}

function pruneExistingTests(options) {
  const files = options.files.length > 0 ? options.files : listCapabilityRegressionTests();
  let changed = 0;
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const pruned = pruneUnusedTopLevelDeclarations(source, path, scriptKind);
    if (pruned !== source) {
      changed += 1;
      if (options.apply) {
        writeFileSync(path, pruned);
      }
      console.log(`${options.apply ? "pruned" : "candidate"}: ${path}`);
    }
  }
  console.log(`${options.apply ? "pruned" : "candidates"}: ${changed}/${files.length}`);
}

function migrateModifiedTests(options) {
  const files = options.files.length > 0 ? options.files : listModifiedTests(options.upstream);
  const results = [];

  for (const path of files) {
    const stat = parseNumstat(options.upstream, path);
    if (options.addOnly && stat.deletions > 0) {
      results.push({ path, status: "skipped", reason: "contains deletions" });
      continue;
    }
    const { changedLines, hasDeletedOnlyHunk } = parseChangedCurrentLines(options.upstream, path);
    if (hasDeletedOnlyHunk && !options.allowDeletions) {
      results.push({ path, status: "skipped", reason: "contains a deletion-only hunk" });
      continue;
    }
    const source = extractRegressionSource(path, changedLines);
    if (!source) {
      results.push({ path, status: "skipped", reason: "no changed test cases found" });
      continue;
    }
    const regressionPath = getRegressionPath(path);
    if (existsSync(regressionPath)) {
      results.push({ path, status: "skipped", reason: `${regressionPath} already exists` });
      continue;
    }
    if (options.apply) {
      writeFileSync(regressionPath, source);
      restoreUpstreamFile(options.upstream, path);
    }
    results.push({ path, regressionPath, status: options.apply ? "migrated" : "candidate" });
  }

  for (const result of results) {
    const suffix = result.regressionPath ? ` -> ${result.regressionPath}` : ` (${result.reason})`;
    console.log(`${result.status}: ${result.path}${suffix}`);
  }
  const migrated = results.filter((result) =>
    options.apply ? result.status === "migrated" : result.status === "candidate",
  ).length;
  console.log(`${options.apply ? "migrated" : "candidates"}: ${migrated}/${results.length}`);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.pruneExisting) {
    pruneExistingTests(options);
    return;
  }
  migrateModifiedTests(options);
}

main();
