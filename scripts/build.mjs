import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const wwwroot = join(root, "api", "Ollodan.Api", "wwwroot");

// Empty string = API on same host (default for dotnet run and Docker).
const apiUrl = process.env.OLLADAN_API_URL ?? "";

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "js"), { recursive: true });
cpSync(join(root, "src", "css"), join(dist, "css"), { recursive: true });
cpSync(join(root, "src", "index.html"), join(dist, "index.html"));
cpSync(join(root, "src", "group.html"), join(dist, "group.html"));

const common = {
  bundle: true,
  format: "esm",
  target: "es2020",
  define: { OLLADAN_API_URL: JSON.stringify(apiUrl) },
};

await esbuild.build({
  ...common,
  entryPoints: [join(root, "src/ts/index.ts")],
  outfile: join(dist, "js/index.js"),
});
await esbuild.build({
  ...common,
  entryPoints: [join(root, "src/ts/group.ts")],
  outfile: join(dist, "js/group.js"),
});

rmSync(wwwroot, { recursive: true, force: true });
cpSync(dist, wwwroot, { recursive: true });

console.log(
  apiUrl === ""
    ? "Built → api/Ollodan.Api/wwwroot (same-origin API)"
    : `Built → wwwroot (API: ${apiUrl})`
);
