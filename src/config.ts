export type AppConfig = {
  databaseUrl: string;
  redisUrl: string;
  cacheTtlSeconds: number;
  host: string;
  port: number;
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    redisUrl: required(env, "REDIS_URL"),
    cacheTtlSeconds: optionalPositiveInt(env.CACHE_TTL_SECONDS, 60),
    host: env.HOST ?? "127.0.0.1",
    port: optionalPositiveInt(env.PORT, 3000),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

function optionalPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Valor numérico inválido: ${raw}`);
  }

  return parsed;
}
