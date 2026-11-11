import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: "kimi-preview-host",
      config(config) {
        const hosts = config.server?.allowedHosts;
        if (hosts === true || hosts?.includes("3000.proxy.internal")) return;
        return { server: { allowedHosts: ["3000.proxy.internal"] } };
      },
    },
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Puente Bsale Walmart",
        short_name: "Puente",
        description: "Sincronización y monitoreo de inventario Bsale → Walmart México",
        lang: "es-MX",
        start_url: "/",
        display: "standalone",
        background_color: "#0c0c0f",
        theme_color: "#0c0c0f",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,png,ico}"],
        runtimeCaching: [{ urlPattern: /\/api\//, handler: "NetworkOnly" }],
      },
    }),
    inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
