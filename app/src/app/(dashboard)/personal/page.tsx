"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Search, Edit, Trash2, Zap, UserCog, ShieldCheck, Upload, CheckCircle2, AlertCircle, XCircle, Users, KeyRound } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

const CARGOS = [
  { value: "Cajer@", label: "Cajer@" },
  { value: "Self Checkout", label: "Self Checkout" },
  { value: "RS", label: "Representante de Servicios" },
  { value: "Ecommerce", label: "Ecommerce" },
  { value: "Supervisor(@)", label: "Supervisor(a)" },
] as const;

type Cargo = typeof CARGOS[number]["value"];

export default function PersonalPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const supervisores = useQuery(
    api.users.listSupervisores,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const create = useMutation(api.personales.create);
  const update = useMutation(api.personales.update);
  const remove = useMutation(api.personales.remove);
  const toggleRapida = useMutation(api.personales.toggleSoloCajaRapida);
  const pegarEmpleados = useMutation(api.personales.pegarEmpleados);
  const pegarOperadores = useMutation(api.personales.pegarOperadores);

  const [search, setSearch] = useState("");
  const [filterCargo, setFilterCargo] = useState<Cargo | "ALL">("ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const filtered = personales?.filter((p) => {
    if (!p.activo) return false;
    if (filterCargo !== "ALL" && p.cargo !== filterCargo) return false;
    if (search) {
      const q = search.toUpperCase();
      return p.apellidos.includes(q) || p.nombres.includes(q) || p.nick.toUpperCase().includes(q);
    }
    return true;
  });

  const byCargo = (cargo: Cargo) => filtered?.filter((p) => p.cargo === cargo) ?? [];

  async function handleCreateOrUpdate(form: FormData) {
    if (!tienda) return;
    const apellidos = String(form.get("apellidos") || "").trim();
    const nombres = String(form.get("nombres") || "").trim();
    const nick = String(form.get("nick") || "").trim();
    const cargo = String(form.get("cargo") || "") as Cargo;
    const codigoEmpleado = String(form.get("codigoEmpleado") || "").trim() || undefined;
    const codigoOperadorCaja = String(form.get("codigoOperadorCaja") || "").trim() || undefined;
    const soloCajaRapida = form.get("soloCajaRapida") === "on";
    const esAsistenteAutoservicio = form.get("esAsistenteAutoservicio") === "on";

    if (!apellidos || !nombres || !nick || !cargo) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    try {
      if (editing) {
        await update({
          id: editing._id,
          apellidos,
          nombres,
          nick,
          cargo: cargo as any,
          codigoEmpleado,
          codigoOperadorCaja,
          soloCajaRapida,
          esAsistenteAutoservicio,
        });
        toast.success("Personal actualizado");
      } else {
        await create({
          tiendaId: tienda._id,
          apellidos,
          nombres,
          nick,
          cargo: cargo as any,
          codigoEmpleado,
          codigoOperadorCaja,
          soloCajaRapida,
          esAsistenteAutoservicio,
        });
        toast.success("Personal creado");
      }
      setOpen(false);
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    }
  }

  async function handleDelete(id: Id<"personales">) {
    if (!confirm("¿Eliminar a esta persona? (soft delete)")) return;
    try {
      await remove({ id });
      toast.success("Eliminado");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleToggleRapida(id: Id<"personales">) {
    try {
      const nuevoEstado = await toggleRapida({ id });
      toast.success(nuevoEstado ? "Marcado como solo caja rápida" : "Quitado de solo caja rápida");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Personal</h1>
          <p className="text-sm text-muted-foreground">Cajeros, supervisores y staff del área</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Nuevo personal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar" : "Nuevo"} personal</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateOrUpdate(new FormData(e.currentTarget));
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Apellidos *</Label>
                  <Input name="apellidos" defaultValue={editing?.apellidos} required />
                </div>
                <div>
                  <Label>Nombres *</Label>
                  <Input name="nombres" defaultValue={editing?.nombres} required />
                </div>
              </div>
              <div>
                <Label>Nick (cómo le gusta que le llamen) *</Label>
                <Input name="nick" defaultValue={editing?.nick} required placeholder="Ej. Gustavo, Sole, Mari" />
              </div>
              <div>
                <Label>Cargo *</Label>
                <Select name="cargo" defaultValue={editing?.cargo ?? "Cajer@"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARGOS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Código de empleado</Label>
                  <Input name="codigoEmpleado" defaultValue={editing?.codigoEmpleado} />
                </div>
                <div>
                  <Label>Código operador de caja</Label>
                  <Input name="codigoOperadorCaja" defaultValue={editing?.codigoOperadorCaja} />
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between p-2 rounded border">
                  <div>
                    <div className="text-sm font-medium">Solo caja rápida</div>
                    <div className="text-xs text-muted-foreground">Solo se asigna a cajas 19-24</div>
                  </div>
                  <Switch name="soloCajaRapida" defaultChecked={editing?.soloCajaRapida} />
                </div>
                <div className="flex items-center justify-between p-2 rounded border">
                  <div>
                    <div className="text-sm font-medium">Asistente de autoservicio</div>
                    <div className="text-xs text-muted-foreground">Encargado único de cajas 25-30</div>
                  </div>
                  <Switch name="esAsistenteAutoservicio" defaultChecked={editing?.esAsistenteAutoservicio} />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit">{editing ? "Guardar" : "Crear"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o nick..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCargo} onValueChange={(v) => setFilterCargo(v as any)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar cargo" />
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
        <Badge variant="secondary">{filtered?.length ?? 0} personas</Badge>
      </div>

      {/* Pegado masivo */}
      <PegadoMasivoCard
        tiendaId={tienda?._id}
        personales={personales ?? []}
        pegarEmpleados={pegarEmpleados}
        pegarOperadores={pegarOperadores}
      />

      <Tabs defaultValue="ALL">
        <TabsList>
          <TabsTrigger value="ALL">Todos</TabsTrigger>
          {CARGOS.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>
              {c.label} ({byCargo(c.value).length})
            </TabsTrigger>
          ))}
        </TabsList>
        {["ALL", ...CARGOS.map((c) => c.value)].map((tab) => {
          const list = tab === "ALL" ? filtered : byCargo(tab as Cargo);
          return (
            <TabsContent key={tab} value={tab}>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Nick</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Cód. Empleado</TableHead>
                      <TableHead>Cód. Operador</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead className="w-32">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list?.map((p) => (
                      <TableRow key={p._id}>
                        <TableCell>
                          <div className="font-medium">{p.apellidos} {p.nombres}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.nick}</Badge>
                        </TableCell>
                        <TableCell>{p.cargo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.codigoEmpleado || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.codigoOperadorCaja || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {p.soloCajaRapida && (
                              <Badge variant="warning" title="Solo caja rápida">
                                <Zap className="h-3 w-3 mr-1" />Rápida
                              </Badge>
                            )}
                            {p.esAsistenteAutoservicio && (
                              <Badge variant="secondary" title="Asistente autoservicio">
                                <UserCog className="h-3 w-3 mr-1" />Auto
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(p);
                                setOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleRapida(p._id)}
                              title="Toggle solo caja rápida"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(p._id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {list?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No hay personal
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// =============================================================
// PEGADO MASIVO - 2 tipos
// =============================================================
function PegadoMasivoCard({
  tiendaId,
  personales,
  pegarEmpleados,
  pegarOperadores,
}: {
  tiendaId?: any;
  personales: any[];
  pegarEmpleados: any;
  pegarOperadores: any;
}) {
  const [tab, setTab] = useState<"empleados" | "operadores">("empleados");
  const [textoEmpleados, setTextoEmpleados] = useState("");
  const [textoOperadores, setTextoOperadores] = useState("");
  const [umbral, setUmbral] = useState(0.85);
  const [resultadoEmpleados, setResultadoEmpleados] = useState<any>(null);
  const [resultadoOperadores, setResultadoOperadores] = useState<any>(null);
  const [open, setOpen] = useState(false);

  // Parsear pegado de empleados en preview
  const previewEmpleados = useMemo(() => {
    if (!textoEmpleados.trim()) return [];
    return textoEmpleados.split("\n").map((l, i) => {
      const linea = l.trim();
      if (!linea) return null;
      let codigo = "", nombre = "", apellidos = "";
      if (linea.includes("|")) {
        const p = linea.split("|").map((s) => s.trim());
        codigo = p[0] ?? "";
        if (p.length >= 3) {
          nombre = p[1] ?? "";
          apellidos = p.slice(2).join(" ");
        } else {
          const nc = p[1] ?? "";
          const t = nc.split(/\s+/);
          nombre = t[0] ?? "";
          apellidos = t.slice(1).join(" ");
        }
      } else {
        const p = linea.split(",").map((s) => s.trim());
        if (p.length >= 3) {
          codigo = p[0]; nombre = p[1]; apellidos = p.slice(2).join(" ");
        } else if (p.length === 2) {
          codigo = p[0];
          const nc = p[1];
          const t = nc.split(/\s+/);
          nombre = t[0];
          apellidos = t.slice(1).join(" ");
        } else {
          codigo = p[0] ?? "";
        }
      }
      const yaExiste = personales.find((per) => per.codigoEmpleado === codigo);
      return {
        linea: i + 1,
        texto: linea,
        codigo,
        nombre,
        apellidos,
        nombreCompleto: `${nombre} ${apellidos}`.trim(),
        existe: !!yaExiste,
        accion: yaExiste ? "actualizar" : "crear",
      };
    }).filter(Boolean);
  }, [textoEmpleados, personales]);

  // Parsear pegado de operadores en preview
  const previewOperadores = useMemo(() => {
    if (!textoOperadores.trim()) return [];
    const mapearSimilitud = (a: string, b: string) => {
      const a1 = a.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").trim();
      const b1 = b.toLowerCase().replace(/[^a-záéíóúñü\s]/g, "").trim();
      if (!a1 || !b1) return 0;
      if (a1 === b1) return 1;
      const tA = new Set(a1.split(/\s+/).filter((t) => t.length > 1));
      const tB = new Set(b1.split(/\s+/).filter((t) => t.length > 1));
      if (tA.size === 0 || tB.size === 0) return 0;
      let inter = 0;
      for (const t of tA) if (tB.has(t)) inter++;
      const u = new Set([...tA, ...tB]).size;
      return inter / u;
    };
    return textoOperadores.split("\n").map((l, i) => {
      const linea = l.trim();
      if (!linea) return null;
      let codigoCaja = "", nombreCompleto = "";
      if (linea.includes("|")) {
        const p = linea.split("|").map((s) => s.trim());
        codigoCaja = p[0] ?? "";
        nombreCompleto = p.slice(1).join(" ");
      } else {
        const p = linea.split(",").map((s) => s.trim());
        codigoCaja = p[0] ?? "";
        nombreCompleto = p.slice(1).join(" ");
      }
      let best: { nombre: string; sim: number } | null = null;
      for (const per of personales) {
        const ncP = `${per.nombres} ${per.apellidos}`.trim();
        const sim = mapearSimilitud(nombreCompleto, ncP);
        if (!best || sim > best.sim) best = { nombre: ncP, sim };
      }
      const sim = best?.sim ?? 0;
      return {
        linea: i + 1,
        texto: linea,
        codigoCaja,
        nombreCompleto,
        match: best?.nombre,
        sim,
        aprobado: sim >= umbral,
      };
    }).filter(Boolean);
  }, [textoOperadores, personales, umbral]);

  const totalEmpOK = previewEmpleados.filter((p) => p.nombreCompleto.length > 0).length;
  const totalOpAprob = previewOperadores.filter((p) => p.aprobado).length;
  const totalOpRech = previewOperadores.filter((p) => !p.aprobado && p.nombreCompleto.length > 0).length;

  async function handlePegarEmpleados() {
    if (!tiendaId) {
      toast.error("Tienda no cargada");
      return;
    }
    const lineas = textoEmpleados.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lineas.length === 0) {
      toast.error("No hay líneas para importar");
      return;
    }
    try {
      const res = await pegarEmpleados({ tiendaId, lineas });
      setResultadoEmpleados(res);
      toast.success(`Creados: ${res.creados.length} · Actualizados: ${res.actualizados.length} · Errores: ${res.errores.length}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handlePegarOperadores() {
    if (!tiendaId) {
      toast.error("Tienda no cargada");
      return;
    }
    const lineas = textoOperadores.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lineas.length === 0) {
      toast.error("No hay líneas para importar");
      return;
    }
    try {
      const res = await pegarOperadores({ tiendaId, lineas, umbralSimilitud: umbral });
      setResultadoOperadores(res);
      toast.success(`Asignados: ${res.asignados.length} · No encontrados: ${res.noEncontrados.length}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Pegado masivo
          </CardTitle>
          <Button variant="ghost" size="sm">
            {open ? "Ocultar" : "Expandir"}
          </Button>
        </div>
        <CardDescription>
          2 modos: pegar empleados (código + nombre) o pegar operadores de caja (código + nombre)
        </CardDescription>
      </CardHeader>
      {open && (
        <CardContent>
          <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
            <TabsList className="grid grid-cols-2 w-full max-w-md">
              <TabsTrigger value="empleados">
                <Users className="h-3 w-3 mr-1" /> Empleados
              </TabsTrigger>
              <TabsTrigger value="operadores">
                <KeyRound className="h-3 w-3 mr-1" /> Operadores de caja
              </TabsTrigger>
            </TabsList>

            <TabsContent value="empleados" className="space-y-3 mt-3">
              <div className="bg-muted/50 p-2 rounded text-xs">
                <div className="font-semibold mb-1">Formato aceptado (por línea):</div>
                <ul className="space-y-0.5 font-mono">
                  <li>12345, JUAN, PEREZ LOPEZ</li>
                  <li>12345 | JUAN | PEREZ LOPEZ</li>
                  <li>12345, JUAN PEREZ LOPEZ (sin coma: nombre completo)</li>
                </ul>
                <div className="mt-1 text-muted-foreground">
                  Si el código ya existe, se actualiza el nombre. Si no, se crea (cargo=Cajer@ por defecto).
                </div>
              </div>
              <Textarea
                value={textoEmpleados}
                onChange={(e) => setTextoEmpleados(e.target.value)}
                placeholder="12345, JUAN, PEREZ LOPEZ&#10;12346, MARIA, GARCIA LOPEZ&#10;12347 | CARLOS | RODRIGUEZ"
                className="font-mono text-xs min-h-[140px]"
              />
              {previewEmpleados.length > 0 && (
                <div className="text-xs space-y-1 max-h-48 overflow-y-auto font-mono border rounded p-2 bg-background">
                  {previewEmpleados.map((p) => (
                    <div key={p.linea} className="flex items-center gap-1">
                      {p.existe ? (
                        <AlertCircle className="h-3 w-3 text-yellow-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      )}
                      <span className="text-muted-foreground">L{p.linea}:</span>
                      <span className="font-semibold">{p.codigo || "?"}</span>
                      <span>·</span>
                      <span className="truncate flex-1">{p.nombreCompleto || "(vacío)"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {p.existe ? "actualizar" : "crear"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{totalEmpOK} líneas válidas</Badge>
                <Button onClick={handlePegarEmpleados} disabled={!tiendaId || totalEmpOK === 0}>
                  <Upload className="h-4 w-4 mr-1" /> Importar {totalEmpOK} empleados
                </Button>
              </div>
              {resultadoEmpleados && (
                <div className="text-xs p-2 bg-muted/50 rounded">
                  ✅ {resultadoEmpleados.creados.length} creados · 🔄 {resultadoEmpleados.actualizados.length} actualizados · ❌ {resultadoEmpleados.errores.length} errores
                  {resultadoEmpleados.errores.length > 0 && (
                    <ul className="mt-1 text-red-600">
                      {resultadoEmpleados.errores.map((e: any, i: number) => (
                        <li key={i}>L{e.linea}: {e.error} - "{e.texto}"</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="operadores" className="space-y-3 mt-3">
              <div className="bg-muted/50 p-2 rounded text-xs">
                <div className="font-semibold mb-1">Formato aceptado (por línea):</div>
                <ul className="space-y-0.5 font-mono">
                  <li>C01, MARCELA YUPANQUI</li>
                  <li>C02 | JUAN PEREZ LOPEZ</li>
                </ul>
                <div className="mt-1 text-muted-foreground">
                  El sistema busca por similitud del nombre completo (≥ {Math.round(umbral * 100)}%) y asigna el código de operador de caja al match.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Umbral de similitud:</Label>
                <Input
                  type="number"
                  min="0.5"
                  max="1"
                  step="0.01"
                  value={umbral}
                  onChange={(e) => setUmbral(parseFloat(e.target.value) || 0.85)}
                  className="w-20 h-7 text-xs"
                />
                <span className="text-xs text-muted-foreground">({Math.round(umbral * 100)}%)</span>
              </div>
              <Textarea
                value={textoOperadores}
                onChange={(e) => setTextoOperadores(e.target.value)}
                placeholder="C01, MARCELA YUPANQUI&#10;C02 | JUAN PEREZ LOPEZ&#10;C03, MARIA GARCIA"
                className="font-mono text-xs min-h-[140px]"
              />
              {previewOperadores.length > 0 && (
                <div className="text-xs space-y-1 max-h-48 overflow-y-auto font-mono border rounded p-2 bg-background">
                  {previewOperadores.map((p) => (
                    <div key={p.linea} className="flex items-center gap-1">
                      {p.aprobado ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      )}
                      <span className="text-muted-foreground">L{p.linea}:</span>
                      <span className="font-semibold">{p.codigoCaja || "?"}</span>
                      <span>·</span>
                      <span className="truncate flex-1">{p.nombreCompleto || "(vacío)"}</span>
                      {p.match && (
                        <span className="text-[10px]">
                          → {p.match} <span className={p.aprobado ? "text-green-600" : "text-red-600"}>({Math.round(p.sim * 100)}%)</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="success">{totalOpAprob} serán asignados</Badge>
                {totalOpRech > 0 && <Badge variant="destructive">{totalOpRech} sin match</Badge>}
                <Button onClick={handlePegarOperadores} disabled={!tiendaId}>
                  <Upload className="h-4 w-4 mr-1" /> Asignar {totalOpAprob} operadores
                </Button>
              </div>
              {resultadoOperadores && (
                <div className="text-xs p-2 bg-muted/50 rounded space-y-1">
                  <div>✅ {resultadoOperadores.asignados.length} asignados · ❌ {resultadoOperadores.noEncontrados.length} sin match</div>
                  {resultadoOperadores.noEncontrados.length > 0 && (
                    <ul className="text-red-600">
                      {resultadoOperadores.noEncontrados.map((e: any, i: number) => (
                        <li key={i}>
                          L{e.linea}: {e.codigoCaja || "?"} - "{e.texto}"
                          {e.mejorMatch && (
                            <span className="text-yellow-600 ml-1">
                              (mejor: {e.mejorMatch.nombre} {Math.round(e.mejorMatch.similitud * 100)}%)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
