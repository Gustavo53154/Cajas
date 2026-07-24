// Script de inicialización: crea la tienda por defecto y las 30 cajas
// Ejecutar: npx tsx scripts/seed.ts

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("❌ Falta NEXT_PUBLIC_CONVEX_URL. Configúralo en .env.local");
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log("🚀 Inicializando...");
  console.log(`🔗 Convex URL: ${CONVEX_URL}`);

  // 1. Crear tienda por defecto
  const tiendaId = await convex.mutation(api.tiendas.ensureTiendaDefault, {
    nombre: "Plaza Vea",
    codigo: "PLAZAVEA-DEFAULT",
  });
  console.log(`✅ Tienda creada/verificada: ${tiendaId}`);

  // 2. Crear las 30 cajas
  await convex.mutation(api.cajas.ensureCajas, { tiendaId });
  console.log(`✅ 30 cajas creadas/verificadas`);

  console.log("🎉 Inicialización completa!");
  console.log("");
  console.log("Ahora ve a http://localhost:3000 y crea tu cuenta.");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
