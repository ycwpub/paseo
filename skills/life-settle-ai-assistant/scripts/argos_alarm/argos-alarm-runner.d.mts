export const DEFAULT_ARGOS_CHAT_ID: string;
export const DEFAULT_ARGOS_SCAN_DIR_URL: string;
export const DEFAULT_ARGOS_TROUBLESHOOTING_SOP_DOC: string;
export const ARGOS_DAILY_BASE_BIZ_SUFFIX: string;
export const ARGOS_DAILY_BASE_FIELD_NAMES: string[];
export const ARGOS_STATUS_OPTIONS: string[];
export const ARGOS_ATTRIBUTION_RESULTS: string[];

export interface ArgosGroupsScanPlan {
  kind: "argos_alarm_groups_scan_and_troubleshoot_plan";
  success: boolean;
  dryRun: boolean;
  scanWindow: { start: string; end: string };
  dateKeys: string[];
  input: Record<string, unknown>;
  scanTasks: Array<Record<string, unknown>>;
}

export type ArgosRunnerResult = Record<string, unknown>;

export function buildArgosGroupsScanPlan(input?: Record<string, unknown>): ArgosGroupsScanPlan;

export function createArgosAlarmRunner(options?: {
  execFile?: (
    command: string,
    args: string[],
    options?: Record<string, unknown>,
  ) => Promise<{ stdout?: string; stderr?: string }>;
  env?: NodeJS.ProcessEnv;
  sleep?: (ms: number) => Promise<void>;
  templateUrl?: string;
}): {
  scanChatToBase(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  prepareAutoTroubleshoot(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  splitWorkItems(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  resumeAutoOrchestration(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  closeReadyWorkItems(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  recoverProcessingRecords(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  syncDailyBaseTemplateOrder(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  doctorDailyBase(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  inspectResult(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  prepareSingleTroubleshootData(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  publishTroubleshootingDoc(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  publishSopDoc(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  normalizeModelResultJson(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  normalizeResultDocLinks(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  closeWorkItem(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  validateResultDir(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  buildAutoTroubleshootDrainSummary(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  renderRunReport(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
  runGroupsScanAndPrepare(input?: Record<string, unknown>): Promise<ArgosRunnerResult>;
};

export function runArgosAlarmRunnerCli(
  args?: string[],
  options?: { runner?: Record<string, unknown> },
): Promise<ArgosRunnerResult>;
