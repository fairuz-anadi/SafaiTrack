/**
 * Citizen complaints, the append-only status audit trail, and the SMS/USSD
 * intake channel for citizens without a smartphone.
 */
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createComplaintSchema,
  smsIntakeSchema,
  trackByPhoneSchema,
  updateComplaintStatusSchema,
} from "../../shared/schemas.js";
import { COMPLAINT_TRANSITIONS, type ComplaintStatus } from "../../shared/types.js";
import { db, schema } from "../db/client.js";
import { type AppEnv, requireAuth, requireRole } from "../middleware/auth.js";
import { assertComplaintWard, resolveOperator } from "../services/access.js";
import { readClock } from "../services/operational-data.js";
import { refreshAllForecasts } from "../services/simulation.js";
import { haversineKm } from "../services/routing.js";
import { hashPassword } from "../lib/auth.js";

const {
  complaints,
  complaintStatusHistory,
  notifications,
  bins,
  wards,
  users,
  citizens,
  wardOfficers,
  binSensorReadings,
} = schema;

export const complaintRoutes = new Hono<AppEnv>();

/* ────────────────────────────────  CREATE  ─────────────────────────────── */

complaintRoutes.post(
  "/complaints",
  requireAuth,
  zValidator("json", createComplaintSchema),
  async c => {
    const user = c.get("user");
    const input = c.req.valid("json");

    const complaint = await fileComplaint({
      citizenId: user.userId,
      ...input,
    });
    return c.json({ complaint }, 201);
  }
);

/**
 * Shared complaint-filing path used by both the web form and the SMS gateway,
 * so a text-message report produces exactly the same record, audit trail and
 * notification as one filed in the browser.
 */
async function fileComplaint(input: {
  citizenId: number;
  complaintType: string;
  binId?: number;
  wardId?: number;
  description?: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  photoPath?: string;
  channel: string;
}) {
  let targetWardId = input.wardId ?? null;
  let bin = null;

  if (input.binId) {
    const [row] = await db.select().from(bins).where(eq(bins.binId, input.binId)).limit(1);
    if (!row) throw new HTTPException(404, { message: "Bin not found" });
    bin = row;
    targetWardId = null; // XOR: bin-targeted complaints carry no ward.
  }

  // Route to the officer responsible for the ward the complaint lands in.
  const resolveWard = bin?.wardId ?? input.wardId ?? null;
  let assignedOfficerId: number | null = null;
  if (resolveWard) {
    const [officer] = await db
      .select({ userId: wardOfficers.userId })
      .from(wardOfficers)
      .where(eq(wardOfficers.wardId, resolveWard))
      .limit(1);
    assignedOfficerId = officer?.userId ?? null;
  }

  // Overflow reports on an already-full bin are urgent by definition.
  const priority =
    input.complaintType === "overflow" && (bin?.currentFillPercent ?? 0) >= 85
      ? "urgent"
      : input.complaintType === "overflow"
        ? "high"
        : "normal";

  // Reference numbers continue the city's existing CMP-2081+ series rather
  // than restarting at 1, so codes stay recognisable to ward staff.
  const [{ maxId }] = await db
    .select({ maxId: sql<number>`coalesce(max(${complaints.complaintId}), 0)` })
    .from(complaints);
  const complaintCode = `CMP-${2080 + Number(maxId) + 1}`;

  const [row] = await db
    .insert(complaints)
    .values({
      complaintCode,
      citizenId: input.citizenId,
      binId: input.binId ?? null,
      wardId: targetWardId,
      assignedOfficerId,
      complaintType: input.complaintType as never,
      description: input.description ?? null,
      locationText: input.locationText ?? bin?.landmark ?? null,
      latitude: input.latitude ?? bin?.latitude ?? null,
      longitude: input.longitude ?? bin?.longitude ?? null,
      photoPath: input.photoPath ?? null,
      priority: priority as never,
      status: assignedOfficerId ? "assigned" : "pending",
      channel: input.channel as never,
    })
    .returning();

  // Opening entry of the append-only audit trail.
  await db.insert(complaintStatusHistory).values({
    complaintId: row.complaintId,
    changeNo: 1,
    oldStatus: null,
    newStatus: row.status,
    changedByUserId: input.citizenId,
    remark: `Filed via ${input.channel}`,
  });

  await db
    .update(citizens)
    .set({ reportsFiled: sql`${citizens.reportsFiled} + 1` })
    .where(eq(citizens.userId, input.citizenId));

  // An overflow report is also a fill reading — feed it to the router.
  if (input.complaintType === "overflow" && bin) {
    const [{ maxNo }] = await db
      .select({ maxNo: sql<number>`coalesce(max(${binSensorReadings.readingNo}), 0)` })
      .from(binSensorReadings)
      .where(eq(binSensorReadings.binId, bin.binId));
    await db.insert(binSensorReadings).values({
      binId: bin.binId,
      readingNo: Number(maxNo) + 1,
      recordedAt: (await readClock()).simClock,
      fillLevelPercent: 100,
      readingSource: "citizen",
      reportedByCitizenId: input.citizenId,
      isValid: true,
    });
    await db.update(bins).set({ currentFillPercent: 100 }).where(eq(bins.binId, bin.binId));
    await refreshAllForecasts(bin.binId);
  }

  if (assignedOfficerId) {
    await db.insert(notifications).values({
      recipientUserId: assignedOfficerId,
      complaintId: row.complaintId,
      notificationType: "complaint_update",
      title: `New ${priority} complaint ${complaintCode}`,
      message: `${input.complaintType.replace("_", " ")} — ${row.locationText ?? "location unspecified"}`,
      deliveryStatus: "delivered",
    });
  }

  return row;
}

/**
 * Track reports by the phone they were filed from — no account, no password.
 *
 * A resident who reported by SMS never had an account to begin with; making
 * them create one to see what happened to their report would undo the reason
 * the SMS channel exists. This returns the same rows the citizen portal shows,
 * with the audit trail attached, so one request answers "what happened to my
 * complaint" completely.
 *
 * The response is deliberately uniform whether the number is unregistered or
 * simply has nothing on file: both come back as an empty list, so the endpoint
 * cannot be used to test which numbers are registered with the city.
 *
 * A phone number is a weak secret — anyone who knows it can read these rows.
 * That is an acceptable trade for a municipal complaint log that already goes
 * out by SMS in clear text, but it is a trade, and a deployment handling
 * anything more sensitive wants a one-time code sent to the number instead.
 */
complaintRoutes.post("/complaints/track", zValidator("json", trackByPhoneSchema), async c => {
  const { phone } = c.req.valid("json");

  const [citizen] = await db
    .select({ userId: users.userId })
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.isActive, true)))
    .limit(1);

  if (!citizen) return c.json({ complaints: [] });

  const rows = await db
    .select({
      complaintId: complaints.complaintId,
      complaintCode: complaints.complaintCode,
      complaintType: complaints.complaintType,
      description: complaints.description,
      status: complaints.status,
      priority: complaints.priority,
      channel: complaints.channel,
      locationText: complaints.locationText,
      createdAt: complaints.createdAt,
      resolvedAt: complaints.resolvedAt,
      binCode: bins.binCode,
      binLandmark: bins.landmark,
      wardName: wards.name,
    })
    .from(complaints)
    .leftJoin(bins, eq(complaints.binId, bins.binId))
    .leftJoin(wards, eq(bins.wardId, wards.wardId))
    .where(eq(complaints.citizenId, citizen.userId))
    .orderBy(desc(complaints.createdAt));

  // The trail is the point — a status with no record of who moved it and when
  // is exactly the opacity this channel exists to replace.
  const withHistory = await Promise.all(
    rows.map(async row => ({
      ...row,
      history: await db
        .select({
          changeNo: complaintStatusHistory.changeNo,
          oldStatus: complaintStatusHistory.oldStatus,
          newStatus: complaintStatusHistory.newStatus,
          changedAt: complaintStatusHistory.changedAt,
          remark: complaintStatusHistory.remark,
          changedByName: users.fullName,
          changedByRole: users.userType,
        })
        .from(complaintStatusHistory)
        .leftJoin(users, eq(complaintStatusHistory.changedByUserId, users.userId))
        .where(eq(complaintStatusHistory.complaintId, row.complaintId))
        .orderBy(complaintStatusHistory.changeNo),
    }))
  );

  return c.json({ complaints: withHistory });
});

/* ────────────────────────────────  READ  ───────────────────────────────── */

complaintRoutes.get("/complaints", requireAuth, async c => {
  const session = c.get("user");
  const user = session.role === "officer" ? await resolveOperator(session) : session;
  const status = c.req.query("status");

  const conditions = [];
  // Privacy: a citizen sees only their own complaints (proposal §4.4).
  if (user.role === "citizen") conditions.push(eq(complaints.citizenId, user.userId));
  // A ward officer sees only complaints inside their ward.
  if (user.role === "officer" && user.wardId) {
    conditions.push(
      sql`(${complaints.wardId} = ${user.wardId} or ${bins.wardId} = ${user.wardId})`
    );
  }
  if (status) conditions.push(eq(complaints.status, status as never));

  const rows = await db
    .select({
      complaintId: complaints.complaintId,
      complaintCode: complaints.complaintCode,
      complaintType: complaints.complaintType,
      description: complaints.description,
      status: complaints.status,
      priority: complaints.priority,
      channel: complaints.channel,
      locationText: complaints.locationText,
      latitude: complaints.latitude,
      longitude: complaints.longitude,
      createdAt: complaints.createdAt,
      resolvedAt: complaints.resolvedAt,
      binCode: bins.binCode,
      binLandmark: bins.landmark,
      wardName: wards.name,
      citizenName: users.fullName,
    })
    .from(complaints)
    .leftJoin(bins, eq(complaints.binId, bins.binId))
    .leftJoin(wards, eq(bins.wardId, wards.wardId))
    .innerJoin(users, eq(complaints.citizenId, users.userId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(complaints.createdAt))
    .limit(100);

  return c.json({ complaints: rows });
});

complaintRoutes.get("/complaints/:id", requireAuth, async c => {
  const user = c.get("user");
  const complaintId = Number(c.req.param("id"));

  const [row] = await db
    .select()
    .from(complaints)
    .where(eq(complaints.complaintId, complaintId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Complaint not found" });
  if (user.role === "officer") await assertComplaintWard(user, row);
  if (user.role === "citizen" && row.citizenId !== user.userId) {
    throw new HTTPException(403, { message: "You can only view your own complaints" });
  }

  const history = await db
    .select({
      changeNo: complaintStatusHistory.changeNo,
      oldStatus: complaintStatusHistory.oldStatus,
      newStatus: complaintStatusHistory.newStatus,
      changedAt: complaintStatusHistory.changedAt,
      remark: complaintStatusHistory.remark,
      changedByName: users.fullName,
      changedByRole: users.userType,
    })
    .from(complaintStatusHistory)
    .leftJoin(users, eq(complaintStatusHistory.changedByUserId, users.userId))
    .where(eq(complaintStatusHistory.complaintId, complaintId))
    .orderBy(complaintStatusHistory.changeNo);

  return c.json({ complaint: row, history });
});

/* ──────────────────────────  STATUS TRANSITION  ────────────────────────── */

complaintRoutes.patch(
  "/complaints/:id/status",
  requireRole("officer", "staff"),
  zValidator("json", updateComplaintStatusSchema),
  async c => {
    const user = c.get("user");
    const complaintId = Number(c.req.param("id"));
    const { status, remark } = c.req.valid("json");

    const [row] = await db
      .select()
      .from(complaints)
      .where(eq(complaints.complaintId, complaintId))
      .limit(1);
    if (!row) throw new HTTPException(404, { message: "Complaint not found" });

    await assertComplaintWard(user, row);
    const allowed = COMPLAINT_TRANSITIONS[row.status as ComplaintStatus];
    if (!allowed.includes(status)) {
      throw new HTTPException(409, {
        message: `Cannot move a ${row.status} complaint to ${status}. Allowed: ${allowed.join(", ") || "none — this complaint is closed"}`,
      });
    }

    const resolvedAt = status === "resolved" ? new Date().toISOString() : row.resolvedAt;
    await db
      .update(complaints)
      .set({ status, resolvedAt, assignedOfficerId: row.assignedOfficerId ?? user.userId })
      .where(eq(complaints.complaintId, complaintId));

    // Append, never overwrite — every change stays attributable (proposal §4.4).
    const [{ maxNo }] = await db
      .select({ maxNo: sql<number>`coalesce(max(${complaintStatusHistory.changeNo}), 0)` })
      .from(complaintStatusHistory)
      .where(eq(complaintStatusHistory.complaintId, complaintId));

    await db.insert(complaintStatusHistory).values({
      complaintId,
      changeNo: Number(maxNo) + 1,
      oldStatus: row.status,
      newStatus: status,
      changedByUserId: user.userId,
      remark: remark ?? null,
    });

    await db.insert(notifications).values({
      recipientUserId: row.citizenId,
      complaintId,
      notificationType: "complaint_update",
      title: `${row.complaintCode} is now ${status.replace("_", " ")}`,
      message: remark ?? `Your report has been updated by ${user.fullName}.`,
      deliveryStatus: "delivered",
    });

    if (status === "resolved") {
      await db
        .update(citizens)
        .set({
          reportsConfirmed: sql`${citizens.reportsConfirmed} + 1`,
          trustScore: sql`min(100, ${citizens.trustScore} + 2)`,
        })
        .where(eq(citizens.userId, row.citizenId));
    }

    return c.json({ ok: true, status });
  }
);

/* ──────────────────────  SMS / USSD INTAKE CHANNEL  ────────────────────── */

/**
 * Webhook for an SMS aggregator or USSD gateway.
 *
 * Roughly a third of Dhaka residents do not use a smartphone app for civic
 * reporting. This endpoint accepts a plain text message — in English or
 * Bangla — resolves it to a bin, and files a normal complaint. It is the
 * equity half of "citizen-in-the-loop": the channel a rickshaw puller or an
 * elderly resident can actually use.
 *
 * Message grammar (case-insensitive, either language):
 *   BIN <code> FULL        → overflow on that specific bin
 *   MISSED <code>          → missed collection
 *   BROKEN <code>          → damaged bin
 *   <free text>            → nearest bin to the sender's registered address
 */
complaintRoutes.post("/intake/sms", zValidator("json", smsIntakeSchema), async c => {
  const result = await handleInboundMessage(c.req.valid("json"));
  return c.json(result.body, result.status);
});

export type InboundResult = {
  status: 200 | 404;
  body: { ok: boolean; reply: string; complaintCode?: string; status?: string; registered?: boolean; wardName?: string };
};

/**
 * One inbound text message from any channel, answered in one reply. Shared by
 * the SMS/USSD webhook above and the WhatsApp webhook in whatsapp.ts, so a
 * WhatsApp report and an SMS report are the same record with a different
 * `channel` tag.
 */
export async function handleInboundMessage(input: {
  from: string;
  text: string;
  channel: "sms" | "ussd" | "hotline" | "whatsapp";
}): Promise<InboundResult> {
  const { from, text, channel } = input;

  const command = parseCommand(text);

  const [citizen] = await db
    .select({ userId: users.userId, wardId: citizens.wardId })
    .from(users)
    .innerJoin(citizens, eq(users.userId, citizens.userId))
    .where(eq(users.phone, from))
    .limit(1);

  /* ── REG <ward> ────────────────────────────────────────────────────────
   * Sign-up over SMS, because the people this channel exists for are the
   * ones who cannot complete a web form. The account carries no usable
   * password: possession of the SIM is the credential, and there is nothing
   * here worth a password anyway. */
  if (command?.kind === "register") {
    if (citizen) {
      return { status: 200, body: {
        ok: true,
        reply: "This number is already registered. Text BIN <code> FULL to report. / এই নম্বরটি আগে থেকেই নিবন্ধিত।",
      } };
    }

    const [ward] = await db
      .select({ wardId: wards.wardId, name: wards.name })
      .from(wards)
      .where(sql`replace(${wards.wardCode}, 'DNCC-', '') = ${command.ward}`)
      .limit(1);

    if (!ward) {
      const known = await db.select({ code: wards.wardCode }).from(wards);
      const list = known.map(w => w.code.replace("DNCC-", "")).join(", ");
      return { status: 404, body: { ok: false, reply: `Ward ${command.ward} is not covered yet. Wards on SafaiTrack: ${list}. / এই ওয়ার্ড এখনো যুক্ত নয়।` } };
    }

    const [created] = await db
      .insert(users)
      .values({
        userType: "citizen",
        fullName: `Resident ${from.slice(-4)}`,
        email: `sms-${from}@sms.safaitrack.local`,
        phone: from,
        // Unguessable and never shared: this identity is the SIM, not a password.
        passwordHash: await hashPassword(crypto.randomUUID() + crypto.randomUUID()),
        preferredLanguage: "bn",
        isActive: true,
      })
      .returning({ userId: users.userId });

    await db.insert(citizens).values({ userId: created.userId, wardId: ward.wardId, address: null });

    return { status: 200, body: {
      ok: true,
      registered: true,
      wardName: ward.name,
      reply: `SafaiTrack: registered for ${ward.name}. Text BIN <code> FULL to report a bin. / নিবন্ধন সম্পন্ন হয়েছে।`,
    } };
  }

  if (!citizen) {
    return { status: 404, body: {
        ok: false,
        reply:
          "This number is not registered with SafaiTrack. Reply REG <your ward number> to register. / এই নম্বরটি নিবন্ধিত নয়।",
      } };
  }

  /* ── STATUS <code> ─────────────────────────────────────────────────────
   * Scoped to complaints this number actually filed. Without that, the code
   * is a four-digit number and anyone could walk the whole complaint log by
   * texting increments of it. */
  if (command?.kind === "status") {
    const [row] = await db
      .select({
        complaintCode: complaints.complaintCode,
        status: complaints.status,
        createdAt: complaints.createdAt,
        resolvedAt: complaints.resolvedAt,
        landmark: bins.landmark,
      })
      .from(complaints)
      .leftJoin(bins, eq(complaints.binId, bins.binId))
      .where(and(eq(complaints.complaintCode, command.code), eq(complaints.citizenId, citizen.userId)))
      .limit(1);

    if (!row) {
      return { status: 404, body: { ok: false, reply: `No report ${command.code} found for this number. / এই নম্বরে ${command.code} পাওয়া যায়নি।` } };
    }

    const where = row.landmark ? ` at ${row.landmark}` : "";
    const closed = row.resolvedAt ? ` Resolved ${new Date(row.resolvedAt).toISOString().slice(0, 10)}.` : "";
    return { status: 200, body: {
      ok: true,
      complaintCode: row.complaintCode,
      status: row.status,
      reply: `SafaiTrack ${row.complaintCode}${where}: ${row.status.replace(/_/g, " ")}.${closed} / অবস্থা: ${row.status.replace(/_/g, " ")}।`,
    } };
  }

  const parsed = parseSmsBody(text);
  let binId: number | undefined;

  if (parsed.binCode) {
    const [bin] = await db
      .select()
      .from(bins)
      .where(eq(bins.binCode, parsed.binCode.toUpperCase()))
      .limit(1);
    if (bin) binId = bin.binId;
  }

  // No bin code given — fall back to the nearest bin in the citizen's ward.
  if (!binId && citizen.wardId) {
    const wardBins = await db.select().from(bins).where(eq(bins.wardId, citizen.wardId));
    const [ward] = await db.select().from(wards).where(eq(wards.wardId, citizen.wardId)).limit(1);
    if (wardBins.length > 0 && ward) {
      const nearest = wardBins.reduce((best, b) =>
        haversineKm(ward.centroidLat, ward.centroidLng, b.latitude, b.longitude) <
        haversineKm(ward.centroidLat, ward.centroidLng, best.latitude, best.longitude)
          ? b
          : best
      );
      binId = nearest.binId;
    }
  }

  if (!binId) {
    return { status: 200, body: {
      ok: false,
      reply:
        "Could not identify a bin. Send: BIN <code> FULL / বিন শনাক্ত করা যায়নি। পাঠান: BIN <কোড> FULL",
    } };
  }

  const complaint = await fileComplaint({
    citizenId: citizen.userId,
    complaintType: parsed.type,
    binId,
    description: text,
    channel,
  });

  return { status: 200, body: {
    ok: true,
    complaintCode: complaint.complaintCode,
    // Kept inside one 160-character SMS segment, bilingual.
    reply: `SafaiTrack: report ${complaint.complaintCode} received. Track by replying STATUS ${complaint.complaintCode}. / অভিযোগ গৃহীত হয়েছে।`,
  } };
}

/** Very small keyword parser — deliberately tolerant of messy real messages. */
/**
 * Commands the gateway answers before treating a message as a new report.
 *
 * Both replies the system sends already tell people these exist — the receipt
 * says "reply STATUS <code>" and the rejection says "reply REG <ward>" — so
 * until now the service was advertising two things it did not do. Worse than
 * absent: texting STATUS filed a second complaint, because any message that
 * was not a command still looked like a report.
 */
function parseCommand(text: string): 
  | { kind: "status"; code: string }
  | { kind: "register"; ward: string }
  | null {
  const t = text.trim().toUpperCase();

  // STATUS CMP-2085 — also tolerates "STATUS 2085" and a missing space.
  const status = t.match(/^STATUS\s*[:\-]?\s*(?:CMP[\s-]*)?(\d{2,8})\b/);
  if (status) return { kind: "status", code: `CMP-${status[1]}` };

  // REG 27 — the ward number as a resident would say it, not the ward code.
  const reg = t.match(/^REG(?:ISTER)?\s*[:\-]?\s*(\d{1,3})\b/);
  if (reg) return { kind: "register", ward: reg[1] };

  return null;
}

function parseSmsBody(text: string): {
  type: "overflow" | "missed_collection" | "damaged_bin" | "other";
  binCode?: string;
} {
  const upper = text.toUpperCase();
  const codeMatch = upper.match(/\b(W\d{1,3}-B\d{1,4})\b/);
  const binCode = codeMatch?.[1];

  // Bangla keywords alongside English so either language works.
  if (/MISSED|NOT COLLECT|নেয়নি|আসেনি/.test(upper) || /মিস/.test(text)) {
    return { type: "missed_collection", binCode };
  }
  if (/BROKEN|DAMAG|ভাঙা|নষ্ট/.test(upper) || /ভাঙ/.test(text)) {
    return { type: "damaged_bin", binCode };
  }
  if (/FULL|OVERFLOW|ভরা|উপচে|ময়লা/.test(upper) || /উপচ/.test(text)) {
    return { type: "overflow", binCode };
  }
  return { type: "other", binCode };
}

/* ──────────────────────────────  NOTIFICATIONS  ────────────────────────── */

complaintRoutes.get("/notifications", requireAuth, async c => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, user.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  const unread = rows.filter(n => n.deliveryStatus !== "read").length;
  return c.json({ notifications: rows, unread });
});

complaintRoutes.post("/notifications/read", requireAuth, async c => {
  const user = c.get("user");
  await db
    .update(notifications)
    .set({ deliveryStatus: "read" })
    .where(eq(notifications.recipientUserId, user.userId));
  return c.json({ ok: true });
});
