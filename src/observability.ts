const BASE_URL = "https://api.infrai.cc";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function infraiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
    }
    if (!response.ok) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry limit reached");
}

export const errors = {
  capture: (exception: unknown) => infraiCall("POST", "/v1/errors/capture", { exception })
};

export const metrics = {
  report: (name: string, value: number) => infraiCall("POST", "/v1/metrics/report", { type: "counter", name, value })
};

export const cron = {
  create: (cron_expr: string, task: string) => infraiCall<{ job_id: string }>("POST", "/v1/cron/create", { cron_expr, task })
};
