declare const process: any;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: (typeof process !== "undefined" && process.env?.VITE_BASE_PATH) || "./",
  plugins: [react()],
  server: { port: 5175 }
});



