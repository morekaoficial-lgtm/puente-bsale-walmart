import { afterEach, describe, expect, it, vi } from "vitest";
import { updateWalmartInventory } from "./walmart";

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
});
