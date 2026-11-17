import { afterEach, describe, expect, it, vi } from "vitest";
import { getWalmartInventoryCatalog, updateWalmartInventory, updateWalmartInventoryBulk } from "./walmart";

describe("Walmart Marketplace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("autentica con OAuth y actualiza inventario usando los encabezados de México", async () => {
    vi.stubEnv("WALMART_CLIENT_ID", "cliente-prueba");
    vi.stubEnv("WALMART_CLIENT_SECRET", "secreto-prueba");
    vi.stubEnv("WALMART_MARKET", "mx");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/v3/token")) {
        return new Response(JSON.stringify({ access_token: "token-temporal", expires_in: 900 }), { status: 200 });
      }
      return new Response(JSON.stringify({ sku: "SKU-1", quantity: { unit: "EACH", amount: 7 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateWalmartInventory("sandbox", "SKU-1", 7, "NODE-1");

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://sandbox.walmartapis.com/v3/token");
    const tokenHeaders = calls[0].init?.headers as Record<string, string>;
    expect(tokenHeaders.Authorization).toMatch(/^Basic /);
    expect(tokenHeaders["WM_SVC.NAME"]).toBe("Walmart Marketplace");
    expect(tokenHeaders["WM_QOS.CORRELATION_ID"]).toBeTruthy();
    expect(tokenHeaders["WM_MARKET"]).toBe("mx");
    expect(calls[1].url).toContain("https://sandbox.walmartapis.com/v3/inventory?");
    expect(calls[1].url).toContain("sku=SKU-1");
    expect(calls[1].url).toContain("shipNode=NODE-1");
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers["WM_SEC.ACCESS_TOKEN"]).toBe("token-temporal");
    expect(headers["WM_MARKET"]).toBe("mx");
    expect(headers["WM_QOS.CORRELATION_ID"]).toBeTruthy();
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      sku: "SKU-1",
      quantity: { unit: "EACH", amount: 7 },
    });
  });

  it("lee el catálogo completo secuencialmente con nextCursor", async () => {
    vi.stubEnv("WALMART_CLIENT_ID", "cliente-catalogo");
    vi.stubEnv("WALMART_CLIENT_SECRET", "secreto-prueba");
    vi.stubEnv("WALMART_MARKET", "mx");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const value = String(url);
      calls.push(value);
      if (value.endsWith("/v3/token")) {
        return new Response(JSON.stringify({ access_token: "token-catalogo", expires_in: 900 }), { status: 200 });
      }
      if (value.includes("nextCursor=")) {
        return new Response(JSON.stringify({
          inventories: [{ sku: "SKU-2", nodes: [{ shipNode: "NODE-1", inputQty: { unit: "EACH", amount: 3 } }] }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        nextCursor: "cursor siguiente",
        inventories: [{ sku: "SKU-1", nodes: [{ shipNode: "NODE-1", inputQty: { unit: "EACH", amount: 7 } }] }],
      }), { status: 200 });
    }));

    const catalog = await getWalmartInventoryCatalog("production");

    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("/v3/inventories?limit=50");
    expect(calls[2]).toContain("nextCursor=cursor+siguiente");
    expect(catalog.get("SKU-1")?.nodes[0]).toEqual({ shipNode: "NODE-1", amount: 7 });
    expect(catalog.get("SKU-2")?.nodes[0].amount).toBe(3);
  });

  it("envía un feed JSON multipart únicamente con los cambios recibidos", async () => {
    vi.stubEnv("WALMART_CLIENT_ID", "cliente-feed");
    vi.stubEnv("WALMART_CLIENT_SECRET", "secreto-prueba");
    vi.stubEnv("WALMART_MARKET", "mx");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/v3/token")) {
        return new Response(JSON.stringify({ access_token: "token-feed", expires_in: 900 }), { status: 200 });
      }
      return new Response(JSON.stringify({ feedId: "FEED-123" }), { status: 200 });
    }));

    const result = await updateWalmartInventoryBulk("production", [{ sku: "SKU-CAMBIO", amount: 12 }], "NODE-1");

    expect(result.feedId).toBe("FEED-123");
    expect(calls[1].url).toContain("/v3/feeds?feedType=inventory&shipNode=NODE-1");
    const body = calls[1].init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const file = body.get("file") as File;
    expect(JSON.parse(await file.text())).toEqual({
      InventoryHeader: { version: "1.4" },
      Inventory: [{ sku: "SKU-CAMBIO", quantity: { unit: "EACH", amount: 12 } }],
    });
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("reintenta una respuesta 429 respetando Retry-After", async () => {
    vi.stubEnv("WALMART_CLIENT_ID", "cliente-reintento");
    vi.stubEnv("WALMART_CLIENT_SECRET", "secreto-prueba");
    vi.stubEnv("WALMART_MARKET", "mx");
    let inventoryCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/v3/token")) {
        return new Response(JSON.stringify({ access_token: "token-reintento", expires_in: 900 }), { status: 200 });
      }
      inventoryCalls += 1;
      if (inventoryCalls === 1) return new Response("{}", { status: 429, headers: { "Retry-After": "0" } });
      return new Response(JSON.stringify({ inventories: [] }), { status: 200 });
    }));

    await getWalmartInventoryCatalog("sandbox");
    expect(inventoryCalls).toBe(2);
  });
});
