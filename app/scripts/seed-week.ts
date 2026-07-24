// Seed completo: crea tienda, 30 cajas, personal, semana actual con horarios
// Y crea un usuario supervisor
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

function readTxt(name: string): string {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8");
}

function norm(s: string) {
  return s.toUpperCase().replace(/\s+/g, " ").trim();
}

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const lunes = new Date(now);
  lunes.setUTCDate(lunes.getUTCDate() + diff);
  lunes.setUTCHours(0, 0, 0, 0);
  return lunes;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("🚀 Seed completo para esta semana");
  console.log(`🔗 Convex URL: ${CONVEX_URL}`);

  // 1. Tienda
  console.log("\n1️⃣  Creando tienda...");
  const tiendaId = await convex.mutation(api.tiendas.ensureTiendaDefault, {
    nombre: "Plaza Vea",
    codigo: "PLAZAVEA-DEFAULT",
  });
  console.log(`   ✅ Tienda: ${tiendaId}`);

  // 2. 30 cajas
  console.log("\n2️⃣  Creando 30 cajas...");
  const cajas = await convex.mutation(api.cajas.ensureCajas, { tiendaId });
  console.log(`   ✅ ${cajas.length} cajas creadas/verificadas`);

  // 3. Leer personal.txt y crear personales
  console.log("\n3️⃣  Cargando personal...");
  const personalTxt = readTxt("personal.txt");
  const nicksTxt = readTxt("nicks.txt");
  const inhTxt = readTxt("inhabilitados.txt");

  // Indexar nicks
  const nicksMap = new Map<string, string>();
  if (nicksTxt) {
    for (const line of nicksTxt.split("\n").filter((l) => l.trim())) {
      const [full, , , nick] = line.split(",").map((s) => s?.trim());
      if (full && nick) nicksMap.set(norm(full), nick);
    }
  }

  // Indexar inhabilitados
  const inhSet = new Set<string>();
  if (inhTxt) {
    for (const line of inhTxt.split("\n")) {
      const m = line.match(/^([^,]+),\s*(.+)$/);
      if (m) inhSet.add(norm(`${m[2].trim()} ${m[1].trim()}`));
    }
  }

  // Crear personales
  const personalLines = personalTxt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const personalMap = new Map<string, string>(); // nombreCompleto -> id
  let count = 0;
  for (const line of personalLines) {
    const [apellidos, nombres, cargo] = line.split(",").map((s) => s?.trim());
    if (!apellidos || !nombres || !cargo) continue;
    const key = norm(`${nombres} ${apellidos}`);
    const nick = nicksMap.get(key) ?? nombres.split(" ")[0];
    const soloCajaRapida = inhSet.has(key);
    const esAsistenteAutoservicio = cargo === "Self Checkout";
    try {
      const id = await convex.mutation(api.personales.create, {
        tiendaId,
        apellidos,
        nombres,
        nick,
        cargo: cargo as any,
        soloCajaRapida,
        esAsistenteAutoservicio,
      });
      personalMap.set(key, id);
      count++;
    } catch (e: any) {
      // Si ya existe, lo saltamos
      if (!e.message?.includes("Ya existe")) {
        console.warn(`   ⚠️  ${apellidos} ${nombres}: ${e.message}`);
      }
    }
  }
  console.log(`   ✅ ${count} personales creados/verificados`);

  // 4. Leer horario.txt y crear la semana con horarios
  console.log("\n4️⃣  Cargando horarios de la semana...");
  const horarioTxt = readTxt("horario.txt");
  if (!horarioTxt) {
    console.log("   ⚠️  No hay horario.txt");
  } else {
    const lunes = getWeekStart();
    const semanaId = await convex.mutation(api.horarios.getOrCreateSemanaActual, {
      tiendaId,
    });
    console.log(`   Semana: ${toISODate(lunes)} (id: ${semanaId})`);

    // Re-leer personales para tener la lista actualizada
    const personalesList = await convex.query(api.personales.list, {
      tiendaId,
      soloActivos: false,
    });
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
      let personalId = allMap.get(key);
      if (!personalId) {
        // Crear el personal si no existe
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
        } catch (e: any) {
          console.warn(`   ⚠️  No se pudo crear ${apellidos} ${nombres}`);
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
            personalId: personalId as any,
            dia,
            entrada: descanso ? undefined : entrada,
            salida: descanso ? undefined : salida,
            descanso,
          });
          horariosCount++;
        } catch (e: any) {
          console.warn(`   ⚠️  Error en ${apellidos} ${nombres} día ${dia}: ${e.message}`);
        }
      }
    }
    console.log(`   ✅ ${horariosCount} días-persona cargados`);
  }

  // 5. Crear usuario supervisor
  console.log("\n5️⃣  Creando usuario supervisor (gustavo.torres@plazavea.com.pe)...");
  try {
    const result = await convex.mutation(api.auth.signUp, {
      email: "gustavo.torres@plazavea.com.pe",
      password: "PlazaVea2026",
      nombreCompleto: "Gustavo Torres",
      tiendaId,
      rol: "Supervisor",
    });
    console.log(`   ✅ Usuario creado con id: ${result.userId}`);
  } catch (e: any) {
    if (e.message?.includes("Ya existe")) {
      console.log(`   ℹ️  Usuario ya existe`);
    } else {
      console.warn(`   ⚠️  ${e.message}`);
    }
  }

  // 6. Crear usuario admin también
  console.log("\n6️⃣  Creando usuario admin (admin@plazavea.com.pe)...");
  try {
    const result = await convex.mutation(api.auth.signUp, {
      email: "admin@plazavea.com.pe",
      password: "Admin2026",
      nombreCompleto: "Administrador",
      tiendaId,
      rol: "Admin",
    });
    console.log(`   ✅ Usuario admin creado: ${result.userId}`);
  } catch (e: any) {
    if (e.message?.includes("Ya existe")) {
      console.log(`   ℹ️  Usuario admin ya existe`);
    } else {
      console.warn(`   ⚠️  ${e.message}`);
    }
  }

  console.log("\n🎉 ¡Seed completo! Ahora puedes:");
  console.log("   1. cd app && npm run dev");
  console.log("   2. Abre http://localhost:3000");
  console.log("   3. Login con:");
  console.log("      - gustavo.torres@plazavea.com.pe / PlazaVea2026");
  console.log("      - admin@plazavea.com.pe / Admin2026");
}

main().catch((e) => {
  console.error("❌ Error en seed:", e);
  process.exit(1);
});
