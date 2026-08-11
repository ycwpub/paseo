export class WorkflowAgentLifecycleScope<Resource> {
  private readonly resources = new Map<string, Promise<Resource>>();
  private readonly executionTails = new Map<string, Promise<void>>();
  private readonly invocationCounts = new Map<string, number>();
  private closed = false;

  async withResource<Result>(input: {
    key: string;
    create: () => Promise<Resource>;
    run: (resource: Resource, invocation: { index: number; isFirst: boolean }) => Promise<Result>;
  }): Promise<Result> {
    if (this.closed) {
      throw new Error("Workflow Agent lifecycle scope is already closed");
    }
    const resource = await this.getOrCreate(input.key, input.create);
    return this.runExclusive(input.key, () => {
      const index = this.invocationCounts.get(input.key) ?? 0;
      this.invocationCounts.set(input.key, index + 1);
      return input.run(resource, { index, isFirst: index === 0 });
    });
  }

  async close(onClose: (resource: Resource) => Promise<void>): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await Promise.allSettled(this.executionTails.values());
    const resources = await Promise.allSettled(this.resources.values());
    await Promise.all(
      resources.flatMap((result) => (result.status === "fulfilled" ? [onClose(result.value)] : [])),
    );
    this.resources.clear();
    this.executionTails.clear();
    this.invocationCounts.clear();
  }

  private async getOrCreate(key: string, create: () => Promise<Resource>): Promise<Resource> {
    const existing = this.resources.get(key);
    if (existing) {
      return existing;
    }
    const pending = create().catch((error) => {
      this.resources.delete(key);
      throw error;
    });
    this.resources.set(key, pending);
    return pending;
  }

  private async runExclusive<Result>(key: string, run: () => Promise<Result>): Promise<Result> {
    const previous = this.executionTails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.executionTails.set(key, current);
    await previous;
    try {
      return await run();
    } finally {
      release();
      if (this.executionTails.get(key) === current) {
        this.executionTails.delete(key);
      }
    }
  }
}
