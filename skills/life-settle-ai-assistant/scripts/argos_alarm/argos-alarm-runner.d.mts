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

export function buildArgosGroupsScanPlan(input?: Record<string, unknown>): ArgosGroupsScanPlan;

export function createArgosAlarmRunner(options?: {
  execFile?: (command: string, args: string[], options?: Record<string, unknown>) => Promise<{ stdout?: string; stderr?: string }>;
  env?: NodeJS.ProcessEnv;
  sleep?: (ms: number) => Promise<void>;
  templateUrl?: string;
}): {
  scanChatToBase(input?: Record<string, unknown>): Promise<Record<string, any>>;
  prepareAutoTroubleshoot(input?: Record<string, unknown>): Promise<Record<string, any>>;
  splitWorkItems(input?: Record<string, unknown>): Promise<Record<string, any>>;
  resumeAutoOrchestration(input?: Record<string, unknown>): Promise<Record<string, any>>;
  closeReadyWorkItems(input?: Record<string, unknown>): Promise<Record<string, any>>;
  recoverProcessingRecords(input?: Record<string, unknown>): Promise<Record<string, any>>;
  syncDailyBaseTemplateOrder(input?: Record<string, unknown>): Promise<Record<string, any>>;
  doctorDailyBase(input?: Record<string, unknown>): Promise<Record<string, any>>;
  inspectResult(input?: Record<string, unknown>): Promise<Record<string, any>>;
  prepareSingleTroubleshootData(input?: Record<string, unknown>): Promise<Record<string, any>>;
  publishTroubleshootingDoc(input?: Record<string, unknown>): Promise<Record<string, any>>;
  publishSopDoc(input?: Record<string, unknown>): Promise<Record<string, any>>;
  normalizeModelResultJson(input?: Record<string, unknown>): Promise<Record<string, any>>;
  normalizeResultDocLinks(input?: Record<string, unknown>): Promise<Record<string, any>>;
  closeWorkItem(input?: Record<string, unknown>): Promise<Record<string, any>>;
  validateResultDir(input?: Record<string, unknown>): Promise<Record<string, any>>;
  buildAutoTroubleshootDrainSummary(input?: Record<string, unknown>): Promise<Record<string, any>>;
  renderRunReport(input?: Record<string, unknown>): Promise<Record<string, any>>;
  runGroupsScanAndPrepare(input?: Record<string, unknown>): Promise<Record<string, any>>;
};

export function runArgosAlarmRunnerCli(
  args?: string[],
  options?: { runner?: Record<string, any> }
): Promise<Record<string, any>>;
