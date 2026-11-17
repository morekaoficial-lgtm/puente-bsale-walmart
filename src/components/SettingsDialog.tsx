import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SettingsValue = {
  bsaleOfficeId: string | null;
  walmartShipNode: string | null;
  safetyStock: number;
  intervalMinutes: number;
  autoSyncEnabled: boolean;
  skuAllowlist: string | null;
};

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: SettingsValue;
}) {
  const [form, setForm] = useState(settings);
  const utils = trpc.useUtils();
  const save = trpc.integration.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada");
      onOpenChange(false);
      void utils.integration.dashboard.invalidate();
    },
    onError: (error) => toast.error("No se pudo guardar", { description: error.message }),
  });

  useEffect(() => {
    if (open) setForm(settings);
  }, [open, settings]);

  const update = <K extends keyof SettingsValue>(key: K, value: SettingsValue[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate({
      ...form,
      bsaleOfficeId: form.bsaleOfficeId?.trim() || null,
      walmartShipNode: form.walmartShipNode?.trim() || null,
      skuAllowlist: form.skuAllowlist?.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-[#34343e] bg-[#17171c] text-[#ececf0] sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-6">
          <DialogHeader>
            <DialogTitle className="text-xl">Reglas de inventario</DialogTitle>
            <DialogDescription className="text-[#aaaab6]">
              Las credenciales permanecen en variables de entorno del servidor; nunca se guardan en esta pantalla.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="office-id">ID sucursal Bsale</Label>
              <Input
                id="office-id"
                value={form.bsaleOfficeId || ""}
                onChange={(event) => update("bsaleOfficeId", event.target.value)}
                className="field-control font-mono"
                placeholder="Ej. 1"
              />
              <p className="field-help">Obligatorio para una ejecución real.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-node">Ship node Walmart</Label>
              <Input
                id="ship-node"
                value={form.walmartShipNode || ""}
                onChange={(event) => update("walmartShipNode", event.target.value)}
                className="field-control font-mono"
                placeholder="Nodo predeterminado"
              />
              <p className="field-help">Recomendado para lotes. Si hay varios nodos, es obligatorio para no comparar contra el nodo equivocado.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="safety-stock">Stock de seguridad</Label>
              <Input
                id="safety-stock"
                type="number"
                min={0}
                step={1}
                value={form.safetyStock}
                onChange={(event) => update("safetyStock", Number(event.target.value))}
                className="field-control font-mono"
                required
              />
              <p className="field-help">Unidades que no se publican en Walmart.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interval">Intervalo automático (minutos)</Label>
              <Input
                id="interval"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={form.intervalMinutes}
                onChange={(event) => update("intervalMinutes", Number(event.target.value))}
                className="field-control font-mono"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowlist">Catálogo permitido</Label>
            <Textarea
              id="allowlist"
              value={form.skuAllowlist || ""}
              onChange={(event) => update("skuAllowlist", event.target.value)}
              className="field-control min-h-28 font-mono text-sm"
              placeholder={"SKU-001\nSKU-002\nSKU-003"}
            />
            <p className="field-help">Un SKU por línea. Vacío significa todo el catálogo de la sucursal. Usa primero una lista pequeña para el piloto.</p>
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-[#34343e] p-4">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[#78dcca]"
              checked={form.autoSyncEnabled}
              onChange={(event) => update("autoSyncEnabled", event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Activar sincronización programada</span>
              <span className="mt-1 block text-sm leading-6 text-[#aaaab6]">
                Usa el entorno definido en SYNC_MODE. Déjala desactivada hasta validar las primeras ejecuciones.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-[#78dcca] text-[#10221f] hover:bg-[#91e6d7]" disabled={save.isPending}>
              <Save className="size-4" aria-hidden="true" />
              {save.isPending ? "Guardando…" : "Guardar configuración"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
