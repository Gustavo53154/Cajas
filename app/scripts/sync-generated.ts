// Sincroniza convex/_generated/ → src/convex/_generated/
// Ejecutar después de `npx convex dev` para mantener los archivos del cliente actualizados

import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "..");
const src = path.join(root, "convex", "_generated");
const dest = path.join(root, "src", "convex", "_generated");

if (!fs.existsSync(src)) {
  console.error(`❌ No existe ${src}. Ejecuta primero 'npx convex dev' para generar los archivos.`);
  process.exit(1);
}

if (!fs.existsSync(dest)) {
  fs.mkdirSync(dest, { recursive: true });
}

const files = fs.readdirSync(src);
for (const file of files) {
  if (file === "ai") continue; // No copiar la carpeta de AI
  const srcPath = path.join(src, file);
  const destPath = path.join(dest, file);
  const stat = fs.statSync(srcPath);
  if (stat.isFile()) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ ${file}`);
  }
}

console.log(`\n🎉 Archivos sincronizados: convex/_generated/ → src/convex/_generated/`);
