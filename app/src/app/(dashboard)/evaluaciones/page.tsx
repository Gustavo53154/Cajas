"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ClipboardCheck, CheckCircle2, Save, Trash2, Pencil, History, ListChecks, X, Plus as PlusIcon, Users, UserCheck, AlertCircle } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";

type Cargo = "Cajer@" | "Self Checkout" | "RS" | "Ecommerce" | "Supervisor(@)" | "JefeCajas" | "SubGerente" | "Gerente";
type Campo = { label: string; tipo: "0-20" | "0-100" | "bool"; peso: number };
type AsignadosModo = "todos" | "cargo" | "personales";
type Plantilla = {
  _id: Id<"plantillasEvaluacion">;
  tiendaId: Id<"tiendas">;
  nombre: string;
  tipoNota: "0-20" | "0-100" | "bool";
  campos: Campo[];
  recurrencia: "diaria" | "15dias" | "unica";
  obligatoria: boolean;
  asignadosModo: AsignadosModo;
  asignadosCargo?: Cargo;
  asignadosIds?: Id<"personales">[];
  activa: boolean;
  createdAt: number;
};
type Evaluacion = {
  _id: Id<"evaluaciones">;
  plantillaId: Id<"plantillasEvaluacion">;
  personalId: Id<"personales">;
  fechaProgramada: string;
  notaFinal: number;
  fechaRealizada?: string;
  observaciones?: string;
};

const CARGOS: { value: Cargo; label: string }[] = [
  { value: "Cajer@", label: "Cajer@" },
  { value: "Self Checkout", label: "Self Checkout" },
  { value: "RS", label: "RS" },
  { value: "Ecommerce", label: "Ecommerce" },
  { value: "Supervisor(@)", label: "Supervisor@" },
  { value: "JefeCajas", label: "JefeCajas" },
  { value: "SubGerente", label: "SubGerente" },
  { value: "Gerente", label: "Gerente" },
];

function PlantillaForm({
  initial,
  personales,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: {
    nombre: string;
    tipoNota: "0-20" | "0-100" | "bool";
    recurrencia: "diaria" | "15dias" | "unica";
    campos: Campo[];
    obligatoria: boolean;
    asignadosModo: AsignadosModo;
    asignadosCargo?: Cargo;
    asignadosIds?: Id<"personales">[];
  };
  personales?: { _id: Id<"personales">; apellidos: string; nombres: string; nick: string; cargo: Cargo; activo: boolean }[];
  onSubmit: (data: {
    nombre: string;
    tipoNota: "0-20" | "0-100" | "bool";
    recurrencia: "diaria" | "15dias" | "unica";
    campos: Campo[];
    obligatoria: boolean;
    asignadosModo: AsignadosModo;
    asignadosCargo?: Cargo;
    asignadosIds?: Id<"personales">[];
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [tipoNota, setTipoNota] = useState<"0-20" | "0-100" | "bool">(initial?.tipoNota ?? "0-20");
  const [recurrencia, setRecurrencia] = useState<"diaria" | "15dias" | "unica">(initial?.recurrencia ?? "diaria");
  const [campos, setCampos] = useState<Campo[]>(
    initial?.campos && initial.campos.length > 0
      ? initial.campos
      : [{ label: "", tipo: "0-20", peso: 1 }]
  );
  const [obligatoria, setObligatoria] = useState(initial?.obligatoria ?? false);
  const [asignadosModo, setAsignadosModo] = useState<AsignadosModo>(initial?.asignadosModo ?? "todos");
  const [asignadosCargo, setAsignadosCargo] = useState<Cargo | undefined>(initial?.asignadosCargo);
  const [asignadosIds, setAsignadosIds] = useState<Id<"personales">[]>(initial?.asignadosIds ?? []);

  const totalPeso = campos.reduce((s, c) => s + (Number.isFinite(c.peso) ? c.peso : 0), 0);
  const personalesActivos = (personales ?? []).filter((p) => p.activo);
  const previewCount =
    !obligatoria
      ? null
      : asignadosModo === "todos"
        ? personalesActivos.length
        : asignadosModo === "cargo"
          ? personalesActivos.filter((p) => p.cargo === asignadosCargo).length
          : asignadosIds.length;

  function updateCampo(i: number, patch: Partial<Campo>) {
    setCampos((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeCampo(i: number) {
    setCampos((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function addCampo() {
    setCampos((prev) => [...prev, { label: "", tipo: tipoNota, peso: 1 }]);
  }
  function toggleAsignado(id: Id<"personales">, checked: boolean) {
    setAsignadosIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  async function handleSubmit() {
    if (!nombre.trim()) {
      toast.error("Escribe un nombre para la plantilla");
      return;
    }
    const limpios = campos.map((c) => ({ ...c, label: c.label.trim(), peso: Number(c.peso) || 0 })).filter((c) => c.label);
    if (limpios.length === 0) {
      toast.error("Agrega al menos un campo");
      return;
    }
    if (obligatoria) {
      if (asignadosModo === "cargo" && !asignadosCargo) {
        toast.error("Selecciona un cargo para los asignados");
        return;
      }
      if (asignadosModo === "personales" && asignadosIds.length === 0) {
        toast.error("Selecciona al menos una persona");
        return;
      }
    }
    await onSubmit({
      nombre: nombre.trim(),
      tipoNota,
      recurrencia,
      campos: limpios,
      obligatoria,
      asignadosModo: obligatoria ? asignadosModo : "todos",
      asignadosCargo: obligatoria && asignadosModo === "cargo" ? asignadosCargo : undefined,
      asignadosIds: obligatoria && asignadosModo === "personales" ? asignadosIds : undefined,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Nombre</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Frutas y verduras" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tipo de nota</Label>
          <Select value={tipoNota} onValueChange={(v: any) => setTipoNota(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0-20">0 a 20</SelectItem>
              <SelectItem value="0-100">0 a 100%</SelectItem>
              <SelectItem value="bool">Sí / No</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Recurrencia</Label>
          <Select value={recurrencia} onValueChange={(v: any) => setRecurrencia(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="diaria">Diaria</SelectItem>
              <SelectItem value="15dias">Cada 15 días</SelectItem>
              <SelectItem value="unica">Única</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Campos a evaluar</Label>
          <span className="text-xs text-muted-foreground">Peso total: {totalPeso}</span>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {campos.map((c, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border p-2">
              <Input
                value={c.label}
                onChange={(e) => updateCampo(i, { label: e.target.value })}
                placeholder="Nombre del criterio"
                className="flex-1"
              />
              <Select value={c.tipo} onValueChange={(v: any) => updateCampo(i, { tipo: v })}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0-20">0-20</SelectItem>
                  <SelectItem value="0-100">0-100</SelectItem>
                  <SelectItem value="bool">Sí/No</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={c.peso}
                onChange={(e) => updateCampo(i, { peso: parseFloat(e.target.value) || 0 })}
                className="w-20"
                title="Peso"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCampo(i)}
                disabled={campos.length === 1}
                title="Quitar campo"
              >
                <X className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addCampo} className="mt-2 w-full">
          <PlusIcon className="h-4 w-4 mr-1" /> Agregar campo
        </Button>
      </div>

      <div className="rounded-md border p-3 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Evaluación obligatoria</Label>
            <p className="text-xs text-muted-foreground">Permite hacer seguimiento de quién aún no la ha hecho.</p>
          </div>
          <Switch checked={obligatoria} onCheckedChange={setObligatoria} />
        </div>

        {obligatoria && (
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs">Asignar a</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setAsignadosModo("todos")}
                  className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${
                    asignadosModo === "todos" ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span>Todos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAsignadosModo("cargo")}
                  className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${
                    asignadosModo === "cargo" ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <UserCheck className="h-4 w-4" />
                  <span>Por cargo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAsignadosModo("personales")}
                  className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors ${
                    asignadosModo === "personales" ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Específicos</span>
                </button>
              </div>
            </div>

            {asignadosModo === "cargo" && (
              <div>
                <Label className="text-xs">Cargo</Label>
                <Select value={asignadosCargo} onValueChange={(v: any) => setAsignadosCargo(v)}>
                  <SelectTrigger><SelectValue placeholder="Selecciona cargo" /></SelectTrigger>
                  <SelectContent>
                    {CARGOS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {asignadosModo === "personales" && (
              <div>
                <Label className="text-xs">Personas ({asignadosIds.length} seleccionadas)</Label>
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                  {personalesActivos.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No hay personal activo.</p>
                  ) : (
                    personalesActivos.map((p: any) => (
                      <label key={p._id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1">
                        <Checkbox
                          checked={asignadosIds.includes(p._id)}
                          onCheckedChange={(c) => toggleAsignado(p._id, !!c)}
                        />
                        <span className="flex-1 truncate">{p.apellidos} {p.nombres} ({p.nick})</span>
                        <Badge variant="outline" className="text-[10px]">{p.cargo}</Badge>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {previewCount !== null && (
              <p className="text-xs text-muted-foreground">
                <AlertCircle className="inline h-3 w-3 mr-1" />
                Aplica a {previewCount} {previewCount === 1 ? "persona" : "personas"}.
              </p>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild><Button variant="outline" onClick={onCancel}>Cancelar</Button></DialogClose>
        <Button onClick={handleSubmit}>{submitLabel}</Button>
      </DialogFooter>
    </div>
  );
}

function personalesElegibles(plantilla: any, personales: any[] | undefined) {
  if (!personales) return [];
  const activos = personales.filter((p: any) => p.activo);
  if (!plantilla?.obligatoria) return activos;
  if (plantilla.asignadosModo === "cargo" && plantilla.asignadosCargo) {
    return activos.filter((p: any) => p.cargo === plantilla.asignadosCargo);
  }
  if (plantilla.asignadosModo === "personales" && Array.isArray(plantilla.asignadosIds)) {
    const set = new Set(plantilla.asignadosIds);
    return activos.filter((p: any) => set.has(p._id));
  }
  return activos;
}

function mitadDelMes(fecha: string): "primera" | "segunda" {
  const dia = parseInt(fecha.slice(8, 10), 10);
  return dia <= 15 ? "primera" : "segunda";
}

function fechaDeMitad(mitad: "primera" | "segunda", fechaRef: string): string {
  const yyyy = fechaRef.slice(0, 4);
  const mm = fechaRef.slice(5, 7);
  const dd = mitad === "primera" ? "01" : "16";
  return `${yyyy}-${mm}-${dd}`;
}

function etiquetaMitad(fecha: string): { label: string; desde: string; hasta: string } {
  const mitad = mitadDelMes(fecha);
  const desde = fechaDeMitad(mitad, fecha);
  const yyyy = fecha.slice(0, 4);
  const mm = parseInt(fecha.slice(5, 7), 10);
  const anio = parseInt(yyyy, 10);
  const ultimoDia = new Date(anio, mm, 0).getDate();
  const hasta = mitad === "primera"
    ? `${yyyy}-${fecha.slice(5, 7)}-15`
    : `${yyyy}-${fecha.slice(5, 7)}-${String(ultimoDia).padStart(2, "0")}`;
  return {
    label: mitad === "primera" ? "1ra mitad" : "2da mitad",
    desde,
    hasta,
  };
}

export default function EvaluacionesPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const plantillas = useQuery(api.evaluaciones.listPlantillas, tienda ? { tiendaId: tienda._id } : "skip");
  const personales = useQuery(api.personales.list, tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip");
  const create = useMutation(api.evaluaciones.createPlantilla);
  const updatePlantilla = useMutation(api.evaluaciones.updatePlantilla);
  const removePlantillaMut = useMutation(api.evaluaciones.removePlantilla);
  const upsertEval = useMutation(api.evaluaciones.upsertEvaluacion);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<Id<"plantillasEvaluacion"> | null>(null);
  const [openEval, setOpenEval] = useState<Id<"plantillasEvaluacion"> | null>(null);
  const [historialPlantillaId, setHistorialPlantillaId] = useState<Id<"plantillasEvaluacion"> | "">("");
  const [seguimientoFecha, setSeguimientoFecha] = useState(toISODate(new Date()));
  const [registroFecha, setRegistroFecha] = useState(toISODate(new Date()));

  const [evalPersonalId, setEvalPersonalId] = useState<string>("");
  const [valoresTemp, setValoresTemp] = useState<Record<string, { label: string; valor: number | boolean; peso: number }>>({});
  const [observaciones, setObservaciones] = useState("");

  const historial = useQuery(
    api.evaluaciones.getEvaluacionesByPlantilla,
    historialPlantillaId ? { plantillaId: historialPlantillaId as Id<"plantillasEvaluacion"> } : "skip"
  );
  const cumplimiento = useQuery(
    api.evaluaciones.getCumplimiento,
    historialPlantillaId ? { plantillaId: historialPlantillaId as Id<"plantillasEvaluacion">, fecha: seguimientoFecha } : "skip"
  );

  async function handleCreate(data: {
    nombre: string;
    tipoNota: "0-20" | "0-100" | "bool";
    recurrencia: "diaria" | "15dias" | "unica";
    campos: Campo[];
    obligatoria: boolean;
    asignadosModo: AsignadosModo;
    asignadosCargo?: Cargo;
    asignadosIds?: Id<"personales">[];
  }) {
    if (!tienda) return;
    try {
      await create({ tiendaId: tienda._id, ...data });
      toast.success("Plantilla creada");
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleUpdate(
    id: Id<"plantillasEvaluacion">,
    data: {
      nombre: string;
      tipoNota: "0-20" | "0-100" | "bool";
      recurrencia: "diaria" | "15dias" | "unica";
      campos: Campo[];
      obligatoria: boolean;
      asignadosModo: AsignadosModo;
      asignadosCargo?: Cargo;
      asignadosIds?: Id<"personales">[];
    }
  ) {
    try {
      await updatePlantilla({
        id,
        nombre: data.nombre,
        campos: data.campos,
        obligatoria: data.obligatoria,
        asignadosModo: data.asignadosModo,
        asignadosCargo: data.asignadosCargo,
        asignadosIds: data.asignadosIds,
      });
      toast.success("Plantilla actualizada");
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDelete(p: Plantilla) {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"? Esto borrará también todas las evaluaciones registradas con ella.`)) return;
    try {
      await removePlantillaMut({ id: p._id });
      toast.success("Plantilla eliminada");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleGuardarEvaluacion(plantillaId: Id<"plantillasEvaluacion">) {
    if (!evalPersonalId) {
      toast.error("Selecciona un cajero");
      return;
    }
    const plantilla = plantillas?.find((p: any) => p._id === plantillaId);
    if (!plantilla) return;

    const valores: any[] = [];
    let nota = 0;
    for (const campo of plantilla.campos) {
      const v = valoresTemp[campo.label];
      if (v === undefined) {
        toast.error(`Completa el campo "${campo.label}"`);
        return;
      }
      valores.push(v);
      if (typeof v.valor === "number") {
        nota += v.valor * v.peso;
      } else if (v.valor === true) {
        nota += 1 * v.peso;
      }
    }

    try {
      await upsertEval({
        plantillaId,
        fechaProgramada: registroFecha,
        personalId: evalPersonalId as Id<"personales">,
        valores,
        notaFinal: nota,
        fechaRealizada: toISODate(new Date()),
        observaciones: observaciones || undefined,
      });
      toast.success(`Evaluación guardada con nota ${nota.toFixed(1)}`);
      setOpenEval(null);
      setValoresTemp({});
      setObservaciones("");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const editPlantilla = plantillas?.find((p: any) => p._id === editId);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Evaluaciones
          </h1>
          <p className="text-sm text-muted-foreground">Plantillas y registro de evaluaciones</p>
        </div>
      </div>

      <Tabs defaultValue="plantillas">
        <TabsList>
          <TabsTrigger value="plantillas"><ListChecks className="h-4 w-4 mr-1" />Plantillas</TabsTrigger>
          <TabsTrigger value="seguimiento"><History className="h-4 w-4 mr-1" />Seguimiento</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva plantilla
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nueva plantilla de evaluación</DialogTitle>
                </DialogHeader>
                <PlantillaForm personales={personales as any} onSubmit={handleCreate} onCancel={() => setOpen(false)} submitLabel="Crear" />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plantillas?.map((p: any) => (
              <Card key={p._id} className={!p.activa ? "opacity-60" : undefined}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{p.nombre}</CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline">{p.tipoNota}</Badge>
                        <Badge variant="secondary">{p.recurrencia}</Badge>
                        <Badge variant="outline">{p.campos.length} campos</Badge>
                        {p.obligatoria && <Badge variant="default">Obligatoria</Badge>}
                        {!p.activa && <Badge variant="destructive">Inactiva</Badge>}
                      </CardDescription>
                      {p.obligatoria && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Aplica a: {p.asignadosModo === "todos" ? "todos" : p.asignadosModo === "cargo" ? `cargo ${p.asignadosCargo}` : `${(p.asignadosIds ?? []).length} personas`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar plantilla"
                        onClick={() => setEditId(p._id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Eliminar plantilla"
                        onClick={() => handleDelete(p as Plantilla)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xs space-y-1 mb-3 max-h-32 overflow-y-auto">
                    {p.campos.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span className="flex-1 truncate">{c.label}</span>
                        <Badge variant="outline" className="text-[10px]">{c.tipo}</Badge>
                        <span className="text-muted-foreground">×{c.peso}</span>
                      </div>
                    ))}
                  </div>
                  <Dialog open={openEval === p._id} onOpenChange={(o) => {
                    setOpenEval(o ? p._id : null);
                    setValoresTemp({});
                    setObservaciones("");
                    setEvalPersonalId("");
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="w-full" disabled={!p.activa}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Registrar evaluación
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{p.nombre}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Fecha</Label>
                            <Input
                              type="date"
                              value={registroFecha}
                              onChange={(e) => setRegistroFecha(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>{p.obligatoria && p.asignadosModo === "cargo" ? `Cajero (${p.asignadosCargo})` : "Persona"}</Label>
                            <Select value={evalPersonalId} onValueChange={setEvalPersonalId}>
                              <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                              <SelectContent>
                                {personalesElegibles(p, personales).map((per: any) => (
                                  <SelectItem key={per._id} value={per._id}>
                                    {per.apellidos} {per.nombres} ({per.nick}){per.cargo ? ` · ${per.cargo}` : ""}
                                  </SelectItem>
                                ))}
                                {personalesElegibles(p, personales).length === 0 && (
                                  <div className="px-2 py-2 text-xs text-muted-foreground">Sin personal disponible</div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="border-t pt-2 space-y-2 max-h-80 overflow-y-auto">
                          {p.campos.map((c: any) => (
                            <div key={c.label}>
                              <Label>{c.label} <span className="text-xs text-muted-foreground">(peso {c.peso})</span></Label>
                              {c.tipo === "bool" ? (
                                <Select
                                  value={String(valoresTemp[c.label]?.valor ?? "")}
                                  onValueChange={(v) =>
                                    setValoresTemp({
                                      ...valoresTemp,
                                      [c.label]: { label: c.label, valor: v === "true", peso: c.peso },
                                    })
                                  }
                                >
                                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="true">Sí</SelectItem>
                                    <SelectItem value="false">No</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max={c.tipo === "0-20" ? 20 : 100}
                                  value={typeof valoresTemp[c.label]?.valor === "number" ? (valoresTemp[c.label] as any).valor : ""}
                                  onChange={(e) =>
                                    setValoresTemp({
                                      ...valoresTemp,
                                      [c.label]: { label: c.label, valor: parseFloat(e.target.value) || 0, peso: c.peso },
                                    })
                                  }
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div>
                          <Label>Observaciones</Label>
                          <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                        <Button onClick={() => handleGuardarEvaluacion(p._id)}>
                          <Save className="h-4 w-4 mr-1" /> Guardar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            ))}
            {plantillas?.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No hay plantillas. Crea la primera (ej. "Frutas y verduras", "Arqueos sorpresa", etc.)
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="seguimiento" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seguimiento por plantilla</CardTitle>
              <CardDescription>Elige una plantilla y una fecha para ver el cumplimiento y el historial.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Plantilla</Label>
                  <Select
                    value={historialPlantillaId}
                    onValueChange={(v: any) => {
                      setHistorialPlantillaId(v);
                      const pl = plantillas?.find((p: any) => p._id === v);
                      if (pl?.recurrencia === "15dias") {
                        setSeguimientoFecha(fechaDeMitad(mitadDelMes(seguimientoFecha), seguimientoFecha));
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecciona plantilla" /></SelectTrigger>
                    <SelectContent>
                      {plantillas?.map((p: any) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.nombre}{p.recurrencia === "15dias" ? " · 15d" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={seguimientoFecha}
                      onChange={(e) => setSeguimientoFecha(e.target.value)}
                      className="flex-1"
                    />
                    {(() => {
                      const pl = plantillas?.find((p: any) => p._id === historialPlantillaId);
                      if (pl?.recurrencia !== "15dias") return null;
                      const m = mitadDelMes(seguimientoFecha);
                      return (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={m === "primera" ? "default" : "outline"}
                            onClick={() => setSeguimientoFecha(fechaDeMitad("primera", seguimientoFecha))}
                            title="1ra mitad del mes (1 al 15)"
                          >
                            1ra
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={m === "segunda" ? "default" : "outline"}
                            onClick={() => setSeguimientoFecha(fechaDeMitad("segunda", seguimientoFecha))}
                            title="2da mitad del mes (16 al fin de mes)"
                          >
                            2da
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {historialPlantillaId && cumplimiento && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Cumplimiento — {seguimientoFecha}
                      {(() => {
                        const pl = plantillas?.find((p: any) => p._id === historialPlantillaId);
                        if (pl?.recurrencia !== "15dias") return null;
                        const m = etiquetaMitad(seguimientoFecha);
                        return (
                          <Badge variant="secondary" title={`${m.desde} a ${m.hasta}`}>
                            {m.label} ({m.desde.slice(8)}–{m.hasta.slice(8)})
                          </Badge>
                        );
                      })()}
                    </CardTitle>
                    <CardDescription>
                      {cumplimiento.total} asignados · {cumplimiento.hechos} hechos · {cumplimiento.pendientes} pendientes
                    </CardDescription>
                  </div>
                  {cumplimiento.total > 0 && (
                    <Badge variant={cumplimiento.pendientes === 0 ? "default" : "destructive"}>
                      {Math.round((cumplimiento.hechos / cumplimiento.total) * 100)}%
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {cumplimiento.total === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No hay personas asignadas a esta plantilla.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Persona</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Nota</TableHead>
                        <TableHead>Realizada</TableHead>
                        <TableHead>Observaciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cumplimiento.detalle.map((d: any) => (
                        <TableRow key={d.personalId} className={d.estado === "pendiente" ? "bg-red-50/40" : undefined}>
                          <TableCell>{d.apellidos} {d.nombres} <span className="text-xs text-muted-foreground">({d.nick})</span></TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{d.cargo}</Badge></TableCell>
                          <TableCell>
                            {d.estado === "hecho" ? (
                              <Badge variant="default" className="bg-green-600">Hecho</Badge>
                            ) : (
                              <Badge variant="destructive">Pendiente</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">{d.notaFinal !== undefined ? d.notaFinal.toFixed(1) : "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.fechaRealizada ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs">
                            {d.observaciones ? (
                              <span className="line-clamp-2" title={d.observaciones}>{d.observaciones}</span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {historialPlantillaId && !cumplimiento && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Esta plantilla no es obligatoria, solo se muestra el historial.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial completo</CardTitle>
              <CardDescription>Todas las evaluaciones registradas para esta plantilla.</CardDescription>
            </CardHeader>
            <CardContent>
              {!historialPlantillaId ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Selecciona una plantilla.</p>
              ) : !historial ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>
              ) : historial.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Sin evaluaciones registradas para esta plantilla.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cajero</TableHead>
                      <TableHead className="text-right">Nota</TableHead>
                      <TableHead>Observaciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historial.map((e: Evaluacion) => {
                      const per = personales?.find((p: any) => p._id === e.personalId);
                      return (
                        <TableRow key={e._id}>
                          <TableCell className="whitespace-nowrap">{e.fechaProgramada}</TableCell>
                          <TableCell>
                            {per ? `${per.apellidos} ${per.nombres} (${per.nick})` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{e.notaFinal.toFixed(1)}</TableCell>
                          <TableCell className="text-muted-foreground text-xs max-w-xs truncate" title={e.observaciones}>
                            {e.observaciones || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar plantilla</DialogTitle>
          </DialogHeader>
          {editPlantilla && (
            <PlantillaForm
              initial={{
                nombre: editPlantilla.nombre,
                tipoNota: editPlantilla.tipoNota,
                recurrencia: editPlantilla.recurrencia,
                campos: editPlantilla.campos,
                obligatoria: editPlantilla.obligatoria ?? false,
                asignadosModo: editPlantilla.asignadosModo ?? "todos",
                asignadosCargo: editPlantilla.asignadosCargo,
                asignadosIds: editPlantilla.asignadosIds,
              }}
              personales={personales as any}
              onSubmit={(data) => handleUpdate(editPlantilla._id, data)}
              onCancel={() => setEditId(null)}
              submitLabel="Guardar cambios"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
