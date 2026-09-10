/**
 * SafaiTrack relational schema.
 *
 * Implements the 18-entity, 3NF design from the project proposal
 * (§7 Entity-Relationship Diagram) plus five extension tables that support
 * the simulation clock, the baseline-vs-optimized comparison, the overflow
 * forecast, and the AI assistant.
 *
 * Dialect: SQLite / libSQL. The same schema runs from a local file (offline
 * demo) and from a hosted Turso database (cloud deployment) unchanged.
 */
import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/* ─────────────────────────  GROUP 1 · IDENTITY & ISA  ───────────────────── */

/**
 * User supertype. The ISA hierarchy is total and disjoint: every user row has
 * exactly one matching subtype row, keyed by `userType`.
 */
export const users = sqliteTable(
  "users",
  {
    userId: integer("user_id").primaryKey({ autoIncrement: true }),
    userType: text("user_type", { enum: ["citizen", "staff", "driver", "officer"] }).notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    preferredLanguage: text("preferred_language", { enum: ["en", "bn"] })
      .notNull()
      .default("en"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(now),
  },
  t => [index("idx_users_type").on(t.userType)]
);

export const citizens = sqliteTable("citizens", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.userId, { onDelete: "cascade" }),
  address: text("address"),
  wardId: integer("ward_id").references(() => wards.wardId),
  /** Reputation rises with confirmed reports, falls with rejected ones. */
  trustScore: real("trust_score").notNull().default(50),
  reportsFiled: integer("reports_filed").notNull().default(0),
  reportsConfirmed: integer("reports_confirmed").notNull().default(0),
});

export const municipalStaff = sqliteTable("municipal_staff", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.userId, { onDelete: "cascade" }),
  employeeNo: text("employee_no").notNull().unique(),
  designation: text("designation"),
  cityCorporation: text("city_corporation"),
});

export const truckDrivers = sqliteTable("truck_drivers", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.userId, { onDelete: "cascade" }),
  licenseNo: text("license_no").notNull().unique(),
  licenseExpiry: text("license_expiry"),
  shift: text("shift", { enum: ["morning", "evening", "night"] })
    .notNull()
    .default("morning"),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
});

export const wardOfficers = sqliteTable("ward_officers", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.userId, { onDelete: "cascade" }),
  employeeNo: text("employee_no").notNull().unique(),
  wardId: integer("ward_id")
    .notNull()
    .references(() => wards.wardId),
  officeContact: text("office_contact"),
});

/* ────────────────────  GROUP 2 · CITY, BIN & SENSOR DATA  ───────────────── */

export const wards = sqliteTable("wards", {
  wardId: integer("ward_id").primaryKey({ autoIncrement: true }),
  wardCode: text("ward_code").notNull().unique(),
  name: text("name").notNull(),
  nameBn: text("name_bn"),
  cityCorporation: text("city_corporation").notNull(),
  population: integer("population"),
  areaSqKm: real("area_sq_km"),
  centroidLat: real("centroid_lat").notNull(),
  centroidLng: real("centroid_lng").notNull(),
  /** Depot / garage the ward's trucks start from. */
  depotLat: real("depot_lat").notNull(),
  depotLng: real("depot_lng").notNull(),
  /** Secondary transfer station the truck unloads at. */
  disposalLat: real("disposal_lat").notNull(),
  disposalLng: real("disposal_lng").notNull(),
});

/** Weak entity: identified by (wardId, zoneNo). */
export const collectionZones = sqliteTable(
  "collection_zones",
  {
    wardId: integer("ward_id")
      .notNull()
      .references(() => wards.wardId, { onDelete: "cascade" }),
    zoneNo: integer("zone_no").notNull(),
    zoneName: text("zone_name").notNull(),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  t => [primaryKey({ columns: [t.wardId, t.zoneNo] })]
);

export const wasteCategories = sqliteTable("waste_categories", {
  wasteCategoryId: integer("waste_category_id").primaryKey({ autoIncrement: true }),
  categoryName: text("category_name").notNull().unique(),
  categoryNameBn: text("category_name_bn"),
  handlingNotes: text("handling_notes"),
  isHazardous: integer("is_hazardous", { mode: "boolean" }).notNull().default(false),
  colorHex: text("color_hex").notNull().default("#68ad34"),
});

export const bins = sqliteTable(
  "bins",
  {
    binId: integer("bin_id").primaryKey({ autoIncrement: true }),
    binCode: text("bin_code").notNull().unique(),
    wardId: integer("ward_id")
      .notNull()
      .references(() => wards.wardId),
    zoneNo: integer("zone_no").notNull(),
    wasteCategoryId: integer("waste_category_id")
      .notNull()
      .references(() => wasteCategories.wasteCategoryId),
    landmark: text("landmark").notNull(),
    landmarkBn: text("landmark_bn"),
    capacityLiters: integer("capacity_liters").notNull(),
    currentFillPercent: real("current_fill_percent").notNull().default(0),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    operationalStatus: text("operational_status", {
      enum: ["active", "damaged", "under_maintenance", "removed"],
    })
      .notNull()
      .default("active"),
    /* ── extension: overflow forecasting ───────────────────────────────── */
    /** Learned average fill rate, percentage points per hour. */
    fillRatePctPerHour: real("fill_rate_pct_per_hour").notNull().default(2.5),
    /** Timestamp of the last collection, used to derive elapsed fill time. */
    lastCollectedAt: text("last_collected_at"),
    /** Cumulative hours this bin has spent at or above 100%. */
    overflowHoursTotal: real("overflow_hours_total").notNull().default(0),
    installedAt: text("installed_at").notNull().default(now),
  },
  t => [index("idx_bins_ward").on(t.wardId), index("idx_bins_fill").on(t.currentFillPercent)]
);

/** Weak entity: identified by (binId, readingNo). Models a real ultrasonic feed. */
export const binSensorReadings = sqliteTable(
  "bin_sensor_readings",
  {
    binId: integer("bin_id")
      .notNull()
      .references(() => bins.binId, { onDelete: "cascade" }),
    readingNo: integer("reading_no").notNull(),
    recordedAt: text("recorded_at").notNull().default(now),
    fillLevelPercent: real("fill_level_percent").notNull(),
    /** `simulated` stands in for hardware; swap to `sensor` on a real retrofit. */
    readingSource: text("reading_source", {
      enum: ["simulated", "citizen", "driver", "sensor"],
    }).notNull(),
    reportedByCitizenId: integer("reported_by_citizen_id").references(() => users.userId),
    isValid: integer("is_valid", { mode: "boolean" }).notNull().default(true),
  },
  t => [
    primaryKey({ columns: [t.binId, t.readingNo] }),
    index("idx_readings_time").on(t.recordedAt),
  ]
);

/* ──────────────────  GROUP 3 · FLEET, ROUTING & COLLECTION  ─────────────── */

export const trucks = sqliteTable("trucks", {
  truckId: integer("truck_id").primaryKey({ autoIncrement: true }),
  plateNumber: text("plate_number").notNull().unique(),
  capacityKg: integer("capacity_kg").notNull(),
  status: text("status", { enum: ["available", "on_route", "maintenance", "retired"] })
    .notNull()
    .default("available"),
  make: text("make"),
  model: text("model"),
  currentOdometerKm: real("current_odometer_km").notNull().default(0),
  /** Litres of diesel per km — drives the fuel, cost and CO2 impact numbers. */
  fuelLitresPerKm: real("fuel_litres_per_km").notNull().default(0.35),
  homeWardId: integer("home_ward_id").references(() => wards.wardId),
});

export const truckMaintenanceLogs = sqliteTable("truck_maintenance_logs", {
  maintenanceLogId: integer("maintenance_log_id").primaryKey({ autoIncrement: true }),
  truckId: integer("truck_id")
    .notNull()
    .references(() => trucks.truckId, { onDelete: "cascade" }),
  maintenanceDate: text("maintenance_date").notNull(),
  issueDescription: text("issue_description").notNull(),
  costBdt: real("cost_bdt").notNull().default(0),
  status: text("status", { enum: ["scheduled", "in_progress", "completed"] })
    .notNull()
    .default("scheduled"),
  loggedByStaffId: integer("logged_by_staff_id").references(() => users.userId),
});

export const routes = sqliteTable(
  "routes",
  {
    routeId: integer("route_id").primaryKey({ autoIncrement: true }),
    routeCode: text("route_code").notNull().unique(),
    wardId: integer("ward_id")
      .notNull()
      .references(() => wards.wardId),
    assignedTruckId: integer("assigned_truck_id").references(() => trucks.truckId),
    assignedDriverId: integer("assigned_driver_id").references(() => users.userId),
    generatedByStaffId: integer("generated_by_staff_id").references(() => users.userId),
    algorithmName: text("algorithm_name").notNull().default("dijkstra+nn+2opt"),
    totalDistanceKm: real("total_distance_km").notNull().default(0),
    status: text("status", {
      enum: ["draft", "assigned", "in_progress", "completed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    generatedAt: text("generated_at").notNull().default(now),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    /* ── extension: baseline-vs-optimized proof ────────────────────────── */
    /** Distance the legacy fixed-schedule route would have travelled. */
    baselineDistanceKm: real("baseline_distance_km").notNull().default(0),
    /** Bins the baseline would have visited (including near-empty ones). */
    baselineStopCount: integer("baseline_stop_count").notNull().default(0),
    /** Bins the optimizer actually selected. */
    optimizedStopCount: integer("optimized_stop_count").notNull().default(0),
    fuelSavedLitres: real("fuel_saved_litres").notNull().default(0),
    costSavedBdt: real("cost_saved_bdt").notNull().default(0),
    co2SavedKg: real("co2_saved_kg").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  },
  t => [index("idx_routes_ward_status").on(t.wardId, t.status)]
);

/** Weak entity: identified by (routeId, binId). Holds the visit order. */
export const routeStops = sqliteTable(
  "route_stops",
  {
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.routeId, { onDelete: "cascade" }),
    binId: integer("bin_id")
      .notNull()
      .references(() => bins.binId),
    sequenceOrder: integer("sequence_order").notNull(),
    plannedFillPercent: real("planned_fill_percent").notNull(),
    legDistanceKm: real("leg_distance_km").notNull().default(0),
    plannedArrival: text("planned_arrival"),
    actualArrival: text("actual_arrival"),
    stopStatus: text("stop_status", { enum: ["pending", "collected", "skipped", "blocked"] })
      .notNull()
      .default("pending"),
    note: text("note"),
  },
  t => [primaryKey({ columns: [t.routeId, t.binId] })]
);

export const collectionHistory = sqliteTable(
  "collection_history",
  {
    collectionHistoryId: integer("collection_history_id").primaryKey({ autoIncrement: true }),
    routeId: integer("route_id").references(() => routes.routeId),
    binId: integer("bin_id")
      .notNull()
      .references(() => bins.binId),
    collectedByDriverId: integer("collected_by_driver_id").references(() => users.userId),
    collectedAt: text("collected_at").notNull().default(now),
    fillPercentAtCollection: real("fill_percent_at_collection").notNull(),
    weightKg: real("weight_kg"),
  },
  t => [index("idx_collection_bin_time").on(t.binId, t.collectedAt)]
);

/* ───────────────────────  GROUP 4 · COMPLAINTS & ALERTS  ────────────────── */

/**
 * A complaint targets exactly one bin OR one ward, never both — the XOR
 * constraint from the proposal, enforced in the service layer.
 */
export const complaints = sqliteTable(
  "complaints",
  {
    complaintId: integer("complaint_id").primaryKey({ autoIncrement: true }),
    complaintCode: text("complaint_code").notNull().unique(),
    citizenId: integer("citizen_id")
      .notNull()
      .references(() => users.userId),
    binId: integer("bin_id").references(() => bins.binId),
    wardId: integer("ward_id").references(() => wards.wardId),
    assignedOfficerId: integer("assigned_officer_id").references(() => users.userId),
    complaintType: text("complaint_type", {
      enum: ["overflow", "missed_collection", "damaged_bin", "illegal_dumping", "other"],
    }).notNull(),
    description: text("description"),
    photoPath: text("photo_path"),
    /** Free-text location when the citizen could not pick a known bin. */
    locationText: text("location_text"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    priority: text("priority", { enum: ["low", "normal", "high", "urgent"] })
      .notNull()
      .default("normal"),
    status: text("status", {
      enum: ["pending", "assigned", "in_progress", "resolved", "rejected"],
    })
      .notNull()
      .default("pending"),
    /** Where the report arrived from — proves the SMS/USSD channel works. */
    channel: text("channel", { enum: ["web", "sms", "ussd", "hotline"] })
      .notNull()
      .default("web"),
    createdAt: text("created_at").notNull().default(now),
    resolvedAt: text("resolved_at"),
  },
  t => [
    index("idx_complaints_status").on(t.status),
    index("idx_complaints_citizen").on(t.citizenId),
  ]
);

/** Weak entity: identified by (complaintId, changeNo). Append-only audit trail. */
export const complaintStatusHistory = sqliteTable(
  "complaint_status_history",
  {
    complaintId: integer("complaint_id")
      .notNull()
      .references(() => complaints.complaintId, { onDelete: "cascade" }),
    changeNo: integer("change_no").notNull(),
    oldStatus: text("old_status"),
    newStatus: text("new_status").notNull(),
    changedAt: text("changed_at").notNull().default(now),
    changedByUserId: integer("changed_by_user_id").references(() => users.userId),
    remark: text("remark"),
  },
  t => [primaryKey({ columns: [t.complaintId, t.changeNo] })]
);

export const notifications = sqliteTable(
  "notifications",
  {
    notificationId: integer("notification_id").primaryKey({ autoIncrement: true }),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    complaintId: integer("complaint_id").references(() => complaints.complaintId),
    routeId: integer("route_id").references(() => routes.routeId),
    binId: integer("bin_id").references(() => bins.binId),
    notificationType: text("notification_type", {
      enum: ["complaint_update", "route_assigned", "bin_critical", "overflow_forecast", "system"],
    }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    deliveryStatus: text("delivery_status", { enum: ["pending", "delivered", "read"] })
      .notNull()
      .default("pending"),
    createdAt: text("created_at").notNull().default(now),
  },
  t => [index("idx_notifications_recipient").on(t.recipientUserId, t.deliveryStatus)]
);

/* ══════════════════  EXTENSIONS BEYOND THE PROPOSAL  ══════════════════════ */

/**
 * Singleton row holding the simulation clock, so a judge can fast-forward a
 * full operating day in ~30 seconds instead of reading static screens.
 */
export const simulationState = sqliteTable("simulation_state", {
  id: integer("id").primaryKey().default(1),
  /** In-world time the simulation has advanced to. */
  simClock: text("sim_clock").notNull().default(now),
  isRunning: integer("is_running", { mode: "boolean" }).notNull().default(false),
  /** In-world minutes advanced per tick. */
  minutesPerTick: integer("minutes_per_tick").notNull().default(30),
  ticksElapsed: integer("ticks_elapsed").notNull().default(0),
  lastTickAt: text("last_tick_at"),
});

/**
 * One row per scored route, recording the measured comparison against the
 * legacy fixed-schedule baseline. Kept separate from `routes` so a route can
 * be re-scored under different baseline assumptions without losing history.
 */
export const routeComparisons = sqliteTable("route_comparisons", {
  comparisonId: integer("comparison_id").primaryKey({ autoIncrement: true }),
  routeId: integer("route_id")
    .notNull()
    .references(() => routes.routeId, { onDelete: "cascade" }),
  baselineAlgorithm: text("baseline_algorithm").notNull().default("fixed_schedule_all_bins"),
  baselineDistanceKm: real("baseline_distance_km").notNull(),
  optimizedDistanceKm: real("optimized_distance_km").notNull(),
  distanceSavedPercent: real("distance_saved_percent").notNull(),
  baselineFuelLitres: real("baseline_fuel_litres").notNull(),
  optimizedFuelLitres: real("optimized_fuel_litres").notNull(),
  fuelSavedLitres: real("fuel_saved_litres").notNull(),
  costSavedBdt: real("cost_saved_bdt").notNull(),
  co2SavedKg: real("co2_saved_kg").notNull(),
  /** Bins the baseline visited that were below the collection threshold. */
  wastedStopsAvoided: integer("wasted_stops_avoided").notNull().default(0),
  /** Critical bins the baseline would have left uncollected today. */
  overflowsPrevented: integer("overflows_prevented").notNull().default(0),
  computedAt: text("computed_at").notNull().default(now),
});

/** Per-bin overflow prediction, recomputed whenever readings change. */
export const binForecasts = sqliteTable(
  "bin_forecasts",
  {
    forecastId: integer("forecast_id").primaryKey({ autoIncrement: true }),
    binId: integer("bin_id")
      .notNull()
      .references(() => bins.binId, { onDelete: "cascade" }),
    computedAt: text("computed_at").notNull().default(now),
    currentFillPercent: real("current_fill_percent").notNull(),
    fillRatePctPerHour: real("fill_rate_pct_per_hour").notNull(),
    hoursToOverflow: real("hours_to_overflow"),
    predictedOverflowAt: text("predicted_overflow_at"),
    /** 0–1. Falls when readings are sparse or the fill rate is erratic. */
    confidence: real("confidence").notNull().default(0.5),
    /** Number of readings the regression was fitted on. */
    sampleSize: integer("sample_size").notNull().default(0),
  },
  t => [unique("uq_forecast_bin").on(t.binId)]
);

/** Conversation threads with the AI operations assistant. */
export const agentConversations = sqliteTable("agent_conversations", {
  conversationId: integer("conversation_id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  title: text("title").notNull().default("New conversation"),
  createdAt: text("created_at").notNull().default(now),
});

export const agentMessages = sqliteTable(
  "agent_messages",
  {
    messageId: integer("message_id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => agentConversations.conversationId, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** JSON array of {name, input, result} for tools the assistant invoked. */
    toolCallsJson: text("tool_calls_json"),
    /** `openai` or `claude` when the API answered, `offline` when the local advisor did. */
    source: text("source", { enum: ["claude", "openai", "offline"] })
      .notNull()
      .default("claude"),
    createdAt: text("created_at").notNull().default(now),
  },
  t => [index("idx_agent_messages_convo").on(t.conversationId)]
);

/* ─────────────────────────────  RELATIONS  ──────────────────────────────── */

export const usersRelations = relations(users, ({ one, many }) => ({
  citizen: one(citizens, { fields: [users.userId], references: [citizens.userId] }),
  staff: one(municipalStaff, { fields: [users.userId], references: [municipalStaff.userId] }),
  driver: one(truckDrivers, { fields: [users.userId], references: [truckDrivers.userId] }),
  officer: one(wardOfficers, { fields: [users.userId], references: [wardOfficers.userId] }),
  notifications: many(notifications),
}));

export const wardsRelations = relations(wards, ({ many }) => ({
  bins: many(bins),
  routes: many(routes),
  zones: many(collectionZones),
}));

export const binsRelations = relations(bins, ({ one, many }) => ({
  ward: one(wards, { fields: [bins.wardId], references: [wards.wardId] }),
  category: one(wasteCategories, {
    fields: [bins.wasteCategoryId],
    references: [wasteCategories.wasteCategoryId],
  }),
  readings: many(binSensorReadings),
  stops: many(routeStops),
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
  ward: one(wards, { fields: [routes.wardId], references: [wards.wardId] }),
  truck: one(trucks, { fields: [routes.assignedTruckId], references: [trucks.truckId] }),
  driver: one(users, { fields: [routes.assignedDriverId], references: [users.userId] }),
  stops: many(routeStops),
  comparisons: many(routeComparisons),
}));

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  route: one(routes, { fields: [routeStops.routeId], references: [routes.routeId] }),
  bin: one(bins, { fields: [routeStops.binId], references: [bins.binId] }),
}));

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  citizen: one(users, { fields: [complaints.citizenId], references: [users.userId] }),
  bin: one(bins, { fields: [complaints.binId], references: [bins.binId] }),
  ward: one(wards, { fields: [complaints.wardId], references: [wards.wardId] }),
  officer: one(users, { fields: [complaints.assignedOfficerId], references: [users.userId] }),
  history: many(complaintStatusHistory),
}));
