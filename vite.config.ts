import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pool.png", "favicon.svg"],
      manifest: {
        name: "Pool Sun — Gilmore Place",
        short_name: "Pool Sun",
        description:
          "Is there sun on the Gilmore Place amenity pool right now? A cute sun & shade visualizer.",
        theme_color: "#ffd59e",
        background_color: "#fff4e6",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
