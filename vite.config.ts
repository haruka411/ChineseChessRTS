import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react(), inlineFileProtocolBundle()],
});

function inlineFileProtocolBundle(): Plugin {
  return {
    name: "inline-file-protocol-bundle",
    apply: "build",
    closeBundle() {
      const distDir = resolve(process.cwd(), "dist");
      const indexPath = resolve(distDir, "index.html");
      let html = readFileSync(indexPath, "utf8");

      html = html.replace(
        /<script type="module" crossorigin src="(.+?)"><\/script>/g,
        (_tag, src: string) => {
          const script = readFileSync(resolveAsset(distDir, src), "utf8");
          return `<script type="module">\n${script}\n</script>`;
        },
      );

      html = html.replace(
        /<link rel="stylesheet" crossorigin href="(.+?)">/g,
        (_tag, href: string) => {
          const css = readFileSync(resolveAsset(distDir, href), "utf8");
          return `<style>\n${css}\n</style>`;
        },
      );

      writeFileSync(indexPath, html, "utf8");

      const assetsDir = resolve(distDir, "assets");
      if (existsSync(assetsDir)) {
        rmSync(assetsDir, { recursive: true, force: true });
      }
    },
  };
}

function resolveAsset(distDir: string, assetPath: string): string {
  return resolve(distDir, assetPath.replace(/^\.\//, ""));
}
