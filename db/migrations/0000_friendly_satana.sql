CREATE TABLE `integration_settings` (
	`id` int NOT NULL DEFAULT 1,
	`bsale_office_id` varchar(50),
	`walmart_ship_node` varchar(100),
	`safety_stock` int NOT NULL DEFAULT 0,
	`interval_minutes` int NOT NULL DEFAULT 5,
	`auto_sync_enabled` boolean NOT NULL DEFAULT false,
	`sku_allowlist` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`sku` varchar(255) NOT NULL,
	`bsale_stock` double,
	`walmart_stock` int,
	`target_stock` int,
	`status` enum('simulated','updated','unchanged','failed','skipped') NOT NULL,
	`error_code` varchar(100),
	`error_message` text,
	`correlation_id` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`mode` enum('simulation','sandbox','production') NOT NULL,
	`trigger` enum('manual','scheduled','retry') NOT NULL DEFAULT 'manual',
	`status` enum('running','success','warning','error') NOT NULL DEFAULT 'running',
	`total` int NOT NULL DEFAULT 0,
	`updated` int NOT NULL DEFAULT 0,
	`unchanged` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`duration_ms` int,
	`message` text,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	CONSTRAINT `sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sync_items` ADD CONSTRAINT `sync_items_run_id_sync_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `sync_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sync_items_run_id_idx` ON `sync_items` (`run_id`);--> statement-breakpoint
CREATE INDEX `sync_items_sku_idx` ON `sync_items` (`sku`);--> statement-breakpoint
CREATE INDEX `sync_runs_started_at_idx` ON `sync_runs` (`started_at`);