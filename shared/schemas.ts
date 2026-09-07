/** Zod request schemas. Used by Hono validators and reused in the client forms. */
import { z } from "zod";
import { COMPLAINT_STATUSES, COMPLAINT_TYPES, ROLES } from "./types.js";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  fullName: z.string().min(2, "Please enter your full name").max(120),
  email: z.string().email("Enter a valid email address"),
  phone: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number, e.g. 01712345678")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8, "Use at least 8 characters"),
  role: z.enum(ROLES).default("citizen"),
  wardId: z.coerce.number().int().positive().optional(),
  address: z.string().max(240).optional(),
  preferredLanguage: z.enum(["en", "bn"]).default("en"),
});

/** Fields a signed-in user may change about themselves. */
export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Please enter your full name").max(120).optional(),
  phone: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number, e.g. 01712345678")
    .optional()
    .or(z.literal("")),
  address: z.string().max(240).optional(),
  wardId: z.coerce.number().int().positive().optional(),
  preferredLanguage: z.enum(["en", "bn"]).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createComplaintSchema = z
  .object({
    complaintType: z.enum(COMPLAINT_TYPES),
    binId: z.coerce.number().int().positive().optional(),
    wardId: z.coerce.number().int().positive().optional(),
    description: z.string().max(1000).optional(),
    locationText: z.string().max(240).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    photoPath: z.string().max(500).optional(),
    channel: z.enum(["web", "sms", "ussd", "hotline"]).default("web"),
  })
  // The proposal's XOR rule: a complaint targets one bin or one ward, never both.
  .refine(v => Boolean(v.binId) !== Boolean(v.wardId), {
    message: "A complaint must target exactly one bin or one ward, not both",
    path: ["binId"],
  });

export const updateComplaintStatusSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES),
  remark: z.string().max(500).optional(),
});

export const reportFillSchema = z.object({
  binId: z.coerce.number().int().positive(),
  fillLevelPercent: z.coerce.number().min(0).max(100),
});

export const generateRouteSchema = z.object({
  wardId: z.coerce.number().int().positive(),
  /** Only bins at or above this fill % are eligible for collection. */
  thresholdPercent: z.coerce.number().min(0).max(100).default(55),
  /** Hard cap on stops, so a route fits inside one shift. */
  maxStops: z.coerce.number().int().min(1).max(60).default(20),
  /** Include bins forecast to overflow within this many hours. */
  lookaheadHours: z.coerce.number().min(0).max(48).default(6),
});

export const assignRouteSchema = z.object({
  truckId: z.coerce.number().int().positive(),
  driverId: z.coerce.number().int().positive(),
});

export const collectStopSchema = z.object({
  binId: z.coerce.number().int().positive(),
  fillPercentAtCollection: z.coerce.number().min(0).max(100).optional(),
  weightKg: z.coerce.number().min(0).optional(),
  note: z.string().max(300).optional(),
});

export const simulationControlSchema = z.object({
  action: z.enum(["start", "pause", "tick", "reset", "fast_forward"]),
  /** Number of ticks to advance for `fast_forward`. */
  ticks: z.coerce.number().int().min(1).max(96).default(48),
  minutesPerTick: z.coerce.number().int().min(5).max(120).optional(),
});

export const agentAskSchema = z.object({
  message: z.string().min(1, "Ask a question").max(2000),
  conversationId: z.coerce.number().int().positive().optional(),
});

/** Inbound SMS/USSD webhook — the low-tech complaint channel. */
export const smsIntakeSchema = z.object({
  from: z.string().regex(/^01[3-9]\d{8}$/, "Sender must be a Bangladeshi mobile number"),
  /** Raw message body, e.g. "BIN DHN-014 FULL" or Bangla free text. */
  text: z.string().min(1).max(320),
  channel: z.enum(["sms", "ussd", "hotline"]).default("sms"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type GenerateRouteInput = z.infer<typeof generateRouteSchema>;
export type SmsIntakeInput = z.infer<typeof smsIntakeSchema>;
