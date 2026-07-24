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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { CalendarDays, Plus, Trash2, Edit } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

const MOTIVOS = [
  "Feedback",
  "Felicitación",
  "Amonestación verbal",
  "Capacitación",
  "Coordinación",
  "Otro",
];

export default function ReunionesPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const reuniones = useQuery(
    api.reuniones.listReuniones,
    tienda ? { tiendaId: tienda._id } : "skip"
  );
  const personales = useQuery(
    api.personales.list,
    tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip"
  );
  const create = useMutation(api.reuniones.createReunion);
  const updateNotas = useMutation(api.reuniones.updateNotas);
  const remove = useMutation(api.reuniones.deleteReunion);

  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState("10:00");
  const [duracion, setDuracion] = useState(30);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [notas, setNotas] = useState("");
  const [paraTodaArea, setParaTodaArea] = useState(false);
  const [asistentes, setAsistentes] = useState<Id<"personales">[]>([]);

  async function handleCreate() {
    if (!tienda) return;
    try {
      await create({
        tiendaId: tienda._id,
        fecha,
        hora,
        duracionMin: duracion,
        motivo,
        personalIds: paraTodaArea ? [] : asistentes,
        notas: notas || undefined,
        paraTodaArea,
      });
      toast.success("Reunión agendada");
      setOpen(false);
      setNotas("");
      setAsistentes([]);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Reuniones
          </h1>
          <p className="text-sm text-muted-foreground">Agenda con cajeros individuales, grupos o todo el área</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva reunión
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Agendar reunión</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
                <div>
                  <Label>Duración (min)</Label>
                  <Input type="number" value={duracion} onChange={(e) => setDuracion(parseInt(e.target.value) || 30)} />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="text-sm font-medium">Para toda el área</div>
                  <div className="text-xs text-muted-foreground">Se incluirán todos los activos</div>
                </div>
                <Switch checked={paraTodaArea} onCheckedChange={setParaTodaArea} />
              </div>
              {!paraTodaArea && (
                <div>
                  <Label>Asistentes</Label>
                  <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1">
                    {personales?.map((p: any) => (
                      <label key={p._id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={asistentes.includes(p._id)}
                          onCheckedChange={(checked) => {
                            if (checked) setAsistentes([...asistentes, p._id]);
                            else setAsistentes(asistentes.filter((id) => id !== p._id));
                          }}
                        />
                        {p.apellidos} {p.nombres} <span className="text-muted-foreground text-xs">({p.cargo})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>Notas (opcional)</Label>
                <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={handleCreate}>Agendar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {reuniones?.map((r: any) => {
          const asistentesNombres = r.paraTodaArea
            ? "Toda el área"
            : r.personalIds
                .map((id: Id<"personales">) => personales?.find((p: any) => p._id === id))
                .filter(Boolean)
                .map((p: any) => p.nick || p.nombres)
                .join(", ");
          return (
            <Card key={r._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{r.motivo}</CardTitle>
                    <CardDescription>{r.fecha} {r.hora} · {r.duracionMin} min</CardDescription>
                    <div className="text-xs text-muted-foreground mt-1">Asistentes: {asistentesNombres}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove({ id: r._id })}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardHeader>
              {r.notas && (
                <CardContent>
                  <div className="text-sm bg-muted/50 p-2 rounded">{r.notas}</div>
                </CardContent>
              )}
            </Card>
          );
        })}
        {reuniones?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No hay reuniones agendadas
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
