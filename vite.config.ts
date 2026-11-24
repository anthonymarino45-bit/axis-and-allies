import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Plain single-page app. `base: "./"` keeps every asset path relative, so the
// same build works on GitHub Pages (under /axis-and-allies/) or any static host.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 8080 },
  build: { chunkSizeWarningLimit: 1500 },
});
