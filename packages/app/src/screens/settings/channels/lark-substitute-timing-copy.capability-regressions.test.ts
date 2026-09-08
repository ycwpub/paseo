import { describe, expect, test } from "vitest";
import {
  LARK_SUBSTITUTE_REALTIME_DELAY_HINT,
  LARK_SUBSTITUTE_REALTIME_DELAY_LABEL,
  LARK_SUBSTITUTE_SCAN_EXCLUDE_RECENT_HINT,
} from "./lark-substitute-timing-copy";
import { createSubstituteModeFormState } from "./lark-substitute-mode-form-model";

describe("Lark substitute timing copy", () => {
  test("distinguishes realtime debounce from scan maturity windows", () => {
    expect(LARK_SUBSTITUTE_REALTIME_DELAY_LABEL).toBe("实时事件触发的消息，命中后合并等待（秒）");
    expect(LARK_SUBSTITUTE_REALTIME_DELAY_HINT).toContain("定时扫描不使用该等待时间");
    expect(LARK_SUBSTITUTE_SCAN_EXCLUDE_RECENT_HINT).toContain("扫描触发后立即处理");
  });

  test("uses 10-minute realtime debounce and 30/60/10 scan defaults", () => {
    const form = createSubstituteModeFormState(null, []);

    expect(form.delaySeconds).toBe("600");
    expect(form.groupScanIntervalMinutes).toBe("30");
    expect(form.groupScanLookbackMinutes).toBe("60");
    expect(form.groupScanExcludeRecentMinutes).toBe("10");
    expect(form.privateScanIntervalMinutes).toBe("30");
    expect(form.privateScanLookbackMinutes).toBe("60");
    expect(form.privateScanExcludeRecentMinutes).toBe("10");
  });
});
