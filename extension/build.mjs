import { build, context } from "esbuild";
import { cp, mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const outdir = "dist";

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: {
    "sidepanel/index": "src/sidepanel/index.ts",
    "sidepanel/service-worker": "src/service-worker.ts",
  },
  bundle: true,
  format: "esm",
  target: "es2022",
  outdir,
  sourcemap: true,
  logLevel: "info",
};

async function copyStatic() {
  await mkdir(`${outdir}/sidepanel`, { recursive: true });
  await cp("manifest.json", `${outdir}/manifest.json`);
  await cp("src/sidepanel/index.html", `${outdir}/sidepanel/index.html`);
  await cp("src/sidepanel/styles.css", `${outdir}/sidepanel/styles.css`);
}

await copyStatic();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watch: aguardando mudanças…");
} else {
  await build(options);
  console.log("build concluído em dist/");
}
