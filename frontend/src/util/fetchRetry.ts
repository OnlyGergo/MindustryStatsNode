/**
 * JSON GET that retries Cloudflare challenges (403 + `cf-mitigated: challenge`,
 * or an HTML 200) and transient failures with exponential backoff + jitter.
 * Non-retryable statuses (404 etc.) throw immediately.
 */
export class FetchRetryError extends Error {
  constructor(message: string, readonly challenged: boolean, readonly status?: number) { super(message); }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal!.reason); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const isChallenge = (r: Response) => r.headers.get('cf-mitigated') === 'challenge';
const retryableStatus = (s: number) => s === 403 || s === 408 || s === 425 || s === 429 || s >= 500;

export interface RetryOptions { attempts?: number; baseDelayMs?: number; signal?: AbortSignal; }

export async function fetchJsonWithRetry<T>(
  url: string,
  {
    // SSR self-fetches over loopback: no Cloudflare in the path, so don't slow the render down.
    attempts = typeof window === 'undefined' ? 1 : 5,
    baseDelayMs = 600,
    signal,
  }: RetryOptions = {},
): Promise<T> {
  let last: FetchRetryError = new FetchRetryError('Request failed', false);
  for (let i = 0; i < attempts; i++) {
    if (i > 0) { const wait = baseDelayMs * 2 ** (i - 1); await sleep(wait + Math.random() * wait * 0.25, signal); }
    try {
      const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
      const challenged = isChallenge(res);
      const isJson = res.headers.get('content-type')?.includes('json') ?? false;
      if (res.ok && isJson && !challenged) return (await res.json()) as T;
      // A 200 that isn't JSON is an interstitial page: retry it like a challenge.
      last = new FetchRetryError(`HTTP ${res.status}`, challenged || (res.ok && !isJson), res.status);
      if (!challenged && !res.ok && !retryableStatus(res.status)) throw last;
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err instanceof FetchRetryError) { if (!retryableStatus(err.status ?? 0)) throw err; last = err; }
      else { last = new FetchRetryError('Network error', false); }
    }
  }
  throw last;
}
