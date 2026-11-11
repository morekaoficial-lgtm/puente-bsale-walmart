import { useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudCog,
  Database,
  History,
  Link2,
  ListTree,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { RunDialog } from "@/components/RunDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { cn } from "@/lib/utils";

type ItemStatus = "simulated" | "updated" | "unchanged" | "failed" | "skipped";
type SyncItemView = {
  id: number;
  runId: number;
  sku: string;
  bsaleStock: number | null;
  walmartStock: number | null;
  targetStock: number | null;
  status: ItemStatus;
  errorCode: string | null;
  errorMessage: string | null;
  correlationId: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value?: Date | null) {
  return value ? dateFormatter.format(value).replace(".", "") : "Sin ejecutar";
}

function formatDuration(milliseconds?: number | null) {
  if (milliseconds === null || milliseconds === undefined) return "—";
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}

function number(value?: number | null) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("es-MX").format(value);
}

export default function Home() {
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number>();
  const [selectedItem, setSelectedItem] = useState<SyncItemView | null>(null);
  const [activeTab, setActiveTab] = useState<"detail" | "history">("detail");
  const utils = trpc.useUtils();
  const dashboard = trpc.integration.dashboard.useQuery(undefined, {
    refetchInterval: (query) => (query.state.data?.running ? 1500 : 10000),
  });
  const activeRunId = selectedRunId ?? dashboard.data?.latestRun?.id;
  const itemsQuery = trpc.integration.runItems.useQuery(
    { runId: activeRunId || 0 },
    { enabled: Boolean(activeRunId), refetchInterval: dashboard.data?.running ? 1500 : false },
  );
  const testConnections = trpc.integration.testConnections.useMutation({
    onError: (error) => toast.error("No se pudieron probar las conexiones", { description: error.message }),
  });
  const retry = trpc.integration.retryRun.useMutation({
    onSuccess: (result) => {
      toast.success("Reintento completado", { description: result.message || undefined });
      setSelectedRunId(result.id);
      setActiveTab("detail");
      void utils.integration.dashboard.invalidate();
      void utils.integration.runItems.invalidate();
    },
    onError: (error) => toast.error("No se pudo reintentar", { description: error.message }),
  });

  const data = dashboard.data;
  const selectedRun = useMemo(
    () => data?.runs.find((run) => run.id === activeRunId) || data?.latestRun || null,
    [activeRunId, data],
  );
  const items: SyncItemView[] = itemsQuery.data || (activeRunId === data?.latestRun?.id ? data?.latestItems || [] : []);

  if (dashboard.isLoading) {
    return (
      <main className="app-shell" aria-label="Cargando panel">
        <Skeleton className="h-12 w-64 bg-[#26262d]" />
        <Skeleton className="mt-10 h-40 w-full bg-[#1d1d23]" />
        <Skeleton className="mt-6 h-96 w-full bg-[#1d1d23]" />
      </main>
    );
  }

  if (dashboard.isError || !data) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <section className="max-w-lg border-l-2 border-[#ff6c5c] pl-5">
          <CircleAlert className="mb-4 size-7 text-[#ff8d7e]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">No pudimos abrir el panel</h1>
          <p className="mt-3 leading-7 text-[#aaaab6]">{dashboard.error?.message || "El servicio no respondió."}</p>
          <Button className="mt-6" variant="outline" onClick={() => void dashboard.refetch()}>
            <RefreshCw className="size-4" /> Reintentar conexión
          </Button>
        </section>
      </main>
    );
  }

  const latest = data.latestRun;
  const connectionResults = testConnections.data;

  return (
    <div className="min-h-dvh bg-[#0c0c0f] text-[#ececf0]">
      <header className="topbar">
        <div className="flex min-w-0 items-center gap-3">
          <span className="brand-mark" aria-hidden="true"><Link2 className="size-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[0.14em]">PUENTE</p>
            <p className="truncate font-mono text-[11px] text-[#8e8e9b]">BSALE / WALMART MX</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden items-center gap-2 font-mono text-xs text-[#aaaab6] sm:flex">
            <span className="size-1.5 rounded-full bg-[#78dcca]" /> {data.connections.schedulerMode.toUpperCase()}
          </span>
          <Button variant="ghost" size="icon" aria-label="Abrir configuración" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="size-5" />
          </Button>
          <Button className="bg-[#78dcca] text-[#10221f] hover:bg-[#91e6d7]" onClick={() => setRunDialogOpen(true)}>
            <Play className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nueva sincronización</span>
            <span className="sm:hidden">Sincronizar</span>
          </Button>
        </div>
      </header>

      <main className="app-shell">
        <section className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-[#78dcca]">Control de inventario</p>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Bsale hacia Walmart, SKU por SKU.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#aaaab6]">
              Stock disponible, reglas de seguridad, respuestas de API y errores en una sola bitácora.
            </p>
          </div>
          <p className="font-mono text-xs text-[#8e8e9b]">Actualizado {formatDate(data.serverTime)}</p>
        </section>

        <div className="dashboard-grid">
          <div className="min-w-0 space-y-6">
            <section className="metrics-strip" aria-label="Resumen de última ejecución">
              <div className="metric-block">
                <span className="metric-label">Última ejecución</span>
                <div className="mt-2">{latest ? <StatusBadge status={latest.status} /> : <span className="text-lg">Sin actividad</span>}</div>
                <span className="metric-meta">{formatDate(latest?.startedAt)}</span>
              </div>
              <div className="metric-block">
                <span className="metric-label">SKU procesados</span>
                <strong className="metric-value">{latest ? number(latest.total) : "—"}</strong>
                <span className="metric-meta">{latest?.mode === "simulation" ? "Datos simulados" : "Catálogo seleccionado"}</span>
              </div>
              <div className="metric-block">
                <span className="metric-label">Con cambios</span>
                <strong className="metric-value text-[#78dcca]">{latest ? number(latest.updated) : "—"}</strong>
                <span className="metric-meta">{latest?.mode === "simulation" ? "Calculados, no enviados" : "Actualizados en Walmart"}</span>
              </div>
              <div className="metric-block">
                <span className="metric-label">Fallos</span>
                <strong className={cn("metric-value", (latest?.failed || 0) > 0 && "text-[#ff8d7e]")}>{latest ? number(latest.failed) : "—"}</strong>
                <span className="metric-meta">Duración {formatDuration(latest?.durationMs)}</span>
              </div>
            </section>

            <section className="flow-panel" aria-label="Ruta de sincronización">
              <div className="flow-node">
                <Database className="size-5 text-[#78dcca]" aria-hidden="true" />
                <div><span className="flow-title">Bsale</span><span className="flow-subtitle">Stock disponible</span></div>
              </div>
              <ArrowRight className="flow-arrow" aria-hidden="true" />
              <div className="flow-node">
                <CloudCog className="size-5 text-[#78dcca]" aria-hidden="true" />
                <div><span className="flow-title">Regla</span><span className="flow-subtitle">− {data.settings.safetyStock} de seguridad</span></div>
              </div>
              <ArrowRight className="flow-arrow" aria-hidden="true" />
              <div className="flow-node">
                <Boxes className="size-5 text-[#78dcca]" aria-hidden="true" />
                <div><span className="flow-title">Walmart</span><span className="flow-subtitle">Cantidad por SKU</span></div>
              </div>
            </section>

            {latest?.mode === "simulation" && (
              <div className="notice-bar" role="status">
                <ShieldCheck className="size-5 shrink-0 text-[#f2c45c]" aria-hidden="true" />
                <p><strong>Estás viendo una simulación.</strong> Los cálculos y la bitácora son reales; no se enviaron cambios a Walmart.</p>
              </div>
            )}

            <section className="inspector-panel">
              <div className="inspector-tabs" role="tablist" aria-label="Bitácora de sincronización">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "detail"}
                  className={cn("inspector-tab", activeTab === "detail" && "inspector-tab-active")}
                  onClick={() => setActiveTab("detail")}
                >
                  <ListTree className="size-4" /> Detalle de ejecución
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "history"}
                  className={cn("inspector-tab", activeTab === "history" && "inspector-tab-active")}
                  onClick={() => setActiveTab("history")}
                >
                  <History className="size-4" /> Historial ({data.runs.length})
                </button>
              </div>

              {activeTab === "detail" ? (
                <div role="tabpanel">
                  <div className="inspector-heading">
                    <div>
                      <p className="font-mono text-xs text-[#8e8e9b]">EJECUCIÓN {selectedRun ? `#${selectedRun.id}` : "—"}</p>
                      <h2 className="mt-1 text-lg font-semibold">{selectedRun?.message || "Aún no hay ejecuciones"}</h2>
                    </div>
                    {selectedRun && selectedRun.failed > 0 && selectedRun.mode !== "production" && (
                      <Button variant="outline" size="sm" disabled={retry.isPending} onClick={() => retry.mutate({ runId: selectedRun.id })}>
                        <RefreshCw className={cn("size-4", retry.isPending && "animate-spin")} />
                        {retry.isPending ? "Reintentando…" : "Reintentar fallidos"}
                      </Button>
                    )}
                  </div>

                  {!selectedRun ? (
                    <div className="empty-state">
                      <ListTree className="size-7 text-[#6f6f7c]" aria-hidden="true" />
                      <p>Ejecuta una simulación para ver aquí cada SKU, cantidad y respuesta.</p>
                      <Button variant="outline" onClick={() => setRunDialogOpen(true)}>Crear primera simulación</Button>
                    </div>
                  ) : itemsQuery.isLoading ? (
                    <div className="space-y-3 p-6"><Skeleton className="h-10 bg-[#26262d]" /><Skeleton className="h-10 bg-[#26262d]" /><Skeleton className="h-10 bg-[#26262d]" /></div>
                  ) : items.length === 0 ? (
                    <div className="empty-state"><p>No hay elementos para esta ejecución.</p></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="inventory-table">
                        <thead><tr><th>SKU</th><th>Bsale</th><th className="hidden sm:table-cell">Walmart</th><th>Destino</th><th>Estado</th><th aria-label="Detalle" /></tr></thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} className={item.status === "failed" ? "cursor-pointer hover:bg-[#231b1d]" : "hover:bg-[#19191f]"} onClick={() => item.status === "failed" && setSelectedItem(item)}>
                              <td className="max-w-40 truncate font-mono text-[#ececf0]" title={item.sku}>{item.sku}</td>
                              <td className="font-mono">{number(item.bsaleStock)}</td>
                              <td className="hidden font-mono sm:table-cell">{number(item.walmartStock)}</td>
                              <td className="font-mono text-[#78dcca]">{number(item.targetStock)}</td>
                              <td><StatusBadge status={item.status} /></td>
                              <td>{item.status === "failed" && <ChevronRight className="size-4 text-[#ff8d7e]" aria-label="Ver error" />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div role="tabpanel" className="divide-y divide-[#2b2b33]">
                  {data.runs.length === 0 ? <div className="empty-state"><p>El historial aparecerá después de la primera ejecución.</p></div> : data.runs.map((run) => (
                    <button
                      type="button"
                      key={run.id}
                      className="history-row"
                      onClick={() => { setSelectedRunId(run.id); setActiveTab("detail"); }}
                    >
                      <span className="min-w-0 text-left">
                        <span className="block font-mono text-sm text-[#ececf0]">#{run.id} · {run.mode === "simulation" ? "SIMULACIÓN" : run.mode.toUpperCase()}</span>
                        <span className="mt-1 block truncate text-xs text-[#8e8e9b]">{formatDate(run.startedAt)} · {run.total} SKU · {run.failed} fallos</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3"><StatusBadge status={run.status} /><ChevronRight className="size-4 text-[#6f6f7c]" /></span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-6">
            <section className="side-section">
              <div className="side-heading"><Wifi className="size-4" /><h2>Conexiones</h2></div>
              <div className="connection-row">
                <div><strong>Bsale</strong><span>{data.connections.bsale.label}</span></div>
                <span className={cn("connection-dot", data.connections.bsale.configured && "connection-dot-ok")} aria-label={data.connections.bsale.configured ? "Configurado" : "Sin configurar"} />
              </div>
              <div className="connection-row">
                <div><strong>Walmart México</strong><span>{data.connections.walmart.label}</span></div>
                <span className={cn("connection-dot", data.connections.walmart.configured && "connection-dot-ok")} aria-label={data.connections.walmart.configured ? "Configurado" : "Sin configurar"} />
              </div>
              <Button className="mt-5 w-full" variant="outline" disabled={testConnections.isPending} onClick={() => testConnections.mutate()}>
                <RefreshCw className={cn("size-4", testConnections.isPending && "animate-spin")} />
                {testConnections.isPending ? "Probando…" : "Probar credenciales"}
              </Button>
              {connectionResults && (
                <div className="mt-4 space-y-3 border-t border-[#2b2b33] pt-4" aria-live="polite">
                  {(["bsale", "walmart"] as const).map((key) => (
                    <div key={key} className="text-xs leading-5">
                      <strong className={connectionResults[key].ok ? "text-[#78dcca]" : "text-[#ff8d7e]"}>{key === "bsale" ? "Bsale" : "Walmart"}</strong>
                      <p className="mt-1 break-words text-[#aaaab6]">{connectionResults[key].detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="side-section">
              <div className="side-heading"><Clock3 className="size-4" /><h2>Programación</h2></div>
              <dl className="settings-list">
                <div><dt>Estado</dt><dd className={data.settings.autoSyncEnabled ? "text-[#78dcca]" : ""}>{data.settings.autoSyncEnabled ? "Activa" : "Pausada"}</dd></div>
                <div><dt>Frecuencia</dt><dd>Cada {data.settings.intervalMinutes} min</dd></div>
                <div><dt>Sucursal Bsale</dt><dd className="font-mono">{data.settings.bsaleOfficeId || "Sin definir"}</dd></div>
                <div><dt>Ship node</dt><dd className="max-w-32 truncate font-mono">{data.settings.walmartShipNode || "Predeterminado"}</dd></div>
                <div><dt>Escritura real</dt><dd>{data.connections.productionWritesEnabled ? "Habilitada" : "Bloqueada"}</dd></div>
              </dl>
              <Button className="mt-5 w-full" variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 className="size-4" />Editar reglas</Button>
            </section>

            <section className="side-section">
              <div className="side-heading"><ShieldCheck className="size-4" /><h2>Protecciones</h2></div>
              <ul className="protection-list">
                <li>Sin escrituras en modo simulación</li>
                <li>Producción limitada a un SKU confirmado</li>
                <li>Credenciales fuera de la base de datos</li>
                <li>Una sola ejecución a la vez</li>
              </ul>
            </section>
          </aside>
        </div>
      </main>

      <RunDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} productionWritesEnabled={data.connections.productionWritesEnabled} onCompleted={(id) => { setSelectedRunId(id); setActiveTab("detail"); }} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={data.settings} />

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="border-[#543238] bg-[#1d171a] text-[#ececf0] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-[#ff9c90]">{selectedItem?.sku}</DialogTitle>
            <DialogDescription className="text-[#c5a9ad]">{selectedItem?.errorCode || "Error de sincronización"}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-[#110e10] p-4">
            <p className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[#e7dadc]">{selectedItem?.errorMessage}</p>
          </div>
          {selectedItem?.correlationId && <p className="break-all font-mono text-xs text-[#aaaab6]">Correlation ID: {selectedItem.correlationId}</p>}
          <p className="text-sm leading-6 text-[#aaaab6]">Corrige la causa y usa “Reintentar fallidos” para crear una nueva ejecución sin repetir los SKU correctos.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
