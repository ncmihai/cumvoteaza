export interface FetchedBytes {
  url: string;
  status: number;
  body: Buffer;
  contentType?: string;
  /** `name=value` pairs the server asked us to keep, for the next request of the same session. */
  cookies: string[];
}

export interface PoliteFetcherOptions {
  /** Minimum time between the start of two requests. Default 2000 ms (docs/cdep-access.md). */
  delayMs?: number;
  /** Hard cap on requests in this run, retries included. */
  maxRequests: number;
  /** Stop the run after this many failed requests in a row. Default 5. */
  maxConsecutiveFailures?: number;
  timeoutMs?: number;
  /** Extra attempts after a network error or a 5xx answer. Default 1. */
  retries?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** A bot-protection page served in place of the content (CDEP answers HTTP 200 with "Security check ... Captcha" after many requests). */
export function isChallengePage(body: Buffer): boolean {
  if (body.byteLength > 60_000) return false;
  const text = body.toString("latin1");
  // Two faces of the same protection: the challenge itself, and the page that follows a wrong or missing answer.
  if (/the url you requested has been blocked/i.test(text)) return true;
  return /security check/i.test(text) && /captcha/i.test(text);
}

/** The run must end now: the budget is spent, the source pushed back, or failures piled up. */
export class FetchStoppedError extends Error {
  constructor(message: string, readonly reason: "budget" | "blocked" | "failures") {
    super(message);
    this.name = "FetchStoppedError";
  }
}

/** One request at a time, spaced out, capped, and quick to stop (docs/cdep-access.md). */
export class PoliteFetcher {
  requests = 0;
  private consecutiveFailures = 0;
  private lastStartedAt: number | undefined;
  private readonly delayMs: number;
  private readonly maxConsecutiveFailures: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: PoliteFetcherOptions) {
    this.delayMs = options.delayMs ?? 2000;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? 5;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 1;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  get(url: string, extraHeaders?: Record<string, string>): Promise<FetchedBytes> {
    return this.request(url, { method: "GET", headers: extraHeaders });
  }

  post(url: string, form: URLSearchParams, extraHeaders?: Record<string, string>): Promise<FetchedBytes> {
    return this.request(url, { method: "POST", body: form, headers: extraHeaders });
  }

  private async request(url: string, init: { method: "GET" | "POST"; body?: URLSearchParams; headers?: Record<string, string> }): Promise<FetchedBytes> {
    let lastError: Error = new Error("No attempt made");
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (this.requests >= this.options.maxRequests) throw new FetchStoppedError(`Request budget of ${this.options.maxRequests} reached`, "budget");
      await this.waitTurn();
      this.requests += 1;
      try {
        const response = await this.fetchImpl(url, {
          method: init.method,
          body: init.body,
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { "user-agent": this.options.userAgent ?? "cumsevoteaza-ingest/0.1 (+private research)", ...init.headers }
        });
        if (response.status === 403 || response.status === 429) {
          throw new FetchStoppedError(`HTTP ${response.status} from ${new URL(url).host}: the source is pushing back, stopping`, "blocked");
        }
        if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        if (isChallengePage(body)) {
          throw new FetchStoppedError(`${new URL(url).host} answered with a security check (captcha) page: the source is limiting us, stopping. Wait before the next run and use a longer --delay-ms.`, "blocked");
        }
        this.consecutiveFailures = 0;
        const cookies = (response.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(";", 1)[0]!);
        return { url, status: response.status, body, contentType: response.headers.get("content-type") ?? undefined, cookies };
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          throw new FetchStoppedError(`${this.consecutiveFailures} failed requests in a row (last: ${lastError.message}), stopping`, "failures");
        }
      }
    }
    throw lastError;
  }

  private async waitTurn(): Promise<void> {
    if (this.lastStartedAt !== undefined) {
      const wait = this.lastStartedAt + this.delayMs - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastStartedAt = this.now();
  }
}
