"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap, Plus, CheckCircle2, Trash2 } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

export default function InduccionesPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const inducciones = useQuery(
    api.inducciones.listInducciones,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );
  const create = useMutation(api.inducciones.createInduccion);
  const marcar = useMutation(api.inducciones.marcarRecibido);
  const remove = useMutation(api.inducciones.deleteInduccion);

  const [open, setOpen] = useState(false);
  const [tema, setTema] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const [plazo, setPlazo] = useState("");
  const [asistenciales, setAsistenciales] = useState<Id<"personales">[]>([]);

  async function handleCreate() {
    if (!tienda) return;
    try {
      await create({
        tiendaId: tienda._id,
        tema,
        descripcion,
        fechaProgramada: fecha,
        plazo: plazo || undefined,
        asistenciales: asistenciales.map((id) => ({ personalId: id })),
      });
      toast.success("Inducción creada");
      setOpen(false);
      setTema("");
      setDescripcion("");
      setAsistenciales([]);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Inducciones
          </h1>
          <p className="text-sm text-muted-foreground">Programar y llevar registro de capacitaciones</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva inducción
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Programar inducción</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div>
                <Label>Tema</Label>
                <Input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Manejo de caja registradora" />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div>
                  <Label>Plazo (opcional)</Label>
                  <Input type="date" value={plazo} onChange={(e) => setPlazo(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Asistentes</Label>
                <div className="border rounded p-2 max-h-60 overflow-y-auto space-y-1">
                  {personales?.map((p: any) => (
                    <label key={p._id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={asistenciales.includes(p._id)}
                        onCheckedChange={(checked) => {
                          if (checked) setAsistenciales([...asistenciales, p._id]);
                          else setAsistenciales(asistenciales.filter((id) => id !== p._id));
                        }}
                      />
                      <span>{p.apellidos} {p.nombres} <span className="text-muted-foreground text-xs">({p.cargo})</span></span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={handleCreate}>Crear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {inducciones?.map((ind: any) => {
          const total = ind.asistenciales.length;
          const recibidos = ind.asistenciales.filter((a: any) => a.fechaRecibido).length;
          const porcentaje = total > 0 ? Math.round((recibidos / total) * 100) : 0;
          return (
            <Card key={ind._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{ind.tema}</CardTitle>
                    <CardDescription>{ind.descripcion}</CardDescription>
                    <div className="text-xs text-muted-foreground mt-1">
                      Programada: {ind.fechaProgramada} {ind.plazo && `· Plazo: ${ind.plazo}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={porcentaje === 100 ? "success" : porcentaje > 0 ? "warning" : "secondary"}>
                      {recibidos}/{total} ({porcentaje}%)
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => remove({ id: ind._id })}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {ind.asistenciales.map((a: any) => {
                    const p = personales?.find((pp: any) => pp._id === a.personalId);
                    if (!p) return null;
                    return (
                      <div key={a.personalId} className="flex items-center justify-between text-sm py-1 px-2 hover:bg-muted/50 rounded">
                        <div>
                          {p.apellidos} {p.nombres} <span className="text-muted-foreground text-xs">({p.nick})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.fechaRecibido ? (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> {a.fechaRecibido}
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                marcar({ induccionId: ind._id, personalId: a.personalId }).then(() =>
                                  toast.success(`${p.nick} marcado`)
                                )
                              }
                            >
                              Marcar recibido
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {inducciones?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No hay inducciones programadas
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
