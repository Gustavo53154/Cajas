# DreamTeam Cajas

Plataforma de gestión del área de cajas para Plaza Vea (Next.js 16 + Convex).

## ✅ Estado actual: MVP completo y funcional

Los 18 módulos están implementados:
- Auth (custom con hash + localStorage), Personal, Horarios (con pegado masivo), Planillas ES, Cajas (algoritmo de 30 cajas), Tablero en vivo, Indicadores SIP, Velocidad, Tinkas, Evaluaciones, Inducciones, Reuniones, Tareas, Notificaciones, Auditoría.

## 🚀 Pasos para correrlo

### 1. Instalar dependencias (ya hecho)
```bash
cd app
npm install
```

### 2. Conectar Convex (ya conectado)
La URL está en `.env.local`:
```
NEXT_PUBLIC_CONVEX_URL=https://robust-orca-327.convex.cloud
```

### 3. Sembrar tienda y cajas (ya hecho)
```bash
set NEXT_PUBLIC_CONVEX_URL=https://robust-orca-327.convex.cloud
npx tsx scripts/seed.ts
```
Esto crea:
- Tienda "Plaza Vea" (idempotente)
- 30 cajas: 1-18 regulares (Caja 1 preferencial), 19-24 rápidas, 25-30 autoservicio

### 4. Migrar tus datos .txt (opcional)
```bash
npx tsx scripts/migrate.ts
```
Sube personal.txt, horario.txt, nicks.txt, inhabilitados.txt.

### 5. Iniciar la app
```bash
npm run dev
```
Abre http://localhost:3000

### 6. Crear tu cuenta
- Click "Crear cuenta"
- Email + contraseña (mín 8 caracteres) + nombre
- Te loguea y entras al dashboard

## 🔐 Auth

Se usa un auth simple custom (no Convex Auth):
- Email + contraseña con hash SHA-256
- Sesión en localStorage (userId)
- Para el MVP es suficiente (supervisor único o pocos usuarios por tienda)

Para producción, migrar a:
- Convex Auth completo (Password + Email providers)
- O auth externo (Clerk, Auth0)

## 📦 Módulos

| Módulo | Ruta | Función |
|---|---|---|
| Tablero en vivo | `/tablero` | Vista tiempo real + asignar/cambiar caja + refrigerio |
| Personal | `/personal` | CRUD cajeros con nick, soloCajaRapida, asistenteAutoservicio |
| Horarios | `/horarios` | Lista + celdas editables + pegado masivo + publicar |
| Planillas ES | `/planillas` | Mapa de entradas/salidas 15-min |
| Cajas | `/cajas` | Algoritmo 30 cajas con cascada + log de decisiones |
| Indicadores SIP | `/indicadores` | % débito / crédito (auto) / total + dashboard |
| Velocidad | `/velocidad` | Velocidad diaria por cajero + meta |
| Tinkas | `/tinkas` | Cantidad entera por día + ranking |
| Evaluaciones | `/evaluaciones` | Plantillas 0-20 / 0-100 / bool |
| Inducciones | `/inducciones` | Programar + marcar recibidos |
| Reuniones | `/reuniones` | 1, varios, específicos, toda el área |
| Tareas | `/tareas` | Recurrentes + del momento + plazo |
| Auditoría | `/auditoria` | Historial de cambios |

## 🏗️ Estructura
- `convex/` — backend (schema, queries, mutations)
- `src/app/(dashboard)/` — páginas del dashboard
- `src/components/` — UI components
- `src/hooks/useAuth.ts` — auth hook (localStorage)
- `src/lib/` — utilities
- `scripts/` — seed + migración
