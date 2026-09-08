export const LARK_SUBSTITUTE_REALTIME_DELAY_LABEL = "实时事件触发的消息，命中后合并等待（秒）";

export const LARK_SUBSTITUTE_REALTIME_DELAY_HINT =
  "仅用于实时监听触发：等待期间合并连续消息并以最后一条为准；定时扫描不使用该等待时间。";

export const LARK_SUBSTITUTE_SCAN_EXCLUDE_RECENT_HINT =
  "扫描只处理早于该时间的消息；扫描触发后立即处理，不再应用实时事件的合并等待。";
