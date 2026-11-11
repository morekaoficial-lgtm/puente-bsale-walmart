import {
  bigint,
  boolean,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const syncRuns = mysqlTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    mode: mysqlEnum("mode", ["simulation", "sandbox", "production"]).notNull(),
    trigger: mysqlEnum("trigger", ["manual", "scheduled", "retry"]).notNull().default("manual"),
    status: mysqlEnum("status", ["running", "success", "warning", "error"]).notNull().default("running"),
    total: int("total").notNull().default(0),
    updated: int("updated").notNull().default(0),
    unchanged: int("unchanged").notNull().default(0),
    failed: int("failed").notNull().default(0),
    durationMs: int("duration_ms"),
    message: text("message"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({ startedAtIdx: index("sync_runs_started_at_idx").on(table.startedAt) }),
);

export const syncItems = mysqlTable(
  "sync_items",
  {
    id: serial("id").primaryKey(),
    runId: bigint("run_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 255 }).notNull(),
    bsaleStock: double("bsale_stock"),
    walmartStock: int("walmart_stock"),
    targetStock: int("target_stock"),
    status: mysqlEnum("status", ["simulated", "updated", "unchanged", "failed", "skipped"]).notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    correlationId: varchar("correlation_id", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    runIdIdx: index("sync_items_run_id_idx").on(table.runId),
    skuIdx: index("sync_items_sku_idx").on(table.sku),
  }),
);

export const integrationSettings = mysqlTable("integration_settings", {
  id: int("id").primaryKey().notNull().default(1),
  bsaleOfficeId: varchar("bsale_office_id", { length: 50 }),
  walmartShipNode: varchar("walmart_ship_node", { length: 100 }),
  safetyStock: int("safety_stock").notNull().default(0),
  intervalMinutes: int("interval_minutes").notNull().default(5),
  autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(false),
  skuAllowlist: text("sku_allowlist"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export type SyncRun = typeof syncRuns.$inferSelect;
export type SyncItem = typeof syncItems.$inferSelect;
export type IntegrationSettings = typeof integrationSettings.$inferSelect;
