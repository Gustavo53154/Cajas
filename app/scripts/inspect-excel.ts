// Lee el archivo Excel de referencia para entender la estructura
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const file = process.argv[2];
if (!file) {
  console.error("Uso: tsx scripts/inspect-excel.ts <ruta>");
  process.exit(1);
}

const buffer = fs.readFileSync(file);
const wb = XLSX.read(buffer, { type: "buffer" });
console.log("Hojas:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log(`\n=== Hoja: ${name} (${data.length} filas) ===`);
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i] as any[];
    console.log(`F${i + 1}:`, row.slice(0, 12).map((c) => (c === null ? "·" : String(c).slice(0, 15))).join(" | "));
  }
}
