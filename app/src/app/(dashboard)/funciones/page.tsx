"use client";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Plus, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";

const COLORES = [
  { name: "Rojo", hex: "#ef4444" },
  { name: "Verde", hex: "#22c55e" },
  { name: "Azul", hex: "#3b82f6" },
  { name: "Amarillo", hex: "#eab308" },
  { name: "Morado", hex: "#a855f7" },
  { name: "Naranja", hex: "#f97316" },
  { name: "Rosa", hex: "#ec4899" },
  { name: "Gris", hex: "#6b7280" },
];

export default function FuncionesPage() {
  const tienda = useQuery(api.tiendas.getTiendaDefault);
  const funciones = useQuery(api.cajas.listFunciones, tienda ? { tiendaId: tienda._id } : "skip");
  const create = useMutation(api.cajas.createFuncion);
  const remove = useMutation(api.cajas.deleteFuncion);

  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES[0].hex);

  async function handleCreate() {
    if (!tienda) return;
    if (!nombre.trim()) {
      toast.error("Ingresa un nombre");
      return;
    }
    try {
      await create({ tiendaId: tienda._id, nombre, color });
      toast.success("Función creada");
      setOpen(false);
      setNombre("");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Funciones Secundarias</h1>
          <p className="text-sm text-muted-foreground">
            Funciones que se asignan a un cajero en el tablero (refrigerio, apoyo, capacitación, etc.)
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva función
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva función secundaria</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Refrigerio, Apoyo en góndola, Capacitación..."
                />
              </div>
              <div>
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap mt-2">
                  {COLORES.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        color === c.hex ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {funciones?.map((f: any) => (
          <Card key={f._id}>
            <CardContent className="pt-4 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full"
                style={{ backgroundColor: f.color }}
              />
              <div className="flex-1">
                <div className="font-medium">{f.nombre}</div>
                <div className="text-xs text-muted-foreground">{f.color}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove({ id: f._id }).then(() => toast.success("Eliminada"))}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {funciones?.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No hay funciones secundarias. Crea la primera.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
