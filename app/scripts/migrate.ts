// Script de migración: lee los .txt y sube a Convex
// Ejecutar: npx tsx scripts/migrate.ts
// Requiere: CONVEX_DEPLOY_KEY configurado y Convex dev corriendo

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as fs from "fs";
import * as path from "path";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("❌ Falta CONVEX_URL. Configúralo en .env.local");
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);
const root = path.resolve(__dirname, "..", "..");

function readTxt(name: string): string {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  No se encontró ${name}, saltando.`);
    return "";
  }
  return fs.readFileSync(p, "utf-8");
}

function norm(s: string) {
  return s.toUpperCase().replace(/\s+/g, " ").trim();
}

async function main() {
  console.log("🚀 Iniciando migración...");
  console.log(`📁 Carpeta raíz: ${root}`);
  console.log(`🔗 Convex URL: ${CONVEX_URL}`);

  // 1. Asegurar tienda
  const tiendaId = await convex.mutation(api.tiendas.ensureTiendaDefault, {
    nombre: "Plaza Vea",
    codigo: "PLAZAVEA-DEFAULT",
  });
  console.log(`✅ Tienda: ${tiendaId}`);

  // 2. Asegurar 30 cajas
  await convex.mutation(api.cajas.ensureCajas, { tiendaId });
  console.log(`✅ 30 cajas creadas/verificadas`);

  // 3. Leer personal.txt
  const personalTxt = readTxt("personal.txt");
  if (!personalTxt) {
    console.log("❌ No hay personal.txt");
    return;
  }
  const personalLines = personalTxt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  // 4. Leer nicks.txt
  const nicksTxt = readTxt("nicks.txt");
  const nicksMap = new Map<string, string>();
  if (nicksTxt) {
    for (const line of nicksTxt.split("\n").filter((l) => l.trim())) {
      const [full, , , nick] = line.split(",").map((s) => s?.trim());
      if (full && nick) nicksMap.set(norm(full), nick);
    }
  }

  // 5. Leer inhabilitados.txt -> soloCajaRapida
  const inhTxt = readTxt("inhabilitados.txt");
  const inhSet = new Set<string>();
  if (inhTxt) {
    for (const line of inhTxt.split("\n")) {
      const m = line.match(/^([^,]+),\s*(.+)$/);
      if (m) inhSet.add(norm(`${m[2].trim()} ${m[1].trim()}`));
    }
  }

  // 6. Crear personal
  let created = 0;
  const personalesCreados = new Map<string, any>();
  for (const line of personalLines) {
    const [apellidos, nombres, cargo] = line.split(",").map((s) => s?.trim());
    if (!apellidos || !nombres || !cargo) continue;
    const key = norm(`${nombres} ${apellidos}`);
    const nick = nicksMap.get(key) ?? nombres.split(" ")[0];
    const soloCajaRapida = inhSet.has(key);
    const id = await convex.mutation(api.personales.create, {
      tiendaId,
      apellidos,
      nombres,
      nick,
      cargo: cargo as any,
      soloCajaRapida,
      esAsistenteAutoservicio: cargo === "Self Checkout",
    });
    personalesCreados.set(key, id);
    created++;
  }
  console.log(`✅ Personal creado: ${created}`);

  // 7. Leer horario.txt
  const horarioTxt = readTxt("horario.txt");
  if (horarioTxt) {
    const semanaId = await convex.mutation(api.horarios.getOrCreateSemanaActual, { tiendaId });
    let diasAsignados = 0;
    const lineas = horarioTxt.split("\n").filter((l) => l.trim());
    for (const line of lineas) {
      const parts = line.split(",").map((s) => s?.trim());
      if (parts.length < 3) continue;
      const [apellidos, nombres, cargo, ...rest] = parts;
      const key = norm(`${nombres} ${apellidos}`);
      const personalId = personalesCreados.get(key);
      if (!personalId) continue;
      // rest tiene 14 valores: 7 días × 2 (entrada, salida)
      for (let dia = 1; dia <= 7; dia++) {
        const entrada = rest[(dia - 1) * 2];
        const salida = rest[(dia - 1) * 2 + 1];
        if (!entrada || !salida) continue;
        const descanso = entrada === "DESCANSO" && salida === "DESCANSO";
        await convex.mutation(api.horarios.setDia, {
          semanaId,
          personalId,
          dia,
          entrada: descanso ? undefined : entrada,
          salida: descanso ? undefined : salida,
          descanso,
        });
        diasAsignados++;
      }
    }
    console.log(`✅ Horario cargado: ${diasAsignados} días-persona`);
  } else {
    console.log("ℹ️  No hay horario.txt");
  }

  console.log("🎉 Migración completa!");
}

main().catch((e) => {
  console.error("❌ Error en migración:", e);
  process.exit(1);
});
