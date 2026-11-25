import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The demo page: built into docs/ and served by GitHub Pages from the gh-pages branch.
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  build: { outDir: "../docs", emptyOutDir: true },
});
