"use client";
import { useState } from "react";
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
import { Plus, ClipboardCheck, CheckCircle2, Save } from "lucide-react";
import { toISODate } from "@/lib/utils";
import { toast } from "sonner";

export default function EvaluacionesPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const plantillas = useQuery(api.evaluaciones.listPlantillas, tienda ? { tiendaId: tienda._id } : "skip");
  const personales = useQuery(api.personales.list, tienda ? { tiendaId: tienda._id, soloActivos: true } : "skip");
  const create = useMutation(api.evaluaciones.createPlantilla);
  const upsertEval = useMutation(api.evaluaciones.upsertEvaluacion);

  const [open, setOpen] = useState(false);
  const [openEval, setOpenEval] = useState<string | null>(null);
  const [registroFecha, setRegistroFecha] = useState(toISODate(new Date()));

  const [nombre, setNombre] = useState("");
  const [tipoNota, setTipoNota] = useState<"0-20" | "0-100" | "bool">("0-20");
  const [recurrencia, setRecurrencia] = useState<"diaria" | "15dias" | "unica">("diaria");
  const [camposTexto, setCamposTexto] = useState("Producto fresco,1\nAtención,1\nVelocidad,1");

  const [evalPersonalId, setEvalPersonalId] = useState<string>("");
  const [valoresTemp, setValoresTemp] = useState<Record<string, { label: string; valor: number | boolean; peso: number }>>({});
  const [observaciones, setObservaciones] = useState("");

  async function handleCreate() {
    if (!tienda) return;
    const campos = camposTexto.split("\n").map((l) => {
      const [label, pesoStr] = l.split(",").map((s) => s.trim());
      return { label, tipo: tipoNota, peso: parseFloat(pesoStr) || 1 };
    }).filter((c) => c.label);
    try {
      await create({ tiendaId: tienda._id, nombre, tipoNota, campos, recurrencia });
      toast.success("Plantilla creada");
      setOpen(false);
      setNombre("");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleGuardarEvaluacion(plantillaId: string) {
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
        plantillaId: plantillaId as any,
        fechaProgramada: registroFecha,
        personalId: evalPersonalId as any,
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva plantilla
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva plantilla de evaluación</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Frutas y verduras" />
              </div>
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
              <div>
                <Label>Campos (uno por línea: "nombre,peso")</Label>
                <Textarea value={camposTexto} onChange={(e) => setCamposTexto(e.target.value)} className="min-h-32" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={handleCreate}>Crear</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {plantillas?.map((p: any) => (
          <Card key={p._id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{p.nombre}</CardTitle>
                <div className="flex gap-1">
                  <Badge variant="outline">{p.tipoNota}</Badge>
                  <Badge variant="secondary">{p.recurrencia}</Badge>
                </div>
              </div>
              <CardDescription>{p.campos.length} campos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs space-y-1 mb-3">
                {p.campos.map((c: any, i: number) => (
                  <div key={i}>• {c.label} (peso {c.peso})</div>
                ))}
              </div>
              <Dialog open={openEval === p._id} onOpenChange={(o) => {
                setOpenEval(o ? p._id : null);
                setValoresTemp({});
                setObservaciones("");
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Registrar evaluación
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{p.nombre} — {registroFecha}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Cajero</Label>
                      <Select value={evalPersonalId} onValueChange={setEvalPersonalId}>
                        <SelectTrigger><SelectValue placeholder="Selecciona cajero" /></SelectTrigger>
                        <SelectContent>
                          {personales?.map((per: any) => (
                            <SelectItem key={per._id} value={per._id}>
                              {per.apellidos} {per.nombres} ({per.nick})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {p.campos.map((c: any) => (
                      <div key={c.label}>
                        <Label>{c.label} (peso {c.peso})</Label>
                        {c.tipo === "bool" ? (
                          <Select
                            value={String(valoresTemp[c.label]?.valor ?? "")}
                            onValueChange={(v) =>
                              setValoresTemp({
                                ...valoresTemp,
                                [c.label]: {
                                  label: c.label,
                                  valor: v === "true",
                                  peso: c.peso,
                                },
                              })
                            }
                          >
                            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Sí (aprobado)</SelectItem>
                              <SelectItem value="false">No (rechazado)</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max={c.tipo === "0-20" ? 20 : 100}
                            value={typeof valoresTemp[c.label]?.valor === "number" ? (valoresTemp[c.label] as any).valor : 0}
                            onChange={(e) =>
                              setValoresTemp({
                                ...valoresTemp,
                                [c.label]: {
                                  label: c.label,
                                  valor: parseFloat(e.target.value) || 0,
                                  peso: c.peso,
                                },
                              })
                            }
                          />
                        )}
                      </div>
                    ))}
                    <div>
                      <Label>Observaciones</Label>
                      <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
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
    </div>
  );
}
