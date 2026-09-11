CREATE TABLE `agent_conversations` (
	`conversation_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text DEFAULT 'New conversation' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_messages` (
	`message_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls_json` text,
	`source` text DEFAULT 'claude' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `agent_conversations`(`conversation_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_agent_messages_convo` ON `agent_messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `bin_forecasts` (
	`forecast_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bin_id` integer NOT NULL,
	`computed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`current_fill_percent` real NOT NULL,
	`fill_rate_pct_per_hour` real NOT NULL,
	`hours_to_overflow` real,
	`predicted_overflow_at` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`sample_size` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bin_id`) REFERENCES `bins`(`bin_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_forecast_bin` ON `bin_forecasts` (`bin_id`);--> statement-breakpoint
CREATE TABLE `bin_sensor_readings` (
	`bin_id` integer NOT NULL,
	`reading_no` integer NOT NULL,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`fill_level_percent` real NOT NULL,
	`reading_source` text NOT NULL,
	`reported_by_citizen_id` integer,
	`is_valid` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`bin_id`, `reading_no`),
	FOREIGN KEY (`bin_id`) REFERENCES `bins`(`bin_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reported_by_citizen_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_readings_time` ON `bin_sensor_readings` (`recorded_at`);--> statement-breakpoint
CREATE TABLE `bins` (
	`bin_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bin_code` text NOT NULL,
	`ward_id` integer NOT NULL,
	`zone_no` integer NOT NULL,
	`waste_category_id` integer NOT NULL,
	`landmark` text NOT NULL,
	`landmark_bn` text,
	`capacity_liters` integer NOT NULL,
	`current_fill_percent` real DEFAULT 0 NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`operational_status` text DEFAULT 'active' NOT NULL,
	`fill_rate_pct_per_hour` real DEFAULT 2.5 NOT NULL,
	`last_collected_at` text,
	`overflow_hours_total` real DEFAULT 0 NOT NULL,
	`installed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`ward_id`) REFERENCES `wards`(`ward_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`waste_category_id`) REFERENCES `waste_categories`(`waste_category_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bins_bin_code_unique` ON `bins` (`bin_code`);--> statement-breakpoint
CREATE INDEX `idx_bins_ward` ON `bins` (`ward_id`);--> statement-breakpoint
CREATE INDEX `idx_bins_fill` ON `bins` (`current_fill_percent`);--> statement-breakpoint
CREATE TABLE `citizens` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`address` text,
	`ward_id` integer,
	`trust_score` real DEFAULT 50 NOT NULL,
	`reports_filed` integer DEFAULT 0 NOT NULL,
	`reports_confirmed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ward_id`) REFERENCES `wards`(`ward_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collection_history` (
	`collection_history_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_id` integer,
	`bin_id` integer NOT NULL,
	`collected_by_driver_id` integer,
	`collected_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`fill_percent_at_collection` real NOT NULL,
	`weight_kg` real,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`route_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_id`) REFERENCES `bins`(`bin_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collected_by_driver_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_collection_bin_time` ON `collection_history` (`bin_id`,`collected_at`);--> statement-breakpoint
CREATE TABLE `collection_zones` (
	`ward_id` integer NOT NULL,
	`zone_no` integer NOT NULL,
	`zone_name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`ward_id`, `zone_no`),
	FOREIGN KEY (`ward_id`) REFERENCES `wards`(`ward_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `complaint_status_history` (
	`complaint_id` integer NOT NULL,
	`change_no` integer NOT NULL,
	`old_status` text,
	`new_status` text NOT NULL,
	`changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`changed_by_user_id` integer,
	`remark` text,
	PRIMARY KEY(`complaint_id`, `change_no`),
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`complaint_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `complaints` (
	`complaint_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`complaint_code` text NOT NULL,
	`citizen_id` integer NOT NULL,
	`bin_id` integer,
	`ward_id` integer,
	`assigned_officer_id` integer,
	`complaint_type` text NOT NULL,
	`description` text,
	`photo_path` text,
	`location_text` text,
	`latitude` real,
	`longitude` real,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`channel` text DEFAULT 'web' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`citizen_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_id`) REFERENCES `bins`(`bin_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ward_id`) REFERENCES `wards`(`ward_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_officer_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `complaints_complaint_code_unique` ON `complaints` (`complaint_code`);--> statement-breakpoint
CREATE INDEX `idx_complaints_status` ON `complaints` (`status`);--> statement-breakpoint
CREATE INDEX `idx_complaints_citizen` ON `complaints` (`citizen_id`);--> statement-breakpoint
CREATE TABLE `municipal_staff` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`employee_no` text NOT NULL,
	`designation` text,
	`city_corporation` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `municipal_staff_employee_no_unique` ON `municipal_staff` (`employee_no`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`notification_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_user_id` integer NOT NULL,
	`complaint_id` integer,
	`route_id` integer,
	`bin_id` integer,
	`notification_type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`complaint_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`route_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_id`) REFERENCES `bins`(`bin_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient` ON `notifications` (`recipient_user_id`,`delivery_status`);--> statement-breakpoint
CREATE TABLE `route_comparisons` (
	`comparison_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_id` integer NOT NULL,
	`baseline_algorithm` text DEFAULT 'fixed_schedule_all_bins' NOT NULL,
	`baseline_distance_km` real NOT NULL,
	`optimized_distance_km` real NOT NULL,
	`distance_saved_percent` real NOT NULL,
	`baseline_fuel_litres` real NOT NULL,
	`optimized_fuel_litres` real NOT NULL,
	`fuel_saved_litres` real NOT NULL,
	`cost_saved_bdt` real NOT NULL,
	`co2_saved_kg` real NOT NULL,
	`wasted_stops_avoided` integer DEFAULT 0 NOT NULL,
	`overflows_prevented` integer DEFAULT 0 NOT NULL,
	`computed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`route_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `route_stops` (
	`route_id` integer NOT NULL,
	`bin_id` integer NOT NULL,
	`sequence_order` integer NOT NULL,
	`planned_fill_percent` real NOT NULL,
	`leg_distance_km` real DEFAULT 0 NOT NULL,
	`planned_arrival` text,
	`actual_arrival` text,
	`stop_status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	PRIMARY KEY(`route_id`, `bin_id`),
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`route_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bin_id`) REFERENCES `bins`(`bin_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`route_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_code` text NOT NULL,
	`ward_id` integer NOT NULL,
	`assigned_truck_id` integer,
	`assigned_driver_id` integer,
	`generated_by_staff_id` integer,
	`algorithm_name` text DEFAULT 'dijkstra+nn+2opt' NOT NULL,
	`total_distance_km` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`started_at` text,
	`completed_at` text,
	`baseline_distance_km` real DEFAULT 0 NOT NULL,
	`baseline_stop_count` integer DEFAULT 0 NOT NULL,
	`optimized_stop_count` integer DEFAULT 0 NOT NULL,
	`fuel_saved_litres` real DEFAULT 0 NOT NULL,
	`cost_saved_bdt` real DEFAULT 0 NOT NULL,
	`co2_saved_kg` real DEFAULT 0 NOT NULL,
	`estimated_minutes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`ward_id`) REFERENCES `wards`(`ward_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_truck_id`) REFERENCES `trucks`(`truck_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_driver_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generated_by_staff_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routes_route_code_unique` ON `routes` (`route_code`);--> statement-breakpoint
CREATE INDEX `idx_routes_ward_status` ON `routes` (`ward_id`,`status`);--> statement-breakpoint
CREATE TABLE `simulation_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`sim_clock` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`is_running` integer DEFAULT false NOT NULL,
	`minutes_per_tick` integer DEFAULT 30 NOT NULL,
	`ticks_elapsed` integer DEFAULT 0 NOT NULL,
	`last_tick_at` text
);
--> statement-breakpoint
CREATE TABLE `truck_drivers` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`license_no` text NOT NULL,
	`license_expiry` text,
	`shift` text DEFAULT 'morning' NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `truck_drivers_license_no_unique` ON `truck_drivers` (`license_no`);--> statement-breakpoint
CREATE TABLE `truck_maintenance_logs` (
	`maintenance_log_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`truck_id` integer NOT NULL,
	`maintenance_date` text NOT NULL,
	`issue_description` text NOT NULL,
	`cost_bdt` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`logged_by_staff_id` integer,
	FOREIGN KEY (`truck_id`) REFERENCES `trucks`(`truck_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by_staff_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trucks` (
	`truck_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plate_number` text NOT NULL,
	`capacity_kg` integer NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`make` text,
	`model` text,
	`current_odometer_km` real DEFAULT 0 NOT NULL,
	`fuel_litres_per_km` real DEFAULT 0.35 NOT NULL,
	`home_ward_id` integer,
	FOREIGN KEY (`home_ward_id`) REFERENCES `wards`(`ward_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trucks_plate_number_unique` ON `trucks` (`plate_number`);--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_type` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`password_hash` text NOT NULL,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_type` ON `users` (`user_type`);--> statement-breakpoint
CREATE TABLE `ward_officers` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`employee_no` text NOT NULL,
	`ward_id` integer NOT NULL,
	`office_contact` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ward_id`) REFERENCES `wards`(`ward_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ward_officers_employee_no_unique` ON `ward_officers` (`employee_no`);--> statement-breakpoint
CREATE TABLE `wards` (
	`ward_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ward_code` text NOT NULL,
	`name` text NOT NULL,
	`name_bn` text,
	`city_corporation` text NOT NULL,
	`population` integer,
	`area_sq_km` real,
	`centroid_lat` real NOT NULL,
	`centroid_lng` real NOT NULL,
	`depot_lat` real NOT NULL,
	`depot_lng` real NOT NULL,
	`disposal_lat` real NOT NULL,
	`disposal_lng` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wards_ward_code_unique` ON `wards` (`ward_code`);--> statement-breakpoint
CREATE TABLE `waste_categories` (
	`waste_category_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_name` text NOT NULL,
	`category_name_bn` text,
	`handling_notes` text,
	`is_hazardous` integer DEFAULT false NOT NULL,
	`color_hex` text DEFAULT '#68ad34' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waste_categories_category_name_unique` ON `waste_categories` (`category_name`);