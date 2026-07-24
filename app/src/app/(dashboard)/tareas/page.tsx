"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ListTodo, Plus, Trash2, CheckCircle2, RefreshCw, Edit } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

export default function TareasPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const [fecha, setFecha] = useState(toISODate(new Date()));

  const recurrentes = useQuery(api.tareas.listRecurrentes, tienda ? { tiendaId: tienda._id } : "skip");
  const instancias = useQuery(
    api.tareas.listInstancias,
    tienda ? { tiendaId: tienda._id, fecha } : "skip"
  );
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );

  const generar = useMutation(api.tareas.generarInstanciasDelDia);
  const createRec = useMutation(api.tareas.createRecurrente);
  const createIns = useMutation(api.tareas.createInstancia);
  const toggle = useMutation(api.tareas.toggleCompletada);
  const delRec = useMutation(api.tareas.deleteRecurrente);
  const delIns = useMutation(api.tareas.deleteInstancia);

  useEffect(() => {
    if (tienda) {
      generar({ tiendaId: tienda._id, fecha }).catch(console.error);
    }
  }, [tienda, fecha, generar]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="h-6 w-6" />
            Tareas del área
          </h1>
          <p className="text-sm text-muted-foreground">Recurrentes diarias + tareas del momento</p>
        </div>
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-44" />
      </div>

      <Tabs defaultValue="hoy">
        <TabsList>
          <TabsTrigger value="hoy">Hoy ({instancias?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="recurrentes">Recurrentes</TabsTrigger>
        </TabsList>
        <TabsContent value="hoy" className="space-y-2">
          <NuevaTareaMomento
            fecha={fecha}
            tiendaId={tienda?._id}
            personales={personales ?? []}
            onCreate={async (titulo, desc, plazo, ids) => {
              await createIns({ tiendaId: tienda!._id, fecha, titulo, descripcion: desc, plazo, asignadosIds: ids });
              toast.success("Tarea creada");
            }}
          />
          {instancias?.map((t: any) => (
            <Card key={t._id} className={t.estado === "completada" ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {t.titulo}
                      <Badge variant={t.estado === "completada" ? "success" : t.estado === "en_curso" ? "warning" : "secondary"}>
                        {t.estado}
                      </Badge>
                      {t.plazo && <Badge variant="outline">⏰ {t.plazo}</Badge>}
                    </CardTitle>
                    {t.descripcion && <CardDescription>{t.descripcion}</CardDescription>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => delIns({ id: t._id })}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {t.asignadosIds.map((id: Id<"personales">) => {
                    const p = personales?.find((pp: any) => pp._id === id);
                    if (!p) return null;
                    const done = t.completadosIds.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggle({ tareaId: t._id, personalId: id })}
                        />
                        <span className={done ? "line-through text-muted-foreground" : ""}>
                          {p.apellidos} {p.nombres} <span className="text-xs">({p.nick})</span>
                        </span>
                        {done && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="recurrentes" className="space-y-2">
          <NuevaRecurrente
            onCreate={async (titulo, desc, hora) => {
              await createRec({ tiendaId: tienda!._id, titulo, descripcion: desc, horaSugerida: hora });
              toast.success("Recurrente creada");
            }}
          />
          {recurrentes?.map((r: any) => (
            <Card key={r._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{r.titulo}</CardTitle>
                    {r.descripcion && <CardDescription>{r.descripcion}</CardDescription>}
                    {r.horaSugerida && <div className="text-xs text-muted-foreground">⏰ {r.horaSugerida}</div>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => delRec({ id: r._id })}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NuevaTareaMomento({ fecha, tiendaId, personales, onCreate }: any) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [desc, setDesc] = useState("");
  const [plazo, setPlazo] = useState("");
  const [asignados, setAsignados] = useState<Id<"personales">[]>([]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" /> Agregar tarea del momento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva tarea del momento - {fecha}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Reponer bolsas" /></div>
          <div><Label>Descripción</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div><Label>Plazo (opcional)</Label><Input type="time" value={plazo} onChange={(e) => setPlazo(e.target.value)} /></div>
          <div>
            <Label>Asignar a</Label>
            <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1">
              {personales.map((p: any) => (
                <label key={p._id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={asignados.includes(p._id)}
                    onCheckedChange={(c) => {
                      if (c) setAsignados([...asignados, p._id]);
                      else setAsignados(asignados.filter((id) => id !== p._id));
                    }}
                  />
                  {p.apellidos} {p.nombres} <span className="text-muted-foreground text-xs">({p.cargo})</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button onClick={() => { onCreate(titulo, desc, plazo, asignados); setOpen(false); setTitulo(""); setDesc(""); setAsignados([]); }}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevaRecurrente({ onCreate }: any) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [desc, setDesc] = useState("");
  const [hora, setHora] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" /> Agregar tarea recurrente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva tarea recurrente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Devoluciones a góndola" /></div>
          <div><Label>Descripción</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div><Label>Hora sugerida</Label><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button onClick={() => { onCreate(titulo, desc, hora); setOpen(false); setTitulo(""); setDesc(""); }}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
