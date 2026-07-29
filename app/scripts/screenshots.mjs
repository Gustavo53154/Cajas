// scripts/screenshots.mjs
// Toma screenshots de las páginas de la app para usar en el README.
// Requisitos: dev server corriendo en http://localhost:3000
// Uso: node scripts/screenshots.mjs

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("./screenshots");
const VIEWPORT = { width: 1440, height: 900 };

const EMAIL = process.env.SCREENSHOT_EMAIL ?? "admin@plazavea.com.pe";
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? "Admin2026";
const NOMBRE = "Administrador";

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function settle(page, extraMs = 0) {
  // Espera a que Convex termine de cargar y los charts pinten
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000 + extraMs);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸  ${name}.png`);
}

async function ensureAccount(context) {
  // Intenta login primero
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#email", { timeout: 15000 });

  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);

  const submit = page.getByRole("button", { name: /Iniciar sesi/i });
  const errorVisible = await page
    .locator("text=Email o contraseña inválidos")
    .first()
    .isVisible()
    .catch(() => false);

  await submit.click();
  await page.waitForTimeout(3000);

  // Si sigue en /login, crear cuenta
  if (page.url().includes("/login")) {
    console.log("  ℹ️  Cuenta no existe, creando...");
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#email", { timeout: 15000 });
    const toggle = page.getByRole("button", { name: /Crear una/ });
    if (await toggle.isVisible().catch(() => false)) await toggle.click();
    await page.waitForTimeout(500);
    const nombreInput = page.locator("#nombre");
    if (await nombreInput.isVisible().catch(() => false)) {
      await nombreInput.fill(NOMBRE);
    }
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: /Crear cuenta/ }).click();
    await page.waitForTimeout(3000);
  }
  await page.close();
}

const PAGES = [
  { name: "01-login", url: "/login", auth: false },
  { name: "02-dashboard", url: "/" },
  { name: "03-personal", url: "/personal" },
  { name: "04-horarios", url: "/horarios" },
  { name: "05-cajas", url: "/cajas" },
  { name: "06-tablero", url: "/tablero" },
  { name: "07-funciones", url: "/funciones" },
  { name: "08-planillas", url: "/planillas" },
  { name: "09-cobertura", url: "/cobertura" },
  { name: "10-indicadores", url: "/indicadores" },
  { name: "11-velocidad", url: "/velocidad" },
  { name: "12-tinkas", url: "/tinkas" },
  { name: "13-tareas", url: "/tareas" },
  { name: "14-evaluaciones", url: "/evaluaciones" },
  { name: "15-inducciones", url: "/inducciones" },
  { name: "16-reuniones", url: "/reuniones" },
  { name: "17-capacitaciones", url: "/capacitaciones" },
  { name: "18-logs", url: "/logs" },
  { name: "19-notificaciones", url: "/notificaciones" },
  { name: "20-configuracion", url: "/configuracion" },
];

(async () => {
  console.log(`▶ Conectando a ${BASE} ...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, locale: "es-PE" });

  try {
    await ensureAccount(context);

    const page = await context.newPage();

    for (const p of PAGES) {
      console.log(`▶ ${p.url}`);
      try {
        if (p.url === "/login") {
          // Capturar pantalla de login (requiere desloguearse primero)
          await context.clearCookies();
          await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
        } else {
          await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded" });
        }
        await settle(page, p.wait ?? 0);
        await shot(page, p.name);
      } catch (err) {
        console.error(`  ✗ Error en ${p.url}:`, err.message);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  console.log("✅ Screenshots listos en", OUT);
})();
