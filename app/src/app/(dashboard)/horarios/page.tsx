"use client";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardPaste, Upload, Sparkles, Trash2, Download, Eye, CheckCircle2, AlertCircle, XCircle, Edit, Save, X } from "lucide-react";
import { DIAS_SEMANA, toISODate } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

const CARGO_BADGE: Record<string, string> = {
  "Cajer@": "bg-red-100 text-red-700",
  "Self Checkout": "bg-yellow-100 text-yellow-700",
  "RS": "bg-blue-100 text-blue-700",
  "Ecommerce": "bg-purple-100 text-purple-700",
  "Supervisor(@)": "bg-green-100 text-green-700",
  "JefeCajas": "bg-orange-100 text-orange-700",
};

const CARGOS = [
  { value: "Cajer@", label: "Cajer@" },
  { value: "Self Checkout", label: "Self Checkout" },
  { value: "RS", label: "Representante de Servicios" },
  { value: "Ecommerce", label: "Ecommerce" },
  { value: "Supervisor(@)", label: "Supervisor(a)" },
] as const;

function norm(s: string) {
  return s.toUpperCase().replace(/\s+/g, " ").trim();
}

function validarHora(hora: string): boolean {
  const m = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
}

function sumarHoras(hora: string, horas: number): string {
  const [hh, mm] = hora.split(":").map(Number);
  const totalMin = hh * 60 + mm + Math.round(horas * 60);
  const sh = Math.floor(totalMin / 60) % 24;
  const sm = totalMin % 60;
  return `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
}

function parseHorario(texto: string): { entrada: string; salida: string; descanso: boolean } | null {
  if (!texto) return null;
  const upper = texto.toUpperCase().trim();
  if (upper === "DESCANSO" || upper === "LIBRE" || upper === "D") {
    return { descanso: true, entrada: "", salida: "" };
  }
  const limpio = texto.trim();

  // Atajo: HH:MM++ → entrada + 9h (jornada completa)
  let m = limpio.match(/^(\d{1,2}):?(\d{2})?\s*\+\+$/);
  if (m) {
    const entrada = `${m[1].padStart(2, "0")}:${(m[2] || "00").padStart(2, "0")}`;
    if (!validarHora(entrada)) return null;
    return { descanso: false, entrada, salida: sumarHoras(entrada, 9) };
  }

  // Atajo: HH:MM+ → entrada + 4:30 (part time)
  m = limpio.match(/^(\d{1,2}):?(\d{2})?\s*\+$/);
  if (m) {
    const entrada = `${m[1].padStart(2, "0")}:${(m[2] || "00").padStart(2, "0")}`;
    if (!validarHora(entrada)) return null;
    return { descanso: false, entrada, salida: sumarHoras(entrada, 4.5) };
  }

  // Solo entrada: HH:MM (sin salida, se asigna después con +4.5 o +9)
  m = limpio.match(/^(\d{1,2}):?(\d{2})?$/);
  if (m) {
    const entrada = `${m[1].padStart(2, "0")}:${(m[2] || "00").padStart(2, "0")}`;
    if (!validarHora(entrada)) return null;
    return { descanso: false, entrada, salida: "" };
  }

  // Rango completo: HH:MM-HH:MM
  m = limpio.match(/^(\d{1,2}):?(\d{2})?\s*-\s*(\d{1,2}):?(\d{2})?$/);
  if (m) {
    const entrada = `${m[1].padStart(2, "0")}:${(m[2] || "00").padStart(2, "0")}`;
    const salida = `${m[3].padStart(2, "0")}:${(m[4] || "00").padStart(2, "0")}`;
    if (!validarHora(entrada) || !validarHora(salida)) return null;
    if (entrada >= salida) return null;
    return { descanso: false, entrada, salida };
  }

  return null;
}

function parsePegado(texto: string, personales: any[]) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const result: { linea: number; texto: string; estado: "ok" | "warning" | "error"; mensaje: string; nombreCompleto: string; dias: any[] }[] = [];
  const map = new Map<string, any>();
  for (const p of personales) {
    map.set(norm(`${p.apellidos} ${p.nombres}`), p);
    map.set(norm(`${p.nombres} ${p.apellidos}`), p);
    map.set(norm(p.nick), p);
  }
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const partes = linea.split("|").map((s) => s.trim());
    if (partes.length < 8) {
      result.push({ linea: i + 1, texto: linea, estado: "error", mensaje: "Faltan columnas (esperado: nombre + 7 días)", nombreCompleto: "", dias: [] });
      continue;
    }
    const nombre = partes[0];
    const persona = map.get(norm(nombre));
    if (!persona) {
      result.push({ linea: i + 1, texto: linea, estado: "warning", mensaje: "Nombre no encontrado", nombreCompleto: nombre, dias: [] });
      continue;
    }
    const dias: any[] = [];
    let errorEnDias = false;
    for (let d = 1; d <= 7; d++) {
      const v = partes[d];
      if (!v) {
        dias.push({ descanso: true });
        continue;
      }
      const h = parseHorario(v);
      if (h) {
        dias.push(h);
      } else {
        errorEnDias = true;
        dias.push({ descanso: true });
      }
    }
    result.push({
      linea: i + 1,
      texto: linea,
      estado: errorEnDias ? "error" : "ok",
      mensaje: errorEnDias ? "Formato de hora inválido" : `OK (${persona.cargo})`,
      nombreCompleto: nombre,
      dias,
    });
  }
  return result;
}

function generarPlantilla(personales: any[]) {
  return [
    "# Formato: NOMBRE_COMPLETO | LUN | MAR | MIE | JUE | VIE | SAB | DOM",
    "# Los ':' son opcionales: 1545 = 15:45, 15 = 15:00.",
    "# Día: HH:MM-HH:MM | HH:MM (solo entrada) | HH:MM+ (+4:30) | HH:MM++ (+9h) | DESCANSO | vacío",
    "# Ejemplo:",
    "# MARTINEZ PAZ, ROCIO ESPERANZA | 10:00-19:00 | 09:00+ | 09:00++ | 10:00-19:00 | 09:00-18:00 | 07:00 | DESCANSO",
    "",
    ...personales.map((p) => `${p.apellidos}, ${p.nombres} | DESCANSO | DESCANSO | DESCANSO | DESCANSO | DESCANSO | DESCANSO | DESCANSO`),
  ].join("\n");
}

export default function HorariosPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const semanas = useQuery(api.horarios.listSemanas, tienda ? { tiendaId: tienda._id } : "skip");
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );
  const getOrCreateSemana = useMutation(api.horarios.getOrCreateSemanaActual);

  const [semanaId, setSemanaId] = useState<Id<"semanas"> | null>(null);
  const [tab, setTab] = useState<"tabla" | "masivo" | "publicar">("tabla");
  const [filtroCargo, setFiltroCargo] = useState<string>("ALL");
  const [soloSinHorario, setSoloSinHorario] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (tienda && !semanaId) {
      getOrCreateSemana({ tiendaId: tienda._id })
        .then(setSemanaId)
        .catch(console.error);
    }
  }, [tienda, semanaId, getOrCreateSemana]);

  if (!tienda) {
    return <div className="p-6">Cargando tienda...</div>;
  }

  if (!semanaId) {
    return <div className="p-6">Cargando semana...</div>;
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Horarios</h1>
          <p className="text-sm text-muted-foreground">Semana actual y semanas anteriores</p>
        </div>
        <SemanaSelector
          semanas={semanas ?? []}
          semanaId={semanaId}
          onChange={setSemanaId}
          tiendaId={tienda._id}
        />
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="tabla">📋 Tabla de personal</TabsTrigger>
          <TabsTrigger value="masivo">
            <ClipboardPaste className="h-4 w-4 mr-1" /> Pegado masivo
          </TabsTrigger>
          <TabsTrigger value="publicar">
            <Eye className="h-4 w-4 mr-1" /> Publicar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tabla">
          <TablaHorarios
            semanaId={semanaId}
            tiendaId={tienda._id}
            personales={personales ?? []}
            filtroCargo={filtroCargo}
            busqueda={busqueda}
            setFiltroCargo={setFiltroCargo}
            setBusqueda={setBusqueda}
            soloSinHorario={soloSinHorario}
            setSoloSinHorario={setSoloSinHorario}
          />
        </TabsContent>

        <TabsContent value="masivo">
          <PegadoMasivo semanaId={semanaId} personales={personales ?? []} />
        </TabsContent>

        <TabsContent value="publicar">
          <VistaPublicar semanaId={semanaId} personales={personales ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SemanaSelector({ semanas, semanaId, onChange, tiendaId }: any) {
  const getOrCreate = useMutation(api.horarios.getOrCreateSemanaActual);
  return (
    <div className="flex items-center gap-2">
      <Select value={semanaId} onValueChange={(v) => onChange(v as Id<"semanas">)}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Selecciona semana" />
        </SelectTrigger>
        <SelectContent>
          {semanas?.map((s: any) => (
            <SelectItem key={s._id} value={s._id}>
              {s.fechaInicio} → {s.fechaFin} ({s.estado})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        onClick={async () => {
          const id = await getOrCreate({ tiendaId });
          onChange(id);
          toast.success("Nueva semana creada");
        }}
      >
        <Sparkles className="h-4 w-4 mr-1" /> Esta semana
      </Button>
    </div>
  );
}

function TablaHorarios({
  semanaId,
  tiendaId: tiendaIdValue,
  personales,
  filtroCargo,
  busqueda,
  setFiltroCargo,
  setBusqueda,
  soloSinHorario,
  setSoloSinHorario,
}: any) {
  const horarios = useQuery(api.horarios.getHorariosSemana, { semanaId });
  const setDia = useMutation(api.horarios.setDia);
  const create = useMutation(api.personales.create);
  const update = useMutation(api.personales.update);
  const remove = useMutation(api.personales.remove);
  const toggleRapida = useMutation(api.personales.toggleSoloCajaRapida);
  const clearHorario = useMutation(api.horarios.clearHorarioPersona);

  // Map (personalId, dia) -> horario
  const map = useMemo(() => {
    const m = new Map<string, any>();
    horarios?.forEach((h: any) => m.set(`${h.personalId}-${h.dia}`, h));
    return m;
  }, [horarios]);

  // Personas SIN horario: tienen al menos un día incompleto.
  // Un día está incompleto si:
  //   - está vacío (sin entrada ni descanso), o
  //   - tiene entrada pero le falta la salida (→?)
  // "Con horario" = los 7 días están completos (hora completa o descanso).
  const sinHorario = useMemo(() => {
    return personales
      .filter((p: any) => {
        for (let d = 1; d <= 7; d++) {
          const h = map.get(`${p._id}-${d}`);
          if (!h) return true; // día vacío
          if (h.descanso) continue; // día completo
          if (h.entrada && h.salida) continue; // día completo (hora con entrada y salida)
          return true; // día incompleto (entrada sin salida)
        }
        return false;
      })
      .sort((a: any, b: any) => a.apellidos.localeCompare(b.apellidos));
  }, [personales, map]);

  // Filtrar personas
  const filtered = useMemo(() => {
    return personales
      .filter((p: any) => filtroCargo === "ALL" || p.cargo === filtroCargo)
      .filter((p: any) => {
        if (soloSinHorario) {
          for (let d = 1; d <= 7; d++) {
            const h = map.get(`${p._id}-${d}`);
            if (!h) return true;
            if (h.descanso) continue;
            if (h.entrada && h.salida) continue;
            return true;
          }
          return false;
        }
        return true;
      })
      .filter((p: any) => {
        if (!busqueda) return true;
        const q = busqueda.toUpperCase();
        return p.apellidos.includes(q) || p.nombres.includes(q) || p.nick.toUpperCase().includes(q);
      })
      .sort((a: any, b: any) => a.apellidos.localeCompare(b.apellidos));
  }, [personales, filtroCargo, busqueda, soloSinHorario, map]);

  // Estado de edición inline por celda
  const [editando, setEditando] = useState<{ personalId: string; dia: number } | null>(null);
  const [valorTemp, setValorTemp] = useState("");

  function iniciarEdicion(personalId: string, dia: number, valorActual: string) {
    setEditando({ personalId, dia });
    setValorTemp(valorActual);
  }

  async function guardarEdicion(personalId: string, dia: number) {
    const h = parseHorario(valorTemp);
    if (valorTemp.trim() !== "" && !h) {
      toast.error("Formato inválido. Ejemplos válidos: 15:00, 1500, 15, 15:45, 1545, 15:00-19:30, 15:00+, 15:00++, DESCANSO.");
      return;
    }
    try {
      await setDia({
        semanaId,
        personalId: personalId as Id<"personales">,
        dia,
        descanso: h ? h.descanso : true,
        entrada: h && !h.descanso ? h.entrada : undefined,
        salida: h && !h.descanso && h.salida ? h.salida : undefined,
      });
      setEditando(null);
      if (h?.descanso) toast.success("Descanso guardado");
      else if (h && !h.salida) toast.success("Entrada guardada. Usa los botones +4.5 o +9 para asignar la salida");
      else toast.success("Horario guardado");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function aplicarAJornada(personalId: string, horas: number) {
    for (let d = 1; d <= 7; d++) {
      const h = map.get(`${personalId}-${d}`);
      if (!h || h.descanso) continue;
      const e = h.entrada;
      if (!e) continue;
      const [hh, mm] = e.split(":").map(Number);
      const totalMin = hh * 60 + mm + horas * 60;
      const sh = Math.floor(totalMin / 60) % 24;
      const sm = totalMin % 60;
      const salida = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
      await setDia({
        semanaId,
        personalId: personalId as Id<"personales">,
        dia: d,
        descanso: false,
        entrada: e,
        salida,
      });
    }
    toast.success(`Jornada +${horas}h aplicada`);
  }

  async function handleLimpiarHorario(personalId: string, nombre: string) {
    if (!confirm(`¿Limpiar TODO el horario de ${nombre} en esta semana? Quedará sin horario asignado (aparecerá en la lista de "sin horario").`)) return;
    try {
      await clearHorario({ semanaId, personalId: personalId as Id<"personales"> });
      toast.success("Horario limpiado");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleEliminarPersona(personalId: string, nombre: string) {
    if (!confirm(`⚠️ ¿ELIMINAR a ${nombre} de la lista de personal? Esto es permanente (soft delete). Usa solo si la persona ya no trabaja.`)) return;
    try {
      await remove({ id: personalId as Id<"personales"> });
      toast.success("Personal eliminado");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const [editandoPersona, setEditandoPersona] = useState<any | null>(null);
  const [creandoPersona, setCreandoPersona] = useState(false);
  const [personaForm, setPersonaForm] = useState({
    apellidos: "",
    nombres: "",
    nick: "",
    cargo: "Cajer@" as any,
    codigoEmpleado: "",
    codigoOperadorCaja: "",
    soloCajaRapida: false,
    esAsistenteAutoservicio: false,
  });

  async function handleGuardarPersona() {
    if (!personaForm.apellidos || !personaForm.nombres || !personaForm.nick) {
      toast.error("Completa los campos requeridos");
      return;
    }
    try {
      if (editandoPersona) {
        await update({
          id: editandoPersona._id,
          apellidos: personaForm.apellidos,
          nombres: personaForm.nombres,
          nick: personaForm.nick,
          cargo: personaForm.cargo,
          codigoEmpleado: personaForm.codigoEmpleado || undefined,
          codigoOperadorCaja: personaForm.codigoOperadorCaja || undefined,
          soloCajaRapida: personaForm.soloCajaRapida,
          esAsistenteAutoservicio: personaForm.esAsistenteAutoservicio,
        });
        toast.success("Personal actualizado");
      } else {
        await create({
          tiendaId: tiendaId(),
          apellidos: personaForm.apellidos,
          nombres: personaForm.nombres,
          nick: personaForm.nick,
          cargo: personaForm.cargo,
          codigoEmpleado: personaForm.codigoEmpleado || undefined,
          codigoOperadorCaja: personaForm.codigoOperadorCaja || undefined,
          soloCajaRapida: personaForm.soloCajaRapida,
          esAsistenteAutoservicio: personaForm.esAsistenteAutoservicio,
        });
        toast.success("Personal creado");
      }
      setEditandoPersona(null);
      setCreandoPersona(false);
      setPersonaForm({
        apellidos: "",
        nombres: "",
        nick: "",
        cargo: "Cajer@",
        codigoEmpleado: "",
        codigoOperadorCaja: "",
        soloCajaRapida: false,
        esAsistenteAutoservicio: false,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function abrirEditarPersona(p: any) {
    setEditandoPersona(p);
    setPersonaForm({
      apellidos: p.apellidos,
      nombres: p.nombres,
      nick: p.nick,
      cargo: p.cargo,
      codigoEmpleado: p.codigoEmpleado ?? "",
      codigoOperadorCaja: p.codigoOperadorCaja ?? "",
      soloCajaRapida: p.soloCajaRapida,
      esAsistenteAutoservicio: p.esAsistenteAutoservicio,
    });
  }

  return (
    <div className="space-y-3">
      {/* Banner de personal sin horario */}
      {sinHorario.length > 0 && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div>
                <div className="font-semibold text-orange-700 flex items-center gap-2">
                  ⚠️ {sinHorario.length} {sinHorario.length === 1 ? "persona sin" : "personas sin"} horario
                </div>
                <div className="text-xs text-orange-600">
                  Tienen al menos un día incompleto (vacío, o con hora de entrada sin salida)
                </div>
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={() => setSoloSinHorario(true)}
              >
                Ver solo estos
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sinHorario.map((p: any) => (
                <Badge
                  key={p._id}
                  variant="outline"
                  className={`text-[10px] ${CARGO_BADGE[p.cargo] ?? "bg-gray-100"}`}
                >
                  {p.apellidos.split(" ")[0]} {p.nick || p.nombres.split(" ")[0]} ({p.cargo})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nombre o nick..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="max-w-xs"
          />
          <Select value={filtroCargo} onValueChange={setFiltroCargo}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los cargos</SelectItem>
              {CARGOS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary">{filtered.length} personas</Badge>

          {/* Switch: solo sin horario */}
          <label className="flex items-center gap-2 px-3 py-1 rounded border bg-background cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              checked={soloSinHorario}
              onChange={(e) => setSoloSinHorario(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Solo sin horario</span>
          </label>
          <div className="ml-auto">
            <Dialog open={creandoPersona || !!editandoPersona} onOpenChange={(o) => {
              if (!o) {
                setCreandoPersona(false);
                setEditandoPersona(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => setCreandoPersona(true)}>
                  <Sparkles className="h-4 w-4 mr-1" /> Nuevo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editandoPersona ? "Editar" : "Nuevo"} personal</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Apellidos *</Label>
                      <Input
                        value={personaForm.apellidos}
                        onChange={(e) => setPersonaForm({ ...personaForm, apellidos: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Nombres *</Label>
                      <Input
                        value={personaForm.nombres}
                        onChange={(e) => setPersonaForm({ ...personaForm, nombres: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Nick *</Label>
                    <Input
                      value={personaForm.nick}
                      onChange={(e) => setPersonaForm({ ...personaForm, nick: e.target.value })}
                      placeholder="Cómo le gusta que le llamen"
                    />
                  </div>
                  <div>
                    <Label>Cargo *</Label>
                    <Select
                      value={personaForm.cargo}
                      onValueChange={(v: any) => setPersonaForm({ ...personaForm, cargo: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CARGOS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Cód. Empleado</Label>
                      <Input
                        value={personaForm.codigoEmpleado}
                        onChange={(e) => setPersonaForm({ ...personaForm, codigoEmpleado: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Cód. Operador Caja</Label>
                      <Input
                        value={personaForm.codigoOperadorCaja}
                        onChange={(e) => setPersonaForm({ ...personaForm, codigoOperadorCaja: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="text-sm font-medium">Solo caja rápida</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={personaForm.soloCajaRapida}
                      onChange={(e) => setPersonaForm({ ...personaForm, soloCajaRapida: e.target.checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="text-sm font-medium">Asistente autoservicio</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={personaForm.esAsistenteAutoservicio}
                      onChange={(e) => setPersonaForm({ ...personaForm, esAsistenteAutoservicio: e.target.checked })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                  <Button onClick={handleGuardarPersona}>Guardar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Leyenda */}
      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap px-1">
        <span>Click en una celda para editar. Los <code className="bg-muted px-1 rounded">:</code> son opcionales: <code className="bg-muted px-1 rounded">1545</code> = 15:45, <code className="bg-muted px-1 rounded">15</code> = 15:00.</span>
        <span>·</span>
        <span>Atajos: <code className="bg-muted px-1 rounded">HH:MM+</code> (4:30), <code className="bg-muted px-1 rounded">HH:MM++</code> (9h), <code className="bg-muted px-1 rounded">DESCANSO</code></span>
      </div>

      {/* Tabla principal */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-muted z-20 min-w-[180px] border-r">Cajero</th>
                <th className="text-left p-2 sticky left-[180px] bg-muted z-20 min-w-[100px] border-r">Cargo</th>
                {DIAS_SEMANA.map((dia, i) => (
                  <th key={i} className="text-center p-2 min-w-[110px] border-r">{dia.slice(0, 3).toUpperCase()}</th>
                ))}
                <th className="text-center p-2 min-w-[180px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p._id} className="border-b hover:bg-muted/30">
                  <td className="p-2 sticky left-0 bg-background z-10 border-r">
                    <div className="font-medium text-sm">{p.apellidos} {p.nombres}</div>
                    <div className="text-xs text-muted-foreground">Nick: <span className="font-mono">{p.nick}</span></div>
                    {p.codigoEmpleado && (
                      <div className="text-[10px] text-muted-foreground">Cód: {p.codigoEmpleado}</div>
                    )}
                  </td>
                  <td className="p-2 sticky left-[180px] bg-background z-10 border-r">
                    <Badge className={CARGO_BADGE[p.cargo] ?? "bg-gray-100"} variant="secondary">
                      {p.cargo}
                    </Badge>
                    {p.soloCajaRapida && <Badge variant="warning" className="text-[9px] mt-1 block w-fit">⚡Rápida</Badge>}
                    {p.esAsistenteAutoservicio && <Badge variant="secondary" className="text-[9px] mt-1 block w-fit">Asistente</Badge>}
                  </td>
                  {DIAS_SEMANA.map((dia, i) => {
                    const d = i + 1;
                    const h = map.get(`${p._id}-${d}`);
                    const valor = h?.descanso ? "DESCANSO" : h ? (h.salida ? `${h.entrada}-${h.salida}` : h.entrada) : "";
                    const isEditing = editando?.personalId === p._id && editando?.dia === d;
                    return (
                      <td
                        key={d}
                        className={`p-1 text-center border-r ${h?.descanso ? "bg-gray-50" : h ? (h.salida ? "bg-green-50" : "bg-amber-50") : "bg-yellow-50"}`}
                        onClick={() => !isEditing && iniciarEdicion(p._id, d, valor)}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-0.5">
                            <Input
                              autoFocus
                              value={valorTemp}
                              onChange={(e) => setValorTemp(e.target.value)}
                              onBlur={() => guardarEdicion(p._id, d)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") guardarEdicion(p._id, d);
                                if (e.key === "Escape") setEditando(null);
                              }}
                              placeholder="15:00 · 1500 · 15 · 15:00+ · 15:00-19:30"
                              className="h-7 text-xs px-1"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                guardarEdicion(p._id, d);
                              }}
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : h?.descanso ? (
                          <span className="text-xs text-muted-foreground italic">DESC</span>
                        ) : h ? (
                          <span className="text-xs font-mono font-semibold">
                            {h.entrada}
                            {h.salida ? `-${h.salida}` : <span className="text-orange-600 ml-0.5">→?</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2">
                    <div className="flex items-center gap-1 justify-center flex-wrap">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => aplicarAJornada(p._id, 4.5)}
                        title="Aplicar +4h30 a todas las jornadas"
                        className="h-7 w-7 text-xs"
                      >
                        +4.5
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => aplicarAJornada(p._id, 9)}
                        title="Aplicar +9h a todas las jornadas"
                        className="h-7 w-7 text-xs"
                      >
                        +9
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => abrirEditarPersona(p)}
                        title="Editar persona"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleRapida({ id: p._id })}
                        title="Toggle solo caja rápida"
                      >
                        ⚡
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleLimpiarHorario(p._id, `${p.apellidos} ${p.nombres}`)}
                        title="Limpiar TODO el horario de esta semana (la persona quedará sin horario)"
                        className="h-7 w-7"
                      >
                        🗑️
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEliminarPersona(p._id, `${p.apellidos} ${p.nombres}`)}
                        title="⚠️ Eliminar persona de la lista (soft delete)"
                        className="hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    No hay personal que coincida con los filtros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  function tiendaId(): Id<"tiendas"> {
    return tiendaIdValue;
  }
}

function PegadoMasivo({ semanaId, personales }: any) {
  const importar = useMutation(api.horarios.importarMasivo);
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"reemplazar" | "fusionar">("reemplazar");
  const [preview, setPreview] = useState<ReturnType<typeof parsePegado>>([]);

  const parsed = parsePegado(texto, personales);
  const totalOK = parsed.filter((p) => p.estado === "ok").length;
  const totalWarn = parsed.filter((p) => p.estado === "warning").length;
  const totalErr = parsed.filter((p) => p.estado === "error").length;

  async function ejecutar() {
    if (totalOK === 0) {
      toast.error("No hay líneas válidas para importar");
      return;
    }
    const lineas = parsed
      .filter((p) => p.estado !== "error" && p.dias.length === 7)
      .map((p) => ({ nombreCompleto: p.nombreCompleto, dias: p.dias }));
    try {
      const res = await importar({ semanaId, lineas, modo });
      toast.success(`Importado: ${res.creados} creados, ${res.actualizados} actualizados. Errores: ${res.errores.length}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function descargarPlantilla() {
    const contenido = generarPlantilla(personales);
    const blob = new Blob([contenido], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_horarios.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5" />
            Pegado masivo
          </CardTitle>
          <CardDescription>
            Pega líneas con formato: <code className="text-xs bg-muted px-1 rounded">NOMBRE | LUN | MAR | MIE | JUE | VIE | SAB | DOM</code>
            <br />
            Los <code className="text-xs bg-muted px-1 rounded">:</code> son opcionales (1545 = 15:45). Cada día: <code className="text-xs bg-muted px-1 rounded">HH:MM-HH:MM</code>, <code className="text-xs bg-muted px-1 rounded">HH:MM</code> (solo entrada), <code className="text-xs bg-muted px-1 rounded">HH:MM+</code> (+4:30), <code className="text-xs bg-muted px-1 rounded">HH:MM++</code> (+9h), <code className="text-xs bg-muted px-1 rounded">DESCANSO</code> o vacío.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={descargarPlantilla}>
              <Download className="h-4 w-4 mr-1" /> Descargar plantilla
            </Button>
            <Select value={modo} onValueChange={(v: any) => setModo(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reemplazar">Reemplazar (sobrescribe)</SelectItem>
                <SelectItem value="fusionar">Fusionar (respeta vacíos)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pega aquí tu horario..."
            className="font-mono text-xs min-h-[200px]"
          />
          {texto && (
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" /> {totalOK} OK</Badge>
              {totalWarn > 0 && <Badge variant="warning"><AlertCircle className="h-3 w-3 mr-1" /> {totalWarn} no encontrados</Badge>}
              {totalErr > 0 && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> {totalErr} con error</Badge>}
            </div>
          )}
          <Button onClick={ejecutar} disabled={!texto || totalOK === 0}>
            <Upload className="h-4 w-4 mr-2" /> Importar {totalOK} líneas
          </Button>
        </CardContent>
      </Card>
      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs font-mono max-h-60 overflow-y-auto">
              {parsed.slice(0, 50).map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  {p.estado === "ok" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                  {p.estado === "warning" && <AlertCircle className="h-3 w-3 text-yellow-500" />}
                  {p.estado === "error" && <XCircle className="h-3 w-3 text-red-500" />}
                  <span className="text-muted-foreground">L{p.linea}:</span>
                  <span className="truncate flex-1">{p.texto}</span>
                  <span className="text-muted-foreground">{p.mensaje}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VistaPublicar({ semanaId, personales }: any) {
  const semana = useQuery(api.horarios.getSemana, { id: semanaId });
  const horarios = useQuery(api.horarios.getHorariosSemana, { semanaId });
  const publicar = useMutation(api.horarios.publicarSemana);
  const map = new Map<string, any>();
  horarios?.forEach((h: any) => map.set(`${h.personalId}-${h.dia}`, h));

  const [filtroCargo, setFiltroCargo] = useState<string>("ALL");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  // Inicializar todos seleccionados cuando cargan los personales
  useMemo(() => {
    if (personales.length > 0 && seleccionados.size === 0) {
      setSeleccionados(new Set(personales.map((p: any) => p._id)));
    }
  }, [personales.length]);

  const personalesFiltrados = personales.filter((p: any) => filtroCargo === "ALL" || p.cargo === filtroCargo);
  const personalesSeleccionados = personalesFiltrados.filter((p: any) => seleccionados.has(p._id));

  function toggleSeleccion(id: string) {
    const nuevo = new Set(seleccionados);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    setSeleccionados(nuevo);
  }

  function toggleTodo(cargo: string = "ALL") {
    const subset = personalesFiltrados.filter((p: any) => cargo === "ALL" || p.cargo === cargo);
    const allSelected = subset.every((p: any) => seleccionados.has(p._id));
    const nuevo = new Set(seleccionados);
    if (allSelected) {
      subset.forEach((p: any) => nuevo.delete(p._id));
    } else {
      subset.forEach((p: any) => nuevo.add(p._id));
    }
    setSeleccionados(nuevo);
  }

  async function exportPdf() {
    if (personalesSeleccionados.length === 0) {
      toast.error("Selecciona al menos una persona");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const usableWidth = pageWidth - 2 * margin;
    // Ancho fijo para nombre (60) + cargo (28) = 88 mm
    const labelWidth = 60;
    const cargoWidth = 22;
    const daysStartX = margin + labelWidth + cargoWidth;
    const daysAreaWidth = usableWidth - labelWidth - cargoWidth;
    const colWidth = daysAreaWidth / 7; // ancho por día dinámico según página
    const rowHeight = 6;
    const titleY = margin;

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`HORARIO SEMANA ${semana?.fechaInicio} → ${semana?.fechaFin}`, margin, titleY + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      `Plaza Vea · Generado: ${new Date().toLocaleString("es-PE")} · ${personalesSeleccionados.length} personas`,
      margin,
      titleY + 9,
    );

    // Cabecera de tabla
    const tableY = titleY + 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, tableY, usableWidth, rowHeight, "F");
    doc.text("Apellidos, Nombres (Nick)", margin + 1, tableY + 4);
    doc.text("Cargo", margin + labelWidth + 1, tableY + 4);
    DIAS_SEMANA.forEach((dia, i) => {
      doc.text(
        dia.slice(0, 3).toUpperCase(),
        daysStartX + i * colWidth + colWidth / 2,
        tableY + 4,
        { align: "center" },
      );
    });

    // Filas
    let y = tableY + rowHeight;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (const p of personalesSeleccionados) {
      if (y > pageHeight - margin - 2) {
        doc.addPage();
        y = margin;
        // Repetir cabecera en página nueva
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setFillColor(230, 230, 230);
        doc.rect(margin, y, usableWidth, rowHeight, "F");
        doc.text("Apellidos, Nombres (Nick)", margin + 1, y + 4);
        doc.text("Cargo", margin + labelWidth + 1, y + 4);
        DIAS_SEMANA.forEach((dia, i) => {
          doc.text(
            dia.slice(0, 3).toUpperCase(),
            daysStartX + i * colWidth + colWidth / 2,
            y + 4,
            { align: "center" },
          );
        });
        y += rowHeight;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
      }
      doc.text(`${p.apellidos} ${p.nombres}`, margin + 1, y + 3.5, { maxWidth: labelWidth - 2 });
      doc.setFontSize(6);
      doc.text(p.nick, margin + 1, y + 5.5, { maxWidth: labelWidth - 2 });
      doc.setFontSize(7);
      doc.text(p.cargo, margin + labelWidth + 1, y + 3.5, { maxWidth: cargoWidth - 2 });
      DIAS_SEMANA.forEach((dia, i) => {
        const d = i + 1;
        const h = map.get(`${p._id}-${d}`);
        const txt = !h || h.descanso ? "DESC" : h.salida ? `${h.entrada}-${h.salida}` : `${h.entrada}*`;
        doc.text(
          txt,
          daysStartX + i * colWidth + colWidth / 2,
          y + 4,
          { align: "center" },
        );
      });
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      y += rowHeight;
    }
    doc.save(`horario_${semana?.fechaInicio}.pdf`);
    toast.success(`PDF generado con ${personalesSeleccionados.length} personas`);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>Vista para publicar / exportar</span>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={exportPdf} disabled={personalesSeleccionados.length === 0}>
                <Download className="h-4 w-4 mr-1" /> Exportar PDF ({personalesSeleccionados.length})
              </Button>
              <Button
                onClick={() => publicar({ id: semanaId }).then(() => toast.success("Semana marcada como publicada"))}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar como publicada
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            {semana?.fechaInicio} → {semana?.fechaFin} · Estado: <Badge variant="outline">{semana?.estado}</Badge>
            {" · "}Selecciona qué personal incluir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filtros y acciones rápidas */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtroCargo} onValueChange={setFiltroCargo}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los cargos</SelectItem>
                {CARGOS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => toggleTodo("ALL")}>
              {personalesFiltrados.every((p: any) => seleccionados.has(p._id)) ? "Deseleccionar" : "Seleccionar"} todos
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSeleccionados(new Set())}>
              Ninguno
            </Button>
            <Badge variant="secondary">{personalesSeleccionados.length} de {personalesFiltrados.length} seleccionados</Badge>
          </div>

          {/* Botones rápidos por cargo: seleccionar/deseleccionar todo un cargo */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Por cargo:</span>
            {CARGOS.map((c) => {
              const subset = personales.filter((p: any) => p.cargo === c.value);
              if (subset.length === 0) return null;
              const allSelected = subset.every((p: any) => seleccionados.has(p._id));
              const noneSelected = subset.every((p: any) => !seleccionados.has(p._id));
              const parcial = !allSelected && !noneSelected;
              return (
                <Button
                  key={c.value}
                  size="sm"
                  variant={allSelected ? "default" : parcial ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => toggleTodo(c.value)}
                  title={`${allSelected ? "Deseleccionar" : "Seleccionar"} todos los ${c.label}`}
                >
                  {allSelected ? "✓" : parcial ? "~" : "○"} {c.label} ({subset.length})
                </Button>
              );
            })}
          </div>

          {/* Lista seleccionable */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
            {personalesFiltrados.map((p: any) => {
              const checked = seleccionados.has(p._id);
              return (
                <label
                  key={p._id}
                  className={`flex items-start gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50 ${checked ? "border-primary bg-primary/5" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSeleccion(p._id)}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {p.apellidos} {p.nombres}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge className={CARGO_BADGE[p.cargo] ?? "bg-gray-100"} variant="secondary">
                        {p.cargo}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{p.nick}</span>
                    </div>
                  </div>
                </label>
              );
            })}
            {personalesFiltrados.length === 0 && (
              <div className="text-center text-muted-foreground py-8 col-span-full">
                No hay personal que coincida con los filtros
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vista previa del PDF */}
      {personalesSeleccionados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa del PDF</CardTitle>
            <CardDescription>
              Así se verá el PDF con {personalesSeleccionados.length} personas seleccionadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto bg-white border rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="text-left p-1.5 border-r">Apellidos, Nombres (Nick)</th>
                    <th className="text-left p-1.5 border-r">Cargo</th>
                    {DIAS_SEMANA.map((dia) => (
                      <th key={dia} className="text-center p-1.5 border-r w-20">
                        {dia.slice(0, 3).toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {personalesSeleccionados.map((p: any) => (
                    <tr key={p._id} className="border-b">
                      <td className="p-1.5 border-r">
                        <div className="font-medium">{p.apellidos} {p.nombres}</div>
                        <div className="text-[10px] text-gray-500">{p.nick}</div>
                      </td>
                      <td className="p-1.5 border-r">
                        <Badge className={CARGO_BADGE[p.cargo] ?? "bg-gray-100"} variant="secondary">
                          {p.cargo}
                        </Badge>
                      </td>
                      {DIAS_SEMANA.map((dia, i) => {
                        const d = i + 1;
                        const h = map.get(`${p._id}-${d}`);
                        return (
                          <td key={d} className="text-center p-1.5 border-r font-mono">
                            {h?.descanso ? "DESC" : h ? (h.salida ? `${h.entrada}-${h.salida}` : <span className="text-orange-600">{h.entrada}→?</span>) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
