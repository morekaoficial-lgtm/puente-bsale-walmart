import { Check, CircleAlert, CircleDashed, CircleX, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "running" | "success" | "warning" | "error" | "simulated" | "updated" | "unchanged" | "failed" | "skipped";

const labels: Record<Status, string> = {
  running: "En curso",
  success: "Correcta",
  warning: "Con observaciones",
  error: "Fallida",
  simulated: "Cambio simulado",
  updated: "Cambio enviado",
  unchanged: "Sin cambios",
  failed: "Falló",
  skipped: "Omitido",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const Icon =
    status === "running"
      ? LoaderCircle
      : status === "success" || status === "updated" || status === "unchanged"
        ? Check
        : status === "warning" || status === "simulated" || status === "skipped"
          ? CircleAlert
          : status === "error" || status === "failed"
            ? CircleX
            : CircleDashed;
  return (
    <span className={cn("status-badge", `status-${status}`, className)}>
      <Icon className={cn("size-3.5", status === "running" && "animate-spin")} aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
