// Builds r/<item>.json (what `eve add <url>` reads) and r/registry.json from registry/registry.json.
// The item is a shadcn registry item: each file's content is inlined, and {{version}} becomes
// this package's version so the scaffold and the package it installs always match.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(root, "registry", "registry.json"), "utf8").replaceAll("{{version}}", version));

mkdirSync(join(root, "r"), { recursive: true });
for (const item of registry.items) {
  const files = item.files.map((file) => ({ ...file, content: readFileSync(join(root, "registry", file.path), "utf8") }));
  writeFileSync(
    join(root, "r", `${item.name}.json`),
    JSON.stringify({ $schema: "https://ui.shadcn.com/schema/registry-item.json", ...item, files }, null, 2) + "\n",
  );
}
writeFileSync(join(root, "r", "registry.json"), JSON.stringify(registry, null, 2) + "\n");
console.log(`r/: ${registry.items.map((i) => i.name).join(", ")} @ ${version}`);
