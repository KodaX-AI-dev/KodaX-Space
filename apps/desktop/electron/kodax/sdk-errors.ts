// SDK error wrapping — OC-11
//
// KodaX SDK 出错时（rate limit / 401 / DNS 失败 etc.）我们之前把 `err.message` 原样
// 塞进 session_error 事件，renderer 显示 "HTTPError: 429 Too Many Requests" 之类
// 充满 stack 元素的字符串 —— 用户看不懂、不知道做啥。
//
// 本模块把 SDK 抛的各种异常映射到 7 个**用户行动驱动**的类别，并配相应的简洁文案 +
// 建议动作（让 renderer 显示 "Retry" / "Open Settings" / "Check Network" 按钮）。
//
// 设计原则：
//   1. 文案以"用户该做什么"为中心，不暴露 HTTP 状态码 / API 路径 / SDK 内部细节
//   2. 把 retriable 标出来：用户知道"再点 Send"和"先去改配置"的区别
//   3. 失败时保留 raw message 在 debug 字段，main 日志能查；renderer 不显示
//
// 启发式：检测顺序按"误判代价从高到低"——先匹 explicit code/status，再 fallback 字符串。

export type SdkErrorCategory =
  | 'rate_limit'        // 429 / "rate limit" / "throttled"
  | 'auth'              // 401 / "unauthorized" / "invalid api key"
  | 'quota'             // 402 / "quota" / "insufficient credit"
  | 'network'           // ENOTFOUND / ECONNREFUSED / "fetch failed" / "timeout"
  | 'model_unavailable' // 404 model / "model not found"
  | 'bad_request'       // 400 / "invalid request"
  | 'server_error'      // 500-599 / "internal server error"
  | 'cancelled'         // AbortError
  | 'unknown';          // 未匹配

export type SdkErrorAction =
  | 'retry'                 // 重试可能就好（rate limit / 短暂网络 / 5xx）
  | 'open_provider_settings' // 改 key / provider 配置
  | 'check_network'         // 网络问题
  | 'change_model';         // 当前 model 不可用 / 不支持

export interface WrappedSdkError {
  /** 用户可读的简短描述（一句话，<=120 字符）*/
  readonly userMessage: string;
  readonly category: SdkErrorCategory;
  readonly retriable: boolean;
  readonly action?: SdkErrorAction;
  /** OC-23: rate_limit / server_error 时建议等待毫秒数。
   *  上游通过 Retry-After header 给（Anthropic 还有 retry-after-ms 扩展）；
   *  callers 在拿到 SDK error 时用 extractRetryAfter() 算出后传进 wrap。*/
  readonly retryAfterMs?: number;
  /** 原始 err.message —— main 日志保留；renderer 不显示。便于 debug。*/
  readonly debugMessage: string;
}

export interface WrapContext {
  /** Caller 通过 SDK parseRetryAfter 算出来的等待毫秒数（仅 rate_limit / 5xx 有意义）。*/
  readonly retryAfterMs?: number;
}

interface ErrLike {
  readonly message?: string;
  readonly status?: number;
  readonly statusCode?: number;
  readonly code?: string | number;
  readonly cause?: unknown;
  readonly name?: string;
}

function extractStatus(err: ErrLike): number | null {
  if (typeof err.status === 'number') return err.status;
  if (typeof err.statusCode === 'number') return err.statusCode;
  // 部分 SDK 在 message 里嵌 "429 Too Many Requests"
  const m = (err.message ?? '').match(/\b(4\d\d|5\d\d)\b/);
  if (m) return Number(m[1]);
  return null;
}

function typedTransportError(err: unknown): string | undefined {
  const seen = new Set<unknown>();
  while (typeof err === 'object' && err !== null && !seen.has(err)) {
    seen.add(err);
    const candidate = err as ErrLike;
    if (candidate.name === 'AbortError' || candidate.name === 'TimeoutError') return candidate.name;
    err = candidate.cause;
  }
  return undefined;
}

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

export function wrapSdkError(err: unknown, ctx?: WrapContext): WrappedSdkError {
  // Cancelled 路径单独处理 —— 不应当当成错误展示给用户
  const transportError = typedTransportError(err);
  if (transportError === 'AbortError') {
    return {
      userMessage: 'Request cancelled.',
      category: 'cancelled',
      retriable: true,
      debugMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const errObj: ErrLike =
    err instanceof Error
      ? { message: err.message, name: err.name, ...(err as unknown as ErrLike) }
      : typeof err === 'object' && err !== null
        ? (err as ErrLike)
        : { message: String(err) };

  const rawMessage = errObj.message ?? String(err);
  const code = typeof errObj.code === 'string' ? errObj.code : '';
  const status = extractStatus(errObj);

  // --- 网络层 ---
  if (
    transportError === 'TimeoutError' ||
    matchesAny(code, ['enotfound', 'econnrefused', 'econnreset', 'etimedout', 'eai_again']) ||
    matchesAny(rawMessage, ['fetch failed', 'network error', 'getaddrinfo', 'socket hang up', 'request timeout'])
  ) {
    return {
      userMessage: 'Network error reaching provider. Check your connection and try again.',
      category: 'network',
      retriable: true,
      action: 'check_network',
      debugMessage: rawMessage,
    };
  }

  // --- 显式 HTTP 状态 ---
  if (status === 429 || matchesAny(rawMessage, ['rate limit', 'rate-limit', 'too many requests', 'throttl'])) {
    return {
      userMessage: 'Rate limit reached. Wait a moment and try again.',
      category: 'rate_limit',
      retriable: true,
      action: 'retry',
      ...(ctx?.retryAfterMs !== undefined ? { retryAfterMs: ctx.retryAfterMs } : {}),
      debugMessage: rawMessage,
    };
  }

  if (status === 401 || status === 403 ||
      matchesAny(rawMessage, ['unauthorized', 'invalid api key', 'invalid_api_key', 'authentication', 'forbidden', 'permission denied'])) {
    return {
      userMessage: 'API key invalid or unauthorized. Open Provider settings to update your key.',
      category: 'auth',
      retriable: false,
      action: 'open_provider_settings',
      debugMessage: rawMessage,
    };
  }

  if (status === 402 || matchesAny(rawMessage, ['quota', 'insufficient credit', 'insufficient_quota', 'billing', 'payment required'])) {
    return {
      userMessage: 'Account quota or credit exhausted. Check your provider dashboard.',
      category: 'quota',
      retriable: false,
      action: 'open_provider_settings',
      debugMessage: rawMessage,
    };
  }

  if (matchesAny(rawMessage, ['model not found', 'model_not_found', 'unknown model', 'unsupported model'])) {
    return {
      userMessage: 'Model is not available for this provider. Pick a different model.',
      category: 'model_unavailable',
      retriable: false,
      action: 'change_model',
      debugMessage: rawMessage,
    };
  }

  // model_unavailable 也可能就是裸 404 加 model 名
  if (status === 404 && matchesAny(rawMessage, ['model'])) {
    return {
      userMessage: 'Model is not available for this provider. Pick a different model.',
      category: 'model_unavailable',
      retriable: false,
      action: 'change_model',
      debugMessage: rawMessage,
    };
  }

  if (status !== null && status >= 500 && status < 600) {
    return {
      userMessage: 'Provider service error. Try again in a moment.',
      category: 'server_error',
      retriable: true,
      action: 'retry',
      // 5xx 也可能带 Retry-After (大厂 SDK 普遍如此)，透传到 UI 显示倒计时 (review MEDIUM)
      ...(ctx?.retryAfterMs !== undefined ? { retryAfterMs: ctx.retryAfterMs } : {}),
      debugMessage: rawMessage,
    };
  }

  if (status !== null && status >= 400 && status < 500) {
    return {
      userMessage: 'Request rejected by provider. The prompt or model setting may be invalid.',
      category: 'bad_request',
      retriable: false,
      debugMessage: rawMessage,
    };
  }

  // --- catch-all ---
  return {
    userMessage: rawMessage.length > 0 && rawMessage.length <= 160
      ? rawMessage
      : 'An unexpected error occurred. See main process log for details.',
    category: 'unknown',
    retriable: true,
    debugMessage: rawMessage,
  };
}
