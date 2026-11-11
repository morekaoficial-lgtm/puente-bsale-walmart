import { describe, expect, it } from "vitest";
import { calculateTargetStock, parseSkuAllowlist, safeErrorMessage, skuMatches } from "./inventory";

describe("calculateTargetStock", () => {
  it("descuenta el stock de seguridad y redondea hacia abajo para unidades EACH", () => {
    expect(calculateTargetStock(12.9, 2)).toBe(10);
    expect(calculateTargetStock(8, 0)).toBe(8);
  });

  it("nunca publica cantidades negativas", () => {
    expect(calculateTargetStock(2, 5)).toBe(0);
    expect(calculateTargetStock(-4, 0)).toBe(0);
  });

  it("rechaza entradas inválidas", () => {
    expect(() => calculateTargetStock(Number.NaN, 0)).toThrow();
    expect(() => calculateTargetStock(10, -1)).toThrow();
  });
});

describe("filtros de SKU", () => {
  it("acepta líneas, comas y punto y coma", () => {
    const list = parseSkuAllowlist("A-1\nB-2, C-3;D-4");
    expect([...list]).toEqual(["A-1", "B-2", "C-3", "D-4"]);
    expect(skuMatches("B-2", list)).toBe(true);
    expect(skuMatches("X-9", list)).toBe(false);
  });

  it("una ejecución por SKU nunca procesa otro producto", () => {
    expect(skuMatches("A-1", new Set(), "A-1")).toBe(true);
    expect(skuMatches("A-2", new Set(), "A-1")).toBe(false);
  });
});

describe("safeErrorMessage", () => {
  it("oculta credenciales antes de guardar errores", () => {
    expect(safeErrorMessage(new Error("Bearer abc.def client_secret=super-secreto"))).not.toContain("super-secreto");
    expect(safeErrorMessage(new Error("Basic QWxhZGRpbjpvcGVu"))).not.toContain("QWxhZGRpbjpvcGVu");
  });
});
