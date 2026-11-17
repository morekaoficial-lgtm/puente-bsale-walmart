import { useEffect, useState } from "react";
import { Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RunDialog({
  open,
  onOpenChange,
  productionWritesEnabled,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productionWritesEnabled: boolean;
  onCompleted: (runId: number) => void;
}) {
  const [mode, setMode] = useState<"simulation" | "sandbox" | "production">("simulation");
  const [sku, setSku] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const utils = trpc.useUtils();
  const run = trpc.integration.runSync.useMutation({
    onSuccess: (result) => {
      toast.success(result.mode === "simulation" ? "Simulación completada" : "Sincronización completada", {
        description: result.message || undefined,
      });
      onOpenChange(false);
      onCompleted(result.id);
      void utils.integration.dashboard.invalidate();
      void utils.integration.runItems.invalidate();
    },
    onError: (error) => toast.error("No se pudo iniciar", { description: error.message }),
  });

  useEffect(() => {
    if (open) {
      setMode("simulation");
      setSku("");
      setConfirmation("");
    }
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run.mutate({
      mode,
      sku: sku.trim() || undefined,
      productionConfirmation: mode === "production" ? confirmation : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#34343e] bg-[#17171c] text-[#ececf0] sm:max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="text-xl">Nueva sincronización</DialogTitle>
            <DialogDescription className="text-[#aaaab6]">
              Lee el stock disponible de Bsale, descuenta el stock de seguridad y compara el resultado por SKU.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="run-mode">Entorno</Label>
            <select
              id="run-mode"
              className="field-control"
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="simulation">Simulación · no escribe en Walmart</option>
              <option value="sandbox">Sandbox · escribe solo en pruebas</option>
              <option value="production">Producción · SKU o catálogo permitido</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="run-sku">SKU opcional</Label>
            <Input
              id="run-sku"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder={mode === "simulation" ? "DEMO-CAFE-500" : "SKU exacto en Bsale y Walmart"}
              className="field-control font-mono"
            />
            <p className="field-help">
              Si lo dejas vacío, se procesa el catálogo permitido en la configuración. Un catálogo real se consulta por páginas y solo envía las diferencias en un feed.
            </p>
          </div>

          {mode === "production" && (
            <div className="space-y-3 rounded-md border border-[#735c27] bg-[#2b2416] p-4">
              <div className="flex gap-3 text-[#f2c45c]">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <p className="text-sm leading-6">
                  Esta acción modifica inventario real. Escribe <strong>{sku.trim() ? `ACTUALIZAR ${sku.trim()}` : "ACTUALIZAR CATÁLOGO"}</strong> para confirmar.
                  {!sku.trim() && " Se procesará únicamente la lista permitida; si está vacía, se incluirá toda la sucursal."}
                </p>
              </div>
              <Input
                aria-label="Confirmación de producción"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="field-control font-mono"
                autoComplete="off"
                required
              />
              {!productionWritesEnabled && (
                <p className="text-sm text-[#ff8d7e]">
                  El servidor aún tiene las escrituras bloqueadas con ALLOW_WALMART_WRITES.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={run.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-[#78dcca] text-[#10221f] hover:bg-[#91e6d7]"
              disabled={run.isPending || (mode === "production" && !productionWritesEnabled)}
            >
              <Play className="size-4" aria-hidden="true" />
              {run.isPending ? "Procesando…" : mode === "simulation" ? "Ejecutar simulación" : "Iniciar sincronización"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
