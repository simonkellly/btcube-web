import { defineConfig } from 'vite';
import path from "path";

export default defineConfig({
  worker: {
    format: "es",
  },
  optimizeDeps: {
      exclude: ["cubing"],
  },
  resolve: {
    alias: {
        "@": path.resolve(__dirname, "../src"),
    },
  },
  base: '/btcube-web/'  
});
