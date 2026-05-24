import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildAll, startWatch } from "./build-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await buildAll();
const stopWatch = await startWatch();

const api = spawn(
  "dotnet",
  ["watch", "run", "--project", join(root, "api", "Ollodan.Api")],
  { cwd: root, stdio: "inherit" }
);

console.log("[api] dotnet watch → http://localhost:5210");

const shutdown = (code = 0) => {
  stopWatch();
  api.kill("SIGTERM");
  process.exit(code);
};

api.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
