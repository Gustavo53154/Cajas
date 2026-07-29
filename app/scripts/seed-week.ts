// Seed completo: crea Admin (bootstrap), tienda, JE, cuentas Caja/Gerencia,
// personal y horarios de la semana actual.
// Ejecutar: npx tsx scripts/seed-week.ts

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as fs from "fs";
import * as path from "path";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("❌ Falta NEXT_PUBLIC_CONVEX_URL. Configúralo en .env.local");
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);
const root = path.resolve(__dirname, "..", "..");

const DEFAULT_PASSWORD = "12345678";

function readTxt(name: string): string {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8");
}

function norm(s: string) {
  return s.toUpperCase().replace(/\s+/g, " ").trim();
}

async function ensureAdmin(): Promise<string> {
  console.log("\n1️⃣  Asegurando Admin 'admin'...");
  try {
    const adminId = await convex.mutation((api as any).bootstrap.createFirstAdmin, {
      username: "admin",
      password: "Admin2026",
      nombre: "Administrador",
      apellido: "General",
    });
    console.log(`   ✅ Admin creado: ${adminId}`);
    return adminId;
  } catch (e: any) {
    if (e.message?.includes("Ya existe al menos un Admin")) {
      console.log("   ℹ️  Admin ya existe, intentando signIn...");
      const r: any = await convex.mutation(api.auth.signIn, { username: "admin", password: "Admin2026" });
      console.log(`   ✅ Admin encontrado: ${r.id}`);
      return r.id;
    }
    throw e;
  }
}

async function main() {
  console.log("🚀 Seed completo");
  console.log(`🔗 Convex URL: ${CONVEX_URL}`);

  const adminId = await ensureAdmin();

  // 1) JE
  console.log("\n2️⃣  Asegurando JE 'gtorres'...");
  let jeId: any;
  try {
    const r: any = await convex.mutation(api.auth.signIn, { username: "gtorres", password: DEFAULT_PASSWORD });
    jeId = r.id;
    console.log(`   ℹ️  JE 'gtorres' ya existe: ${jeId}`);
  } catch {
    const r: any = await convex.mutation(api.auth.createJefeEntrenador, {
      sessionAdminId: adminId,
      username: "gtorres",
      nombre: "Gustavo",
      apellido: "Torres",
    });
    jeId = r.id;
    console.log(`   ✅ JE creado: ${jeId} (pass: ${r.defaultPassword})`);
  }

  // 2) Tienda
  console.log("\n3️⃣  Tienda Plaza Vea Default...");
  const tiendaCodigo = "PLAZAVEA-DEFAULT";
  let tiendaId: any;
  const tiendas = await convex.query(api.tiendas.listTiendas, { session: { kind: "admin", id: adminId } });
  const existingTienda = tiendas?.find((t: any) => t.codigo === tiendaCodigo);
  if (existingTienda) {
    tiendaId = existingTienda._id;
    console.log(`   ℹ️  Tienda ya existe: ${tiendaId}`);
  } else {
    const r: any = await convex.mutation(api.tiendas.createTiendaFull, {
      sessionAdminId: adminId,
      nombre: "Plaza Vea",
      codigo: tiendaCodigo,
      direccion: "Av. Principal 123, Lima",
      nCajasRegulares: 18,
      nCajasRapidas: 6,
      nCajasSelf: 6,
      tienePersonalSelf: true,
      tienePersonalRs: true,
      jefeEntrenadorId: jeId,
    });
    tiendaId = r.tiendaId;
    console.log(`   ✅ Tienda creada: ${tiendaId}`);
    console.log(`   ✅ Caja:      ${r.caja.username} / ${r.caja.password}`);
    console.log(`   ✅ Gerencia:  ${r.gerencia.username} / ${r.gerencia.password}`);
  }

  // 3) Personal
  console.log("\n4️⃣  Cargando personal.txt...");
  const personalTxt = readTxt("personal.txt");
  const nicksTxt = readTxt("nicks.txt");
  const inhTxt = readTxt("inhabilitados.txt");
  const nicksMap = new Map<string, string>();
  if (nicksTxt) {
    for (const line of nicksTxt.split("\n").filter((l) => l.trim())) {
      const [full, , , nick] = line.split(",").map((s) => s?.trim());
      if (full && nick) nicksMap.set(norm(full), nick);
    }
  }
  const inhSet = new Set<string>();
  if (inhTxt) {
    for (const line of inhTxt.split("\n")) {
      const m = line.match(/^([^,]+),\s*(.+)$/);
      if (m) inhSet.add(norm(`${m[2].trim()} ${m[1].trim()}`));
    }
  }
  let count = 0;
  const personalLines = personalTxt.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const line of personalLines) {
    const [apellidos, nombres, cargo] = line.split(",").map((s) => s?.trim());
    if (!apellidos || !nombres || !cargo) continue;
    const key = norm(`${nombres} ${apellidos}`);
    const nick = nicksMap.get(key) ?? nombres.split(" ")[0];
    const soloCajaRapida = inhSet.has(key);
    const esAsistenteAutoservicio = cargo === "Self Checkout";
    try {
      await convex.mutation(api.personales.create, {
        tiendaId,
        apellidos,
        nombres,
        nick,
        cargo: cargo as any,
        soloCajaRapida,
        esAsistenteAutoservicio,
      });
      count++;
    } catch (e: any) {
      if (!e.message?.includes("Ya existe")) {
        console.warn(`   ⚠️  ${apellidos} ${nombres}: ${e.message}`);
      }
    }
  }
  console.log(`   ✅ ${count} personales creados/verificados`);

  // 4) Horario de esta semana
  console.log("\n5️⃣  Cargando horario.txt...");
  const horarioTxt = readTxt("horario.txt");
  if (!horarioTxt) {
    console.log("   ⚠️  No hay horario.txt");
  } else {
    const semanaId = await convex.mutation(api.horarios.getOrCreateSemanaActual, { tiendaId });
    const personalesList = await convex.query(api.personales.list, { tiendaId, soloActivos: false });
    const allMap = new Map<string, string>();
    for (const p of personalesList) {
      allMap.set(norm(`${p.nombres} ${p.apellidos}`), p._id);
    }
    let horariosCount = 0;
    const lineas = horarioTxt.split("\n").filter((l) => l.trim());
    for (const line of lineas) {
      const parts = line.split(",").map((s) => s?.trim());
      if (parts.length < 3) continue;
      const [apellidos, nombres, cargo, ...rest] = parts;
      const key = norm(`${nombres} ${apellidos}`);
      let personalId: any = allMap.get(key);
      if (!personalId) {
        const nick = nombres.split(" ")[0];
        try {
          personalId = await convex.mutation(api.personales.create, {
            tiendaId,
            apellidos,
            nombres,
            nick,
            cargo: cargo as any,
            soloCajaRapida: inhSet.has(key),
            esAsistenteAutoservicio: cargo === "Self Checkout",
          });
          allMap.set(key, personalId);
        } catch {
          continue;
        }
      }
      for (let dia = 1; dia <= 7; dia++) {
        const entrada = rest[(dia - 1) * 2];
        const salida = rest[(dia - 1) * 2 + 1];
        if (!entrada || !salida) continue;
        const descanso = entrada === "DESCANSO" && salida === "DESCANSO";
        try {
          await convex.mutation(api.horarios.setDia, {
            semanaId,
            personalId,
            dia,
            entrada: descanso ? undefined : entrada,
            salida: descanso ? undefined : salida,
            descanso,
          });
          horariosCount++;
        } catch {}
      }
    }
    console.log(`   ✅ ${horariosCount} días-persona cargados`);
  }

  console.log("\n🎉 ¡Seed completo!");
  console.log("\n📋 Credenciales:");
  console.log("   Admin:      admin / Admin2026");
  console.log("   JE:         gtorres / 12345678 (cambiar en primer login)");
  console.log(`   Caja:       caja-plazavea-default / 12345678 (cambiar)`);
  console.log(`   Gerencia:   gerencia-plazavea-default / 12345678 (cambiar)`);
}

main().catch((e) => {
  console.error("❌ Error en seed:", e);
  process.exit(1);
});
