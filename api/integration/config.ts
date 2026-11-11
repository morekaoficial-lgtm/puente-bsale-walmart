export type SyncMode = "simulation" | "sandbox" | "production";

export function getIntegrationConfig() {
  const syncMode = (process.env.SYNC_MODE || "simulation") as SyncMode;
  return {
    bsaleBaseUrl: (process.env.BSALE_BASE_URL || "https://api.bsale.io").replace(/\/$/, ""),
    bsaleToken: process.env.BSALE_ACCESS_TOKEN || "",
    walmartClientId: process.env.WALMART_CLIENT_ID || "",
    walmartClientSecret: process.env.WALMART_CLIENT_SECRET || "",
    walmartChannelType: process.env.WALMART_CHANNEL_TYPE || "",
    walmartMarket: process.env.WALMART_MARKET || "mx",
    allowWalmartWrites: process.env.ALLOW_WALMART_WRITES === "true",
    syncMode: ["simulation", "sandbox", "production"].includes(syncMode) ? syncMode : "simulation",
  } as const;
}

export function publicConnectionState() {
  const config = getIntegrationConfig();
  return {
    bsale: {
      configured: Boolean(config.bsaleToken),
      label: config.bsaleToken ? "Credenciales configuradas" : "Falta BSALE_ACCESS_TOKEN",
      baseUrl: config.bsaleBaseUrl,
    },
    walmart: {
      configured: Boolean(config.walmartClientId && config.walmartClientSecret),
      label:
        config.walmartClientId && config.walmartClientSecret
          ? "Credenciales configuradas"
          : "Faltan Client ID / Client Secret",
      market: config.walmartMarket,
    },
    schedulerMode: config.syncMode,
    productionWritesEnabled: config.allowWalmartWrites,
  };
}
