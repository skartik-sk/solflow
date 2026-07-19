// Redis connection options for BullMQ (ioredis). Parses REDIS_URL including the
// TLS flag (rediss://) + password, which BullMQ needs to connect to Upstash.
// Previously this returned only {host, port}, dropping TLS + auth → Upstash
// reset the connection (ECONNRESET).

type RedisOptions = {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: Record<string, unknown>;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
};

export function getRedisConnectionConfig(): RedisOptions {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  try {
    const parsed = new URL(url);
    const isTls = parsed.protocol === "rediss:";
    const opts: RedisOptions = {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port || "6379", 10),
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    };
    if (parsed.password) opts.password = decodeURIComponent(parsed.password);
    if (parsed.username) opts.username = parsed.username;
    if (isTls) opts.tls = {}; // Upstash requires TLS (rediss://)
    return opts;
  } catch {
    return { host: "localhost", port: 6379, maxRetriesPerRequest: null, enableReadyCheck: false };
  }
}

export function createRedisErrorLogger(component: string): (error: unknown) => void {
  let lastConnectionErrorAt = 0;

  return (error: unknown) => {
    const code = getErrorCode(error);
    const isConnectionRefused = code === "ECONNREFUSED";
    const now = Date.now();

    if (isConnectionRefused && now - lastConnectionErrorAt < 30_000) {
      return;
    }

    if (isConnectionRefused) {
      lastConnectionErrorAt = now;
    }

    const connection = getRedisConnectionConfig();
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        component,
        event: "redis_connection_error",
        code: code ?? "UNKNOWN",
        redisHost: connection.host,
        redisPort: connection.port,
        message: isConnectionRefused
          ? "Redis is not reachable. Start Redis for Cloud workers, or set CLOUD_RUNTIME_MODE=api to run the Cloud UI/API without embedded workers."
          : getErrorMessage(error),
      }),
    );
  };
}

function getErrorCode(error: unknown): string | undefined {
  const err = error as { code?: unknown; cause?: { code?: unknown }; errors?: Array<{ code?: unknown }> };
  if (typeof err?.code === "string") return err.code;
  if (typeof err?.cause?.code === "string") return err.cause.code;
  return err?.errors?.find((item) => typeof item.code === "string")?.code as string | undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
