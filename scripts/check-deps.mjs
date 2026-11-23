// Roda sozinho antes do `npm run dev` e do `npm run build` (scripts "predev" e "prebuild").
// Se algum pacote do package.json não estiver em node_modules (por exemplo, logo depois de
// extrair uma versão nova do projeto), roda `npm install` antes de subir o Next.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter((name) => !existsSync(new URL(`node_modules/${name}/package.json`, root)));

if (missing.length > 0) {
  console.log(`\n[garimpo] Faltam pacotes: ${missing.join(", ")}. Instalando com npm install...\n`);
  execSync("npm install --no-audit --no-fund", { stdio: "inherit", cwd: fileURLToPath(root) });
}
