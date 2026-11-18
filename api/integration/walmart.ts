import { getIntegrationConfig, type SyncMode } from "./config";

export type WalmartInventory = { sku: string; amount: number | null; raw?: unknown };
export type WalmartInventoryNode = { shipNode?: string; amount: number | null };
export type WalmartCatalogInventory = { sku: string; nodes: WalmartInventoryNode[] };
export type WalmartBulkItem = { sku: string; amount: number };

type RealMode = Exclude<SyncMode, "simulation">;
type WalmartRequestOptions = {
  method?: "GET" | "PUT" | "POST";
  body?: unknown;
  correlationId: string;
};

let cachedToken: { key: string; value: string; expiresAt: number } | null = null;

function baseUrl(mode: RealMode): string {
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

async function getAccessToken(mode: RealMode): Promise<string> {
  const config = getIntegrationConfig();
  const cacheKey = `${mode}:${config.walmartClientId}`;
  if (cachedToken?.key === cacheKey && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (!config.walmartClientId || !config.walmartClientSecret) {
    throw new Error("Configura WALMART_CLIENT_ID y WALMART_CLIENT_SECRET en el servidor");
  }
  const basic = Buffer.from(`${config.walmartClientId}:${config.walmartClientSecret}`).toString("base64");
  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
    "WM_SVC.NAME": "Walmart Marketplace",
    "WM_QOS.CORRELATION_ID": crypto.randomUUID(),
    "WM_MARKET": config.walmartMarket,
  };
  if (config.walmartChannelType) headers["WM_CONSUMER.CHANNEL.TYPE"] = config.walmartChannelType;
  const response = await fetch(`${baseUrl(mode)}/v3/token`, {
    method: "POST",
    headers,
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

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 60_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function walmartRequest(mode: RealMode, path: string, options: WalmartRequestOptions): Promise<any> {
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
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentResponse = await fetch(`${baseUrl(mode)}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      signal: AbortSignal.timeout(25_000),
    });
    response = currentResponse;
    if (![408, 429, 500, 502, 503, 504].includes(currentResponse.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(currentResponse, attempt)));
  }

  const result = await parseResponse(response!);
  if (!response!.ok) {
    const error = new Error(`Walmart respondió HTTP ${response!.status}: ${JSON.stringify(result).slice(0, 500)}`) as Error & {
      status?: number;
      correlationId?: string;
    };
    error.status = response!.status;
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

function readNodeAmount(node: any): number | null {
  const value = node?.inputQty?.amount ?? node?.quantity?.amount;
  return value === undefined || value === null ? null : Number(value);
}

export async function getWalmartInventory(
  mode: RealMode,
  sku: string,
  shipNode?: string,
): Promise<WalmartInventory> {
  const params = new URLSearchParams({ sku });
  if (shipNode) params.set("shipNode", shipNode);
  const correlationId = crypto.randomUUID();
  const result = await walmartRequest(mode, `/v3/inventory?${params.toString()}`, { correlationId });
  return { sku, amount: readAmount(result), raw: result };
}

export async function getWalmartInventoryCatalogForSkus(
  mode: RealMode,
  skus: string[],
  shipNode?: string,
): Promise<{ catalog: Map<string, WalmartCatalogInventory>; failures: Map<string, unknown> }> {
  const catalog = new Map<string, WalmartCatalogInventory>();
  const failures = new Map<string, unknown>();
  const pending = [...new Set(skus)];
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const sku = pending[cursor];
      cursor += 1;
      try {
        const current = await getWalmartInventory(mode, sku, shipNode);
        catalog.set(sku, { sku, nodes: [{ shipNode, amount: current.amount }] });
      } catch (error) {
        failures.set(sku, error);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()));
  return { catalog, failures };
}

export async function getWalmartInventoryCatalog(mode: RealMode): Promise<Map<string, WalmartCatalogInventory>> {
  const catalog = new Map<string, WalmartCatalogInventory>();
  const usedCursors = new Set<string>();
  let nextCursor = "";

  do {
    const params = new URLSearchParams({ limit: "50" });
    if (nextCursor) params.set("nextCursor", nextCursor);
    const result = await walmartRequest(mode, `/v3/inventories?${params.toString()}`, {
      correlationId: crypto.randomUUID(),
    });
    const items = result?.inventories || result?.items || result?.payload?.inventories || [];
    if (!Array.isArray(items)) throw new Error("Walmart devolvió un catálogo de inventario con formato no reconocido.");

    for (const item of items) {
      const sku = String(item?.sku || "").trim();
      if (!sku) continue;
      const rawNodes = item?.nodes || item?.inventory?.nodes || item?.inventories?.nodes || [];
      const nodes: WalmartInventoryNode[] = Array.isArray(rawNodes)
        ? rawNodes.map((node: any) => ({ shipNode: node?.shipNode?.toString(), amount: readNodeAmount(node) }))
        : [];
      if (nodes.length === 0) {
        const amount = readAmount(item);
        if (amount !== null) nodes.push({ amount });
      }
      catalog.set(sku, { sku, nodes });
    }

    nextCursor = String(result?.nextCursor || result?.meta?.nextCursor || "");
    if (nextCursor && usedCursors.has(nextCursor)) {
      throw new Error("Walmart repitió un cursor de paginación; se detuvo la lectura para evitar un ciclo.");
    }
    if (nextCursor) usedCursors.add(nextCursor);
  } while (nextCursor);

  return catalog;
}

export async function updateWalmartInventory(
  mode: RealMode,
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

export async function updateWalmartInventoryBulk(
  mode: RealMode,
  items: WalmartBulkItem[],
  shipNode?: string,
): Promise<{ feedId: string; correlationId: string }> {
  if (items.length === 0) throw new Error("No hay diferencias de inventario para enviar a Walmart.");
  const payload = {
    InventoryHeader: { version: "1.4" },
    Inventory: items.map((item) => ({ sku: item.sku, quantity: { unit: "EACH", amount: item.amount } })),
  };
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, "utf8") > 4_500_000) {
    throw new Error("El lote supera el tamaño seguro de 4,5 MB. Reduce el catálogo permitido antes de continuar.");
  }
  const form = new FormData();
  form.append("file", new Blob([json], { type: "application/json" }), "BulkInventoryFeed.json");
  const params = new URLSearchParams({ feedType: "inventory" });
  if (shipNode) params.set("shipNode", shipNode);
  const correlationId = crypto.randomUUID();
  const result = await walmartRequest(mode, `/v3/feeds?${params.toString()}`, {
    method: "POST",
    correlationId,
    body: form,
  });
  if (!result?.feedId) throw new Error("Walmart aceptó la llamada, pero no devolvió el identificador del feed.");
  return { feedId: String(result.feedId), correlationId };
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
