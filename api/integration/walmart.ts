import { getIntegrationConfig, type SyncMode } from "./config";

export type WalmartInventory = { sku: string; amount: number | null; raw?: unknown };

let cachedToken: { key: string; value: string; expiresAt: number } | null = null;

function baseUrl(mode: Exclude<SyncMode, "simulation">): string {
  return mode === "sandbox" ? "https://sandbox.walmartapis.com" : "https://marketplace.walmartapis.com";
}

async function parseResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function getAccessToken(mode: Exclude<SyncMode, "simulation">): Promise<string> {
  const config = getIntegrationConfig();
  const cacheKey = `${mode}:${config.walmartClientId}`;
  if (cachedToken?.key === cacheKey && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (!config.walmartClientId || !config.walmartClientSecret) {
    throw new Error("Configura WALMART_CLIENT_ID y WALMART_CLIENT_SECRET en el servidor");
  }
  const basic = Buffer.from(`${config.walmartClientId}:${config.walmartClientSecret}`).toString("base64");
  const response = await fetch(`${baseUrl(mode)}/v3/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.access_token) {
    throw new Error(`Walmart Token API respondió HTTP ${response.status}: ${JSON.stringify(result).slice(0, 400)}`);
  }
  cachedToken = {
    key: cacheKey,
    value: result.access_token,
    expiresAt: Date.now() + Math.min(Number(result.expires_in || 900), 900) * 1000,
  };
  return cachedToken.value;
}

async function walmartRequest(
  mode: Exclude<SyncMode, "simulation">,
  path: string,
  options: { method?: "GET" | "PUT"; body?: unknown; correlationId: string },
): Promise<any> {
  const config = getIntegrationConfig();
  const token = await getAccessToken(mode);
  const basic = Buffer.from(`${config.walmartClientId}:${config.walmartClientSecret}`).toString("base64");
  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
    "WM_SEC.ACCESS_TOKEN": token,
    "WM_SVC.NAME": "Walmart Marketplace",
    "WM_QOS.CORRELATION_ID": options.correlationId,
    "WM_MARKET": config.walmartMarket,
    Accept: "application/json",
  };
  if (config.walmartChannelType) headers["WM_CONSUMER.CHANNEL.TYPE"] = config.walmartChannelType;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl(mode)}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(25_000),
  });
  const result = await parseResponse(response);
  if (!response.ok) {
    const error = new Error(`Walmart respondió HTTP ${response.status}: ${JSON.stringify(result).slice(0, 500)}`) as Error & {
      status?: number;
      correlationId?: string;
    };
    error.status = response.status;
    error.correlationId = options.correlationId;
    throw error;
  }
  return result;
}

function readAmount(result: any): number | null {
  const candidates = [
    result?.quantity?.amount,
    result?.inventory?.quantity?.amount,
    result?.inventory?.[0]?.quantity?.amount,
    result?.inventories?.[0]?.quantity?.amount,
    result?.payload?.quantity?.amount,
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);
  return value === undefined ? null : Number(value);
}

export async function getWalmartInventory(
  mode: Exclude<SyncMode, "simulation">,
  sku: string,
  shipNode?: string,
): Promise<WalmartInventory> {
  const params = new URLSearchParams({ sku });
  if (shipNode) params.set("shipNode", shipNode);
  const correlationId = crypto.randomUUID();
  const result = await walmartRequest(mode, `/v3/inventory?${params.toString()}`, { correlationId });
  return { sku, amount: readAmount(result), raw: result };
}

export async function updateWalmartInventory(
  mode: Exclude<SyncMode, "simulation">,
  sku: string,
  amount: number,
  shipNode?: string,
): Promise<{ correlationId: string }> {
  const params = new URLSearchParams({ sku });
  if (shipNode) params.set("shipNode", shipNode);
  const correlationId = crypto.randomUUID();
  await walmartRequest(mode, `/v3/inventory?${params.toString()}`, {
    method: "PUT",
    correlationId,
    body: { sku, quantity: { unit: "EACH", amount } },
  });
  return { correlationId };
}

export async function testWalmartConnection(): Promise<{ detail: string }> {
  const config = getIntegrationConfig();
  const mode = config.syncMode === "sandbox" ? "sandbox" : "production";
  await getAccessToken(mode);
  return { detail: `Autenticación OAuth correcta en ${mode === "sandbox" ? "sandbox" : "producción"}. No se modificó inventario.` };
}

export function demoWalmartAmount(sku: string): number | null {
  const amounts: Record<string, number> = {
    "DEMO-CAFE-500": 18,
    "DEMO-TE-VERDE": 6,
    "DEMO-VASO-350": 42,
    "DEMO-FILTRO-02": 9,
    "DEMO-MOLINO-01": 2,
  };
  return Object.prototype.hasOwnProperty.call(amounts, sku) ? amounts[sku] : null;
}
