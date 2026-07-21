import type { RuntimeDiscovery } from "../core/types.js";
import type { QuotaSnapshot } from "./types.js";

/**
 * V0 不发送模型请求，也不猜测订阅剩余额度。
 * 后续 Adapter 可用官方 API、响应头、CLI 状态或本地账本替换该结果。
 */
export function initialQuotaSnapshot(runtime: RuntimeDiscovery): QuotaSnapshot {
  return {
    runtime: runtime.id,
    status: "unknown",
    confidence: "unknown",
    source: "local-ledger",
    checkedAt: new Date().toISOString(),
    note: runtime.installed ? "尚未执行额度探测" : "Runtime 未安装，无法判断额度",
  };
}
