// Crea el primer Admin sin requerir autenticación.
// Solo funciona si la tabla `admins` está vacía.
// Ejecutar: npx tsx scripts/bootstrap-admin.ts

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("❌ Falta NEXT_PUBLIC_CONVEX_URL");
  process.exit(1);
}
const convex = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log("🚀 Bootstrap primer Admin");
  const username = process.argv[2] || "admin";
  const password = process.argv[3] || "Admin2026";
  const nombre = process.argv[4] || "Administrador";
  const apellido = process.argv[5] || "General";

  try {
    const id = await convex.mutation((api as any).bootstrap.createFirstAdmin, {
      username,
      password,
      nombre,
      apellido,
    });
    console.log(`✅ Admin creado: ${id}`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
  } catch (e: any) {
    console.error("❌ Error:", e.message);
    process.exit(1);
  }
}

main();
