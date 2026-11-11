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

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/Basic\s+[A-Za-z0-9+/=-]+/gi, "Basic <redacted>")
    .replace(/(access_token|client_secret|client_id)["'\s:=]+[^\s,"'}]+/gi, "$1=<redacted>")
    .slice(0, 1200);
}
