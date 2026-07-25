"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ListTodo,
  Plus,
  Trash2,
  Repeat,
  Sparkles,
  Calendar as CalIcon,
  ListChecks,
  History as HistoryIcon,
} from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";
import { TareaDiariaCard } from "@/components/tareas/TareaDiariaCard";
import { CalendarioSimple } from "@/components/tareas/CalendarioSimple";
import { PatronSelector, DIAS, type Patron, type DiaSemana } from "@/components/tareas/PatronSelector";

export default function TareasPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const [fecha, setFecha] = useState(toISODate(new Date()));

  const recurrentes = useQuery(
    api.tareas.listRecurrentes,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const instancias = useQuery(
    api.tareas.listInstancias,
    tienda ? { tiendaId: tienda._id, fecha } : "skip"
  );
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );

  const materializar = useMutation(api.tareas.materializarInstancias);
  const reassign = useMutation(api.tareas.reassignInstancia);
  const delIns = useMutation(api.tareas.deleteInstancia);
  const delRec = useMutation(api.tareas.deleteRecurrente);
  const updateRec = useMutation(api.tareas.updateRecurrente);
  const rollover = useMutation(api.tareas.rolloverInstancia);

  useEffect(() => {
    if (!tienda) return;
    const f = new Date(fecha + "T00:00:00");
    f.setDate(f.getDate() + 6);
    materializar({
      tiendaId: tienda._id,
      from: fecha,
      to: toISODate(f),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tienda, fecha]);

  const personalById = useMemo(() => {
    const m = new Map<Id<"personales">, any>();
    for (const p of personales ?? []) m.set(p._id, p);
    return m;
  }, [personales]);

  if (!tienda) {
    return <div className="p-6">Cargando tienda...</div>;
  }

  const porResponsable = new Map<
    string,
    { responsable: any; tareas: any[] }
  >();
  for (const t of instancias ?? []) {
    const key = t.responsableId ?? "__sin_asignar__";
    if (!porResponsable.has(key)) {
      porResponsable.set(key, { responsable: key === "__sin_asignar__" ? null : personalById.get(t.responsableId), tareas: [] });
    }
    porResponsable.get(key)!.tareas.push(t);
  }

  const totalHoy = (instancias ?? []).length;
  const hechasHoy = (instancias ?? []).filter((t) => t.estado === "completada").length;
  const activasRecurrentes = (recurrentes ?? []).filter((r) => r.activa !== false).length;

  async function handleReassign(tareaId: Id<"tareasInstancia">) {
    const t = (instancias ?? []).find((x) => x._id === tareaId);
    if (!t) return;
    const candidatos = (personales ?? [])
      .filter((p: any) => p.activo && p._id !== t.responsableId)
      .map((p: any) => `${p._id}|${p.apellidos} ${p.nombres} (${p.nick})`);
    if (candidatos.length === 0) {
      toast.error("No hay otros candidatos disponibles");
      return;
    }
    const seleccion = window.prompt(
      "Escribe el número del nuevo responsable:\n" +
        candidatos.map((c, i) => `${i + 1}. ${c.split("|")[1]}`).join("\n")
    );
    if (!seleccion) return;
    const idx = parseInt(seleccion, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= candidatos.length) {
      toast.error("Selección inválida");
      return;
    }
    const nuevoId = candidatos[idx].split("|")[0] as Id<"personales">;
    try {
      await reassign({ id: tareaId, responsableId: nuevoId });
      toast.success("Responsable reasignado");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleRollover(id: Id<"tareasInstancia">) {
    try {
      await rollover({ id });
      toast.success("Tarea pasada a mañana");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="h-6 w-6" />
            Tareas del área
          </h1>
          <p className="text-sm text-muted-foreground">
            Calendario semanal + to-do diario + plantillas recurrentes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      <Tabs defaultValue="hoy" className="mb-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="hoy">
            <ListChecks className="h-4 w-4 mr-1" /> Hoy ({hechasHoy}/{totalHoy})
          </TabsTrigger>
          <TabsTrigger value="recurrentes">
            <Repeat className="h-4 w-4 mr-1" /> Recurrentes ({activasRecurrentes})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hoy" className="space-y-3 mt-3">
          <NuevaTareaMomento
            tiendaId={tienda._id}
            fecha={fecha}
            personales={(personales ?? []).filter((p: any) => p.activo)}
          />

          {porResponsable.size === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay tareas para {fecha}. Agrega una con el botón de arriba.
              </CardContent>
            </Card>
          )}

          {Array.from(porResponsable.entries()).map(([responsableId, grupo]) => (
            <div key={responsableId} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                👤 {grupo.responsable
                  ? `${grupo.responsable.apellidos} ${grupo.responsable.nombres} (${grupo.responsable.nick})`
                  : "(sin responsable)"}
                <Badge variant="outline" className="text-[10px]">
                  {grupo.tareas.length} tarea(s)
                </Badge>
              </div>
              {grupo.tareas.map((t) => (
                <TareaDiariaCard
                  key={t._id}
                  tarea={t}
                  personalById={personalById}
                  onReassign={handleReassign}
                  onDelete={async (id) => {
                    if (!confirm("¿Eliminar tarea?")) return;
                    await delIns({ id });
                    toast.success("Eliminada");
                  }}
                  onRollover={handleRollover}
                />
              ))}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="recurrentes" className="space-y-3 mt-3">
          <NuevaRecurrente
            tiendaId={tienda._id}
            personales={(personales ?? []).filter((p: any) => p.activo)}
            fecha={fecha}
            materializar={materializar}
          />
          {(recurrentes ?? []).length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Aún no hay tareas recurrentes. Crea la primera con el botón de arriba.
              </CardContent>
            </Card>
          )}
          {(recurrentes ?? []).map((r: any) => (
            <Card key={r._id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      <Repeat className="h-4 w-4" />
                      {r.titulo}
                      {r.horaSugerida && (
                        <Badge variant="outline" className="text-[10px]">
                          ⏰ {r.horaSugerida}
                        </Badge>
                      )}
                      <Badge
                        variant={r.activa === false ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {r.activa === false ? "inactiva" : r.modoAsignacion}
                      </Badge>
                    </CardTitle>
                    {r.descripcion && (
                      <CardDescription>{r.descripcion}</CardDescription>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                      <span>
                        {r.patron === "personalizada"
                          ? `Días: ${(r.diasSemana ?? []).join(", ")}`
                          : r.patron}
                      </span>
                      {r.poolIds && <span>· Pool: {r.poolIds.length} persona(s)</span>}
                      {r.asignadosFijosIds && (
                        <span>· Fijos: {r.asignadosFijosIds.length} persona(s)</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        await updateRec({ id: r._id, activa: !r.activa });
                        toast.success(r.activa ? "Desactivada" : "Activada");
                      }}
                      title={r.activa ? "Desactivar" : "Activar"}
                    >
                      {r.activa ? "⏸" : "▶"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        if (!confirm("¿Eliminar recurrente?")) return;
                        await delRec({ id: r._id });
                        toast.success("Eliminada");
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <CalendarioSimple tiendaId={tienda._id} />
        <HistorialTareas tiendaId={tienda._id} />
      </div>
    </div>
  );
}

// ============================
// Nueva tarea del momento
// ============================

function NuevaTareaMomento({
  tiendaId,
  fecha,
  personales,
}: {
  tiendaId: Id<"tiendas">;
  fecha: string;
  personales: any[];
}) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [desc, setDesc] = useState("");
  const [plazo, setPlazo] = useState("");
  const [responsableId, setResponsableId] = useState<Id<"personales"> | "">("");
  const [colaboradoresIds, setColaboradoresIds] = useState<Id<"personales">[]>([]);
  const create = useMutation(api.tareas.createInstancia);

  async function handleCreate() {
    if (!titulo.trim()) {
      toast.error("Ingresa un título");
      return;
    }
    const asignados = [
      ...(responsableId ? [responsableId as Id<"personales">] : []),
      ...colaboradoresIds,
    ];
    if (asignados.length === 0) {
      toast.error("Selecciona al menos un asignado");
      return;
    }
    try {
      await create({
        tiendaId,
        fecha,
        titulo: titulo.trim(),
        descripcion: desc.trim() || undefined,
        plazo: plazo || undefined,
        asignadosIds: asignados,
        responsableId: responsableId ? (responsableId as Id<"personales">) : undefined,
        colaboradoresIds: responsableId ? colaboradoresIds : undefined,
      });
      toast.success("Tarea creada");
      setOpen(false);
      setTitulo("");
      setDesc("");
      setPlazo("");
      setResponsableId("");
      setColaboradoresIds([]);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" /> Agregar tarea del momento · {fecha}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea del momento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Reponer bolsas"
              autoFocus
            />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Detalle breve"
            />
          </div>
          <div>
            <Label>Plazo (opcional)</Label>
            <Input
              type="time"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
            />
          </div>
          <div>
            <Label>Responsable *</Label>
            <select
              className="w-full border rounded-md h-9 px-2 text-sm bg-background"
              value={responsableId}
              onChange={(e) => setResponsableId(e.target.value as Id<"personales">)}
            >
              <option value="">— Seleccionar —</option>
              {personales.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.apellidos} {p.nombres} ({p.nick})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Colaboradores (opcional)</Label>
            <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1">
              {personales.map((p: any) => (
                <label key={p._id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={colaboradoresIds.includes(p._id)}
                    onCheckedChange={(c) => {
                      if (c)
                        setColaboradoresIds([...colaboradoresIds, p._id]);
                      else
                        setColaboradoresIds(
                          colaboradoresIds.filter((x) => x !== p._id)
                        );
                    }}
                  />
                  {p.apellidos} {p.nombres} ({p.nick})
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleCreate}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================
// Nueva tarea recurrente
// ============================

function NuevaRecurrente({
  tiendaId,
  personales,
  fecha,
  materializar,
}: {
  tiendaId: Id<"tiendas">;
  personales: any[];
  fecha: string;
  materializar: any;
}) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [desc, setDesc] = useState("");
  const [hora, setHora] = useState("");
  const [todoElDia, setTodoElDia] = useState(false);
  const [patron, setPatron] = useState<Patron>("diaria");
  const [diasSemana, setDiasSemana] = useState<DiaSemana[]>([]);
  const [modo, setModo] = useState<"manual" | "rotativa" | "compartida">("manual");
  const [poolIds, setPoolIds] = useState<Id<"personales">[]>([]);
  const [fijosIds, setFijosIds] = useState<Id<"personales">[]>([]);
  const [usarSugerido, setUsarSugerido] = useState<"auto" | "manual" | null>(null);
  const create = useMutation(api.tareas.createRecurrente);

  const sugerido = useMemo(() => {
    if (usarSugerido !== "auto" || poolIds.length === 0) return [];
    return calcularSugerido({
      patron,
      diasSemana,
      pool: poolIds,
      personalById: new Map(personales.map((p) => [p._id, p])),
      desde: new Date(),
    });
  }, [usarSugerido, patron, diasSemana, poolIds, personales]);

  async function handleCreate() {
    if (!titulo.trim()) {
      toast.error("Ingresa un título");
      return;
    }
    try {
      await create({
        tiendaId,
        titulo: titulo.trim(),
        descripcion: desc.trim() || undefined,
        horaSugerida: todoElDia ? undefined : hora || undefined,
        patron,
        diasSemana: patron === "personalizada" ? diasSemana : undefined,
        modoAsignacion: modo,
        poolIds: modo !== "manual" ? poolIds : undefined,
        asignadosFijosIds: modo === "manual" ? fijosIds : undefined,
      });
      // Materializar inmediatamente para que las instancias aparezcan sin recargar
      const f = new Date(fecha + "T00:00:00");
      f.setDate(f.getDate() + 6);
      await materializar({
        tiendaId,
        from: fecha,
        to: toISODate(f),
      }).catch(() => {});
      toast.success("Recurrente creada");
      setOpen(false);
      setTitulo("");
      setDesc("");
      setHora("");
      setTodoElDia(false);
      setPatron("diaria");
      setDiasSemana([]);
      setModo("manual");
      setPoolIds([]);
      setFijosIds([]);
      setUsarSugerido(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" /> Agregar tarea recurrente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva tarea recurrente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Devoluciones a góndola"
              autoFocus
            />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <Label>Hora sugerida</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                disabled={todoElDia}
                className={todoElDia ? "opacity-50" : ""}
              />
              <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                <Checkbox
                  checked={todoElDia}
                  onCheckedChange={(c) => {
                    setTodoElDia(!!c);
                    if (c) setHora("");
                  }}
                />
                Todo el día
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {todoElDia
                ? "Tarea a lo largo del día, sin hora específica."
                : "Hora puntual en la que debe realizarse."}
            </p>
          </div>

          <PatronSelector
            value={patron}
            diasSemana={diasSemana}
            onChange={setPatron}
            onDiasChange={setDiasSemana}
          />

          <div>
            <Label className="text-sm">Modo de asignación</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(["manual", "rotativa", "compartida"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  className={
                    "rounded-md border px-3 py-2 text-sm " +
                    (modo === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent")
                  }
                >
                  {m === "manual"
                    ? "Fija (manual)"
                    : m === "rotativa"
                    ? "Rotativa"
                    : "Compartida"}
                </button>
              ))}
            </div>
          </div>

          {modo === "manual" ? (
            <div>
              <Label>Asignados fijos</Label>
              <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1">
                {personales.map((p: any) => (
                  <label key={p._id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={fijosIds.includes(p._id)}
                      onCheckedChange={(c) => {
                        if (c) setFijosIds([...fijosIds, p._id]);
                        else setFijosIds(fijosIds.filter((x) => x !== p._id));
                      }}
                    />
                    {p.apellidos} {p.nombres} ({p.nick})
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <Label>Pool de personas</Label>
              <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1">
                {personales.map((p: any) => (
                  <label key={p._id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={poolIds.includes(p._id)}
                      onCheckedChange={(c) => {
                        if (c) setPoolIds([...poolIds, p._id]);
                        else setPoolIds(poolIds.filter((x) => x !== p._id));
                      }}
                    />
                    {p.apellidos} {p.nombres} ({p.nick})
                  </label>
                ))}
              </div>
            </div>
          )}

          {(modo === "rotativa" || modo === "compartida") && poolIds.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> ¿Cómo quieres asignar los días?
                </CardTitle>
                <CardDescription>
                  El sistema rotará automáticamente entre las personas del pool.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUsarSugerido("auto")}
                    className={
                      "rounded-md border px-3 py-2 text-sm " +
                      (usarSugerido === "auto"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent")
                    }
                  >
                    Usar sugerido (auto)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsarSugerido("manual")}
                    className={
                      "rounded-md border px-3 py-2 text-sm " +
                      (usarSugerido === "manual"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent")
                    }
                  >
                    Asignar yo día a día
                  </button>
                </div>

                {usarSugerido === "auto" && (
                  <div className="text-xs space-y-1 max-h-40 overflow-y-auto border rounded p-2">
                    <div className="text-muted-foreground mb-1">
                      Vista previa de la rotación:
                    </div>
                    {sugerido.length === 0 ? (
                      <div className="text-muted-foreground">
                        Configura el patrón y el pool para ver la sugerencia.
                      </div>
                    ) : (
                      sugerido.map((s) => (
                        <div key={s.fecha} className="flex justify-between">
                          <span>{s.fecha}</span>
                          <span className="font-medium">{s.nombre}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {usarSugerido === "manual" && (
                  <div className="text-xs text-muted-foreground">
                    El sistema creará las tareas sin responsable. Tú las asignarás después
                    desde la pestaña "Hoy" o arrastrándolas en "Calendario".
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleCreate}>Crear recurrente</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorialTareas({ tiendaId }: { tiendaId: Id<"tiendas"> }) {
  const [from, setFrom] = useState(toISODate(new Date(Date.now() - 14 * 86400000)));
  const [to, setTo] = useState(toISODate(new Date()));
  const list = useQuery(api.tareas.listInstanciasPorFecha, { tiendaId, from, to });
  const personales = useQuery(
    api.personales.list,
    tiendaId ? { tiendaId, soloActivos: true } : "skip"
  );
  const personalById = useMemo(() => {
    const m = new Map<Id<"personales">, any>();
    for (const p of personales ?? []) m.set(p._id, p);
    return m;
  }, [personales]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HistoryIcon className="h-4 w-4" /> Historial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {(list ?? []).length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Sin tareas en el rango.
            </div>
          )}
          {(list ?? []).map((t: any) => (
            <TareaDiariaCard
              key={t._id}
              tarea={t}
              personalById={personalById}
              onReassign={() => {}}
              onDelete={async () => {}}
              onRollover={() => {}}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================
// Cálculo del sugerido
// ============================

function lastWeekdayOfNextMonth(weekday: DiaSemana): Date {
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const dayNum =
    weekday === "lun" ? 1 : weekday === "mar" ? 2 : weekday === "mie" ? 3 : weekday === "jue" ? 4 : weekday === "vie" ? 5 : weekday === "sab" ? 6 : 0;
  const jsDay = dayNum === 0 ? 0 : dayNum;
  while (next.getDay() !== jsDay) {
    next.setDate(next.getDate() - 1);
  }
  return next;
}

function dayLetter(d: Date): DiaSemana {
  const map: DiaSemana[] = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  return map[d.getDay()];
}

function matchesPatron(fecha: Date, patron: Patron, dias: DiaSemana[]): boolean {
  const dow = dayLetter(fecha);
  if (patron === "diaria") return true;
  if (patron === "laborables") return dow !== "sab" && dow !== "dom";
  if (patron === "finde") return dow === "sab" || dow === "dom";
  if (patron === "personalizada") return dias.includes(dow);
  return false;
}

function isSemanalUnico(patron: Patron, dias: DiaSemana[]): boolean {
  if (patron === "personalizada" && dias.length === 1) return true;
  return false;
}

function calcularSugerido(args: {
  patron: Patron;
  diasSemana: DiaSemana[];
  pool: Id<"personales">[];
  personalById: Map<Id<"personales">, any>;
  desde: Date;
}): { fecha: string; nombre: string }[] {
  const { patron, diasSemana, pool, personalById, desde } = args;
  if (pool.length === 0) return [];

  const fin: Date = (() => {
    if (isSemanalUnico(patron, diasSemana)) {
      return lastWeekdayOfNextMonth(diasSemana[0]);
    }
    const f = new Date(desde);
    f.setDate(f.getDate() + 6);
    return f;
  })();

  const out: { fecha: string; nombre: string }[] = [];
  let idx = 0;
  const cursor = new Date(desde);
  while (cursor <= fin) {
    if (matchesPatron(cursor, patron, diasSemana)) {
      const id = pool[idx % pool.length];
      const p = personalById.get(id);
      out.push({
        fecha: toISODate(cursor),
        nombre: p ? `${p.nombres} ${p.apellidos}` : "?",
      });
      idx++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
