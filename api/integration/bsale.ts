import { getIntegrationConfig } from "./config";
import { safeErrorMessage } from "./inventory";

export type BsaleStock = {
  sku: string;
  available: number;
  physical: number;
  reserved: number;
  officeId?: string;
};

type BsaleStockItem = {
  quantity?: number;
  quantityAvailable?: number;
  quantityReserved?: number;
  office?: { id?: string | number };
  variant?: { id?: string | number; code?: string; href?: string };
};

async function bsaleRequest(path: string): Promise<any> {
  const config = getIntegrationConfig();
  if (!config.bsaleToken) throw new Error("Configura BSALE_ACCESS_TOKEN en el servidor");
  const response = await fetch(`${config.bsaleBaseUrl}${path}`, {
    headers: { access_token: config.bsaleToken, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Bsale respondió HTTP ${response.status}: ${body.slice(0, 400)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Bsale devolvió una respuesta que no es JSON válido");
  }
}

export async function testBsaleConnection(): Promise<{ detail: string }> {
  const result = await bsaleRequest("/v1/offices.json?limit=1&offset=0");
  const count = Number(result.count ?? result.items?.length ?? 0);
  return { detail: `Conexión correcta. Bsale respondió con ${count} sucursal(es) disponibles.` };
}

export async function fetchBsaleStocks(officeId?: string): Promise<BsaleStock[]> {
  const stocks: BsaleStock[] = [];
  const limit = 50;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      expand: "[variant,office]",
    });
    if (officeId) params.set("officeid", officeId);
    const result = await bsaleRequest(`/v1/stocks.json?${params.toString()}`);
    const items: BsaleStockItem[] = result.items || [];
    total = Number(result.count ?? items.length);

    for (const item of items) {
      const sku = item.variant?.code?.trim();
      if (!sku) continue;
      stocks.push({
        sku,
        available: Number(item.quantityAvailable ?? 0),
        physical: Number(item.quantity ?? 0),
        reserved: Number(item.quantityReserved ?? 0),
        officeId: item.office?.id?.toString(),
      });
    }
    if (items.length === 0) break;
    offset += items.length;
  }
  return stocks;
}

export function demoBsaleStocks(): BsaleStock[] {
  return [
    { sku: "DEMO-CAFE-500", available: 24, physical: 26, reserved: 2, officeId: "demo" },
    { sku: "DEMO-TE-VERDE", available: 8, physical: 10, reserved: 2, officeId: "demo" },
    { sku: "DEMO-VASO-350", available: 42, physical: 42, reserved: 0, officeId: "demo" },
    { sku: "DEMO-FILTRO-02", available: 3, physical: 4, reserved: 1, officeId: "demo" },
    { sku: "DEMO-MOLINO-01", available: 0, physical: 0, reserved: 0, officeId: "demo" },
    { sku: "DEMO-NO-CATALOGADO", available: 12, physical: 12, reserved: 0, officeId: "demo" },
  ];
}

export async function getBsaleStocks(mode: "simulation" | "sandbox" | "production", officeId?: string) {
  if (mode === "simulation") return demoBsaleStocks();
  try {
    return await fetchBsaleStocks(officeId);
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
