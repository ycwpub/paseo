/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowScript } from "@getpaseo/protocol/workflow/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === "workflows.nodes.schemaCompatibility.title") {
        return "Schema compatibility warnings";
      }
      if (key === "workflows.nodes.schemaCompatibility.requiredNotGuaranteed") {
        return `${values?.source} -> ${values?.target}: missing ${values?.path}`;
      }
      return key;
    },
  }),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({
    title,
    description,
    testID,
  }: {
    title?: string;
    description?: React.ReactNode;
    testID?: string;
  }) => (
    <div data-testid={testID}>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  ),
}));

import { WorkflowSchemaCompatibilityAlert } from "./workflow-schema-compatibility-alert";

describe("WorkflowSchemaCompatibilityAlert", () => {
  afterEach(cleanup);

  it("shows a design-time warning for an incompatible downstream schema", () => {
    render(<WorkflowSchemaCompatibilityAlert script={createIncompatibleScript()} />);

    expect(screen.getByTestId("workflow-schema-compatibility-warning").textContent).toContain(
      "Schema compatibility warnings",
    );
    expect(screen.getByTestId("workflow-schema-compatibility-warning").textContent).toContain(
      "produce -> consume: missing answer",
    );
  });

  it("stays hidden when connected schemas are compatible", () => {
    const script = createIncompatibleScript();
    const producer = script.steps[0];
    if (!producer || producer.type !== "bash") {
      throw new Error("Expected Bash producer");
    }
    producer.outputSchema = objectSchema({ answer: { type: "string" } }, ["answer"]);

    const { container } = render(<WorkflowSchemaCompatibilityAlert script={script} />);

    expect(container.textContent).toBe("");
  });
});

function createIncompatibleScript(): WorkflowScript {
  return {
    apiVersion: "paseo.sh/workflow/v1",
    kind: "Workflow",
    version: 1,
    name: "Compatibility warning",
    steps: [
      {
        id: "produce",
        type: "bash",
        initialCommand: "true",
        outputSchema: objectSchema({}, []),
      },
      {
        id: "consume",
        type: "bash",
        initialCommand: "true",
        inputSchema: objectSchema({ answer: { type: "string" } }, ["answer"]),
      },
    ],
  };
}

function objectSchema(
  properties: Record<string, Record<string, unknown>>,
  required: string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
  };
}
