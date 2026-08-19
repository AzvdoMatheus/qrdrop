import { build, context } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { extensionIdentity } from "./scripts/ext-key.mjs";

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
  await cp("src/sidepanel/index.html", `${outdir}/sidepanel/index.html`);
  await cp("src/sidepanel/styles.css", `${outdir}/sidepanel/styles.css`);

  // A `key` fixa o ID da extensão, sem ela o Chrome sorteia um ID novo a cada
  // carga, o allowed_origins do native host deixa de bater e é preciso
  // recarregar a extensão do zero
  const { publicKeyB64, extensionId } = extensionIdentity();
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  manifest.key = publicKeyB64;
  await writeFile(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return extensionId;
}

console.log(`extensão: ${await copyStatic()}`);

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watch: aguardando mudanças…");
} else {
  await build(options);
  console.log("build concluído em dist/");
}
