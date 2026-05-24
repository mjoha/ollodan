import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, watch } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const wwwroot = join(root, "api", "Ollodan.Api", "wwwroot");
const apiUrl = process.env.OLLADAN_API_URL ?? "";

const esbuildOptions = {
  bundle: true,
  format: "esm",
  target: "es2020",
  define: { OLLADAN_API_URL: JSON.stringify(apiUrl) },
  entryPoints: {
    index: join(root, "src/ts/index.ts"),
    group: join(root, "src/ts/group.ts"),
  },
  outdir: join(dist, "js"),
};

export function syncStatic() {
  mkdirSync(join(dist, "css"), { recursive: true });
  cpSync(join(root, "src", "css"), join(dist, "css"), { recursive: true });
  cpSync(join(root, "src", "index.html"), join(dist, "index.html"));
  cpSync(join(root, "src", "group.html"), join(dist, "group.html"));
}

export function copyDistToWwwroot() {
  mkdirSync(wwwroot, { recursive: true });
  cpSync(dist, wwwroot, { recursive: true });
}

export async function buildAll() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, "js"), { recursive: true });
  syncStatic();
  await esbuild.build(esbuildOptions);
  rmSync(wwwroot, { recursive: true, force: true });
  copyDistToWwwroot();
  logBuilt();
}

function logBuilt() {
  console.log(
    apiUrl === ""
      ? "[web] Built → wwwroot (same-origin API)"
      : `[web] Built → wwwroot (API: ${apiUrl})`
  );
}

/** @returns {Promise<() => void>} */
export async function startWatch() {
  mkdirSync(join(dist, "js"), { recursive: true });
  syncStatic();
  copyDistToWwwroot();

  const ctx = await esbuild.context({
    ...esbuildOptions,
    plugins: [
      {
        name: "copy-wwwroot",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length === 0) {
              copyDistToWwwroot();
              console.log("[web] JS updated");
            }
          });
        },
      },
    ],
  });

  await ctx.watch();
  console.log("[web] Watching src/ts, src/css, *.html");

  const onStaticChange = (label) => {
    syncStatic();
    copyDistToWwwroot();
    console.log(`[web] ${label} updated`);
  };

  const watchers = [
    watch(join(root, "src", "css"), { recursive: true }, () => onStaticChange("CSS")),
    watch(join(root, "src", "index.html"), () => onStaticChange("index.html")),
    watch(join(root, "src", "group.html"), () => onStaticChange("group.html")),
  ];

  return () => {
    for (const w of watchers) w.close();
    void ctx.dispose();
  };
}
