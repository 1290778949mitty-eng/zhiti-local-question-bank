/** Request scheduling for one Studio run, not a global provider quota bypass. */
export const STUDIO_TEXT_CONCURRENCY = 4;
export const STUDIO_DRAWING_CONCURRENCY = 2;
export const STUDIO_CONCURRENCY_CHOICES = [1, 2, 4, 6] as const;
const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);

export class StudioRequestError extends Error {
  constructor(message: string, public status = 0, public retryAfterMs = 0,
    public retryable = retryStatuses.has(status)) {
    super(message);
    this.name = 'StudioRequestError';
  }
}

export function studioRetryAfter(value: string | null | undefined, now = Date.now()): number {
  if (!value?.trim()) return 0;
  const text = value.trim();
  const delay = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) * 1000
    : /^[A-Za-z]{3},/.test(text) ? Date.parse(text) - now : 0;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

export function studioConcurrency(value: unknown, fallback = STUDIO_TEXT_CONCURRENCY, max = 6) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? Math.min(value, max) : fallback;
}
export type StudioConcurrencyState = { limit: number; cooldownUntil: number };
export function studioConcurrencyState(value: unknown, fallback = STUDIO_TEXT_CONCURRENCY, max = 6): StudioConcurrencyState {
  return { limit: studioConcurrency(value, fallback, max), cooldownUntil: 0 };
}
export type StudioRetryRuntime = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};
const runtime: StudioRetryRuntime = {
  now: Date.now,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  random: Math.random,
};
export type StudioRetryNotice = { attempt: number; limit: number; delayMs: number; status: number };

/** Bounded windows, settled results in INPUT order, at most two retries.
 * Workers must return values, not mutate the shared draft or write checkpoints.
 * All in-flight work settles before return, including on partial failure.
 */
export async function runStudioWindow<T, R>(
  items: readonly T[], worker: (item: T) => Promise<R>, state: StudioConcurrencyState,
  onRetry: (notice: StudioRetryNotice) => void = () => {}, clock = runtime,
): Promise<PromiseSettledResult<R>[]> {
  const outcomes = new Array<PromiseSettledResult<R>>(items.length);
  let pending = items.map((_, index) => index);
  for (let attempt = 0; pending.length && attempt <= 2; attempt++) {
    const retry: number[] = [];
    for (let offset = 0; offset < pending.length;) {
      const delay = Math.max(0, state.cooldownUntil - clock.now());
      if (delay) await clock.sleep(delay);
      const indexes = pending.slice(offset, offset + state.limit);
      offset += indexes.length;
      const settled = await Promise.allSettled(indexes.map(index => Promise.resolve().then(() => worker(items[index]))));
      let slowDown = false, retryDelay = 0, retryStatus = 0;
      settled.forEach((outcome, position) => {
        const index = indexes[position];
        outcomes[index] = outcome;
        if (outcome.status !== 'rejected') return;
        const error = outcome.reason;
        if (!(error instanceof StudioRequestError) || !error.retryable) return;
        slowDown ||= error.status === 429 || error.status === 503;
        // Do not sleep for hours or retry EARLIER than a long Retry-After.
        // Leave this task failed for a later user-initiated continuation instead.
        if (attempt === 2 || error.retryAfterMs > 60_000) return;
        retry.push(index);
        retryStatus = error.status;
        retryDelay = Math.max(retryDelay, error.retryAfterMs, 1000 * 2 ** attempt + Math.floor(clock.random() * 250));
      });
      if (slowDown) state.limit = Math.max(1, Math.floor(state.limit / 2));
      if (retryDelay) {
        state.cooldownUntil = Math.max(state.cooldownUntil, clock.now() + retryDelay);
        onRetry({ attempt: attempt + 1, limit: state.limit, delayMs: retryDelay, status: retryStatus });
      }
    }
    pending = retry;
  }
  return outcomes;
}

/** Preserve HTTP status and Retry-After; do not turn auth/schema errors into retries. */
export async function studioApi<T>(url: string, body: unknown): Promise<T> {
  const payload = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
  } catch (error) {
    // An explicit cancellation is never retried.
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new StudioRequestError(error instanceof Error ? error.message : 'Network request failed', 0, 0, true);
  }
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}: invalid JSON response` }));
  if (!response.ok) throw new StudioRequestError(
    typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`,
    response.status, studioRetryAfter(response.headers.get('retry-after')),
    typeof data?.retryable === 'boolean' ? data.retryable : retryStatuses.has(response.status),
  );
  if (data?.error && !data?.records) throw new StudioRequestError(data.error, response.status, 0, false);
  return data as T;
}

/** Used only by Studio routes; ordinary question-bank API responses stay unchanged. */
export function studioUpstreamFailure(result: { status: number; error?: string; retryAfter?: string | null }, fallback: string) {
  const status = result.status >= 400 && result.status <= 599 ? result.status : 502;
  return Response.json({ error: result.error || fallback, retryable: result.status >= 400 && retryStatuses.has(status) }, {
    status, headers: result.retryAfter ? { 'Retry-After': result.retryAfter } : undefined,
  });
}

export function studioCaughtFailure(error: unknown, fallback: string) {
  const network = error instanceof TypeError && /fetch|network|socket|ECONN|timeout/i.test(error.message);
  return Response.json({ error: error instanceof Error ? error.message : fallback, retryable: network }, { status: network ? 502 : 500 });
}
