// Browser-side calls go through the Next rewrite (/api/* → api), same origin.
export type SendResult<T> = { data: T; error?: undefined } | { data?: undefined; error: `${string}.${string}` };

export async function send<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<SendResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      // api rejects writes without JSON content-type (415 errors.contentType) — every write sends a JSON body
      headers: method === "GET" ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const key = json && typeof json === "object" && "error" in json && typeof json.error === "string" && json.error ? (json.error as `${string}.${string}`) : "errors.http";
      return { error: key };
    }
    return { data: json as T };
  } catch {
    return { error: "errors.apiDown" };
  }
}
