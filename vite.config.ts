import { defineConfig } from "vite";

export default defineConfig({ base: "./", server: { host: "localhost", port: 5173, strictPort: true }, build: { outDir: "dist", emptyOutDir: true } });
