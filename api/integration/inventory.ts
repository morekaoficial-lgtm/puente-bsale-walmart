export function calculateTargetStock(available: number, safetyStock = 0): number {
  if (!Number.isFinite(available)) throw new Error("El stock disponible de Bsale no es un número válido");
  if (!Number.isInteger(safetyStock) || safetyStock < 0) throw new Error("El stock de seguridad debe ser un entero positivo");
  return Math.max(0, Math.floor(available - safetyStock));
}

export function parseSkuAllowlist(value?: string | null): Set<string> {
  return new Set(
    (value || "")
      .split(/[\n,;]+/)
      .map((sku) => sku.trim())
      .filter(Boolean),
  );
}

export function skuMatches(sku: string, allowlist: Set<string>, requestedSku?: string): boolean {
  if (requestedSku && sku !== requestedSku) return false;
  return allowlist.size === 0 || allowlist.has(sku);
}

export type BulkStockInput = { sku: string; available: number };
export type BulkCatalogItem = { sku: string; nodes: Array<{ shipNode?: string; amount: number | null }> };
export type BulkPlanItem = {
  stock: BulkStockInput;
  targetStock: number;
  walmartStock: number | null;
  status: "pending" | "unchanged" | "failed";
  errorCode?: string;
  errorMessage?: string;
};

export function planBulkInventory(
  stocks: BulkStockInput[],
  catalog: Map<string, BulkCatalogItem>,
  safetyStock: number,
  shipNode?: string,
): BulkPlanItem[] {
  const unique = new Map<string, BulkStockInput>();
  for (const stock of stocks) {
    const previous = unique.get(stock.sku);
    if (previous && previous.available !== stock.available) {
      throw new Error(`Bsale devolvió stocks diferentes para el SKU ${stock.sku}. Revisa la sucursal antes de actualizar.`);
    }
    unique.set(stock.sku, stock);
  }

  return [...unique.values()].map((stock) => {
    const targetStock = calculateTargetStock(stock.available, safetyStock);
    const current = catalog.get(stock.sku);
    if (!current) {
      return {
        stock,
        targetStock,
        walmartStock: null,
        status: "failed",
        errorCode: "WALMART_SKU_NOT_FOUND",
        errorMessage: "El SKU no aparece en el inventario de Walmart. No se envió una escritura.",
      };
    }

    let node: BulkCatalogItem["nodes"][number] | undefined;
    if (shipNode) {
      node = current.nodes.find((candidate) => candidate.shipNode === shipNode);
      if (!node) {
        return {
          stock,
          targetStock,
          walmartStock: null,
          status: "failed",
          errorCode: "WALMART_SHIP_NODE_NOT_FOUND",
          errorMessage: `El SKU no tiene inventario reconocible en el ship node ${shipNode}. No se envió una escritura.`,
        };
      }
    } else if (current.nodes.length === 1) {
      node = current.nodes[0];
    } else {
      return {
        stock,
        targetStock,
        walmartStock: null,
        status: "failed",
        errorCode: "WALMART_SHIP_NODE_REQUIRED",
        errorMessage: "Configura el ship node de Walmart: el SKU tiene varios nodos o ninguno reconocible.",
      };
    }

    const walmartStock = node.amount;
    if (walmartStock === null || !Number.isFinite(walmartStock)) {
      return {
        stock,
        targetStock,
        walmartStock: null,
        status: "failed",
        errorCode: "WALMART_AMOUNT_INVALID",
        errorMessage: "Walmart no devolvió una cantidad de inventario reconocible para comparar.",
      };
    }
    return { stock, targetStock, walmartStock, status: walmartStock === targetStock ? "unchanged" : "pending" };
  });
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/Basic\s+[A-Za-z0-9+/=-]+/gi, "Basic <redacted>")
    .replace(/(access_token|client_secret|client_id)["'\s:=]+[^\s,"'}]+/gi, "$1=<redacted>")
    .slice(0, 1200);
}
