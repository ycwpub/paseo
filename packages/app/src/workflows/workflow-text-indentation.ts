export const WORKFLOW_TEXT_TAB_SIZE = 4;

const INDENT = " ".repeat(WORKFLOW_TEXT_TAB_SIZE);

export interface WorkflowTextIndentationEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

interface TextRemoval {
  start: number;
  length: number;
}

function selectedLineStarts(value: string, selectionStart: number, selectionEnd: number): number[] {
  const firstLineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const effectiveEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const starts = [firstLineStart];
  let newline = value.indexOf("\n", firstLineStart);
  while (newline !== -1 && newline < effectiveEnd) {
    starts.push(newline + 1);
    newline = value.indexOf("\n", newline + 1);
  }
  return starts;
}

function mapPositionAfterRemovals(position: number, removals: TextRemoval[]): number {
  let removedBefore = 0;
  for (const removal of removals) {
    if (position <= removal.start) {
      break;
    }
    if (position <= removal.start + removal.length) {
      return removal.start - removedBefore;
    }
    removedBefore += removal.length;
  }
  return position - removedBefore;
}

function indentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): WorkflowTextIndentationEdit {
  if (selectionStart === selectionEnd) {
    return {
      value: `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`,
      selectionStart: selectionStart + INDENT.length,
      selectionEnd: selectionEnd + INDENT.length,
    };
  }

  const lineStarts = selectedLineStarts(value, selectionStart, selectionEnd);
  let nextValue = value;
  for (const lineStart of lineStarts.toReversed()) {
    nextValue = `${nextValue.slice(0, lineStart)}${INDENT}${nextValue.slice(lineStart)}`;
  }
  return {
    value: nextValue,
    selectionStart: selectionStart + INDENT.length,
    selectionEnd: selectionEnd + lineStarts.length * INDENT.length,
  };
}

function outdentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): WorkflowTextIndentationEdit {
  const removals = selectedLineStarts(value, selectionStart, selectionEnd).flatMap((lineStart) => {
    if (value[lineStart] === "\t") {
      return [{ start: lineStart, length: 1 }];
    }
    const leadingSpaces = value
      .slice(lineStart, lineStart + INDENT.length)
      .match(/^ +/)?.[0].length;
    if (leadingSpaces) {
      return [{ start: lineStart, length: leadingSpaces }];
    }
    return [];
  });
  if (removals.length === 0) {
    return { value, selectionStart, selectionEnd };
  }

  let nextValue = value;
  for (const removal of removals.toReversed()) {
    nextValue = `${nextValue.slice(0, removal.start)}${nextValue.slice(
      removal.start + removal.length,
    )}`;
  }
  return {
    value: nextValue,
    selectionStart: mapPositionAfterRemovals(selectionStart, removals),
    selectionEnd: mapPositionAfterRemovals(selectionEnd, removals),
  };
}

export function applyWorkflowTextIndentation({
  value,
  selectionStart,
  selectionEnd,
  outdent = false,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  outdent?: boolean;
}): WorkflowTextIndentationEdit {
  const boundedStart = Math.max(0, Math.min(selectionStart, value.length));
  const boundedEnd = Math.max(boundedStart, Math.min(selectionEnd, value.length));
  return outdent
    ? outdentSelection(value, boundedStart, boundedEnd)
    : indentSelection(value, boundedStart, boundedEnd);
}
