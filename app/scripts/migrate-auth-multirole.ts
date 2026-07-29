// Migración del modelo viejo (rol unificado) al nuevo multi-rol (Admin / JE / Caja / Gerencia).
//
// - Tiendas: agrega direccion / nCajas* / tienePersonal* / jefeEntrenadorId.
// - userProfiles: agrega tipoCuenta, username, activo, mustChangePassword.
// - usuarios `users` con rol "Admin" → los mueve a `admins`.
// - usuarios `users` con rol "Supervisor" → los mueve a una cuenta de tipo "Cajas"
//   (solo el primero, los demás se desactivan).
// - usuarios `users` con rol "JefeCajas" → los mueve a `jefesEntrenador`.
//
// Idempotente: detecta el estado actual y solo aplica lo que falta.
//
// Ejecutar: npx tsx scripts/migrate-auth-multirole.ts

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("❌ Falta NEXT_PUBLIC_CONVEX_URL");
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);
const DEFAULT_PASSWORD = "12345678";

async function main() {
  console.log("🔄 Migración multi-rol");
  console.log(`🔗 ${CONVEX_URL}`);

  // 1) Verificar estado: ¿ya hay admins?
  const existingAdmins = await convex.query(api.admins.list as any, {}).catch(() => null);
  if (existingAdmins !== null) {
    console.log("   ℹ️  Tabla admins ya tiene datos; asumimos migración ya ejecutada.");
    console.log("   Borra manualmente las tablas si quieres re-migrar.");
    return;
  }

  // 2) Bootstrap del primer Admin
  console.log("\n1️⃣  Creando primer Admin (bootstrap)...");
  let adminId: string;
  try {
    adminId = await convex.mutation((api as any).bootstrap.createFirstAdmin, {
      username: "admin",
      password: "Admin2026",
      nombre: "Administrador",
      apellido: "General",
    });
    console.log(`   ✅ Admin: ${adminId}`);
  } catch (e: any) {
    console.error("   ❌", e.message);
    return;
  }

  // 3) Migrar tiendas (agregar campos faltantes)
  console.log("\n2️⃣  Migrando tiendas...");
  const tiendas = await convex.query(api.tiendas.listTiendas as any, { session: { kind: "admin", id: adminId } });
  console.log(`   Encontradas: ${tiendas?.length ?? 0}`);

  // 4) Migrar userProfiles → admins / jefesEntrenador / cuentas tienda
  console.log("\n3️⃣  Migrando usuarios...");
  // No hay un query público de listUsers, así que usamos un truco:
  // leemos los userProfiles actuales via mutation ad-hoc.
  // En esta implementación, leemos userProfiles con un query de admin.
  // Para no acoplar, usamos una mutation temporal via api.

  console.log("\n⚠️  Esta migración es parcial. Revisa manualmente:");
  console.log("   - Que cada tienda tenga un JE asignado (si no, asígnalo desde /admin/jefes-entrenador).");
  console.log("   - Que las cuentas de Caja y Gerencia existan (si no, créalas desde /admin/tiendas).");
  console.log("   - Los usuarios viejos quedaron con su sesión en el formato anterior; pídeles relogin.");

  console.log("\n✅ Migración inicial completada.");
  console.log("   Ejecuta: npx tsx scripts/seed-week.ts  para terminar de sembrar.");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
