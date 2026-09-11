/**
 * Seed the database with a realistic Dhaka operating picture.
 *
 * Geography is real: ward numbers follow Dhaka North City Corporation (DNCC),
 * bin coordinates sit on actual roads in Dhanmondi, Kalabagan, Lalmatia,
 * Mohammadpur and Tejgaon, and the disposal point is the Amin Bazar landfill
 * that DNCC trucks genuinely use. A judge from Dhaka should recognise every
 * landmark on the map.
 *
 * Exported as a function so the server can seed itself on first start (see
 * `bootstrap.ts`); `seed.ts` is the command-line wrapper behind `npm run
 * db:seed`. Nothing here runs on import.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "./client.js";
import { hashPassword } from "../lib/auth.js";
import { forecastBin } from "../services/forecast.js";

const {
  users,
  citizens,
  municipalStaff,
  truckDrivers,
  wardOfficers,
  wards,
  collectionZones,
  wasteCategories,
  bins,
  binSensorReadings,
  trucks,
  truckMaintenanceLogs,
  complaints,
  complaintStatusHistory,
  notifications,
  simulationState,
  binForecasts,
} = schema;

/* ────────────────────────────  REAL GEOGRAPHY  ─────────────────────────── */

/** Amin Bazar sanitary landfill — DNCC's actual disposal site. */
const AMIN_BAZAR = { lat: 23.7862, lng: 90.3208 };

const WARD_SEED = [
  {
    wardCode: "DNCC-27",
    name: "Dhanmondi",
    nameBn: "ধানমন্ডি",
    cityCorporation: "Dhaka North City Corporation",
    population: 62400,
    areaSqKm: 2.61,
    centroidLat: 23.7461,
    centroidLng: 90.3742,
    depotLat: 23.7509,
    depotLng: 90.3803, // DNCC Zone-5 office area, Kalabagan
  },
  {
    wardCode: "DNCC-16",
    name: "Kalabagan",
    nameBn: "কলাবাগান",
    cityCorporation: "Dhaka North City Corporation",
    population: 48100,
    areaSqKm: 1.42,
    centroidLat: 23.7489,
    centroidLng: 90.3826,
    depotLat: 23.7509,
    depotLng: 90.3803,
  },
  {
    wardCode: "DNCC-32",
    name: "Mohammadpur",
    nameBn: "মোহাম্মদপুর",
    cityCorporation: "Dhaka North City Corporation",
    population: 78900,
    areaSqKm: 3.15,
    centroidLat: 23.7588,
    centroidLng: 90.3603,
    depotLat: 23.7612,
    depotLng: 90.3585, // Mohammadpur Town Hall depot
  },
  {
    wardCode: "DNCC-19",
    name: "Tejgaon",
    nameBn: "তেজগাঁও",
    cityCorporation: "Dhaka North City Corporation",
    population: 54200,
    areaSqKm: 2.08,
    centroidLat: 23.7594,
    centroidLng: 90.3921,
    depotLat: 23.7638,
    depotLng: 90.3944, // Tejgaon industrial area
  },
];

const ZONE_SEED: Record<string, { zoneNo: number; zoneName: string; description: string }[]> = {
  "DNCC-27": [
    { zoneNo: 1, zoneName: "Dhanmondi Lake North", description: "Roads 2–8, lakeside footpaths" },
    { zoneNo: 2, zoneName: "Dhanmondi Central", description: "Roads 9–15, Satmasjid Road spine" },
    { zoneNo: 3, zoneName: "Dhanmondi South", description: "Roads 16–27, Jigatola approach" },
  ],
  "DNCC-16": [
    { zoneNo: 1, zoneName: "Kalabagan Bazar", description: "Wet market and surrounding lanes" },
    { zoneNo: 2, zoneName: "Green Road Corridor", description: "Hospital belt, high-volume" },
  ],
  "DNCC-32": [
    { zoneNo: 1, zoneName: "Lalmatia Block A–D", description: "Residential blocks" },
    { zoneNo: 2, zoneName: "Mohammadpur Bazar", description: "Krishi Market and Town Hall" },
    { zoneNo: 3, zoneName: "Shyamoli Approach", description: "Ring Road frontage" },
  ],
  "DNCC-19": [
    { zoneNo: 1, zoneName: "Farmgate Junction", description: "Transit hub, very high footfall" },
    { zoneNo: 2, zoneName: "Tejgaon Industrial", description: "Mixed commercial and industrial" },
  ],
};

/**
 * Bins placed on real roads. `base` is the fill level the seed starts from;
 * `rate` is the true underlying fill rate the reading history is generated
 * against, so the forecaster has a real signal to recover.
 */
const BIN_SEED: {
  ward: string;
  zone: number;
  landmark: string;
  landmarkBn: string;
  lat: number;
  lng: number;
  capacity: number;
  base: number;
  rate: number;
  category: string;
}[] = [
  // ── Ward 27 · Dhanmondi ───────────────────────────────────────────────
  { ward: "DNCC-27", zone: 1, landmark: "Dhanmondi Road 2, near Lake gate", landmarkBn: "ধানমন্ডি রোড ২, লেক গেট", lat: 23.7437, lng: 90.3789, capacity: 1100, base: 94, rate: 4.1, category: "General waste" },
  { ward: "DNCC-27", zone: 1, landmark: "Rabindra Sarobar entrance", landmarkBn: "রবীন্দ্র সরোবর প্রবেশপথ", lat: 23.7452, lng: 90.3730, capacity: 660, base: 71, rate: 3.4, category: "General waste" },
  { ward: "DNCC-27", zone: 1, landmark: "Dhanmondi Road 8/A crossing", landmarkBn: "ধানমন্ডি রোড ৮/এ মোড়", lat: 23.7476, lng: 90.3757, capacity: 1100, base: 58, rate: 2.6, category: "General waste" },
  { ward: "DNCC-27", zone: 2, landmark: "Dhanmondi Road 12, Satmasjid Road", landmarkBn: "ধানমন্ডি রোড ১২, সাতমসজিদ রোড", lat: 23.7465, lng: 90.3718, capacity: 1100, base: 88, rate: 3.9, category: "General waste" },
  { ward: "DNCC-27", zone: 2, landmark: "Anam Rangs Plaza service lane", landmarkBn: "আনাম র‍্যাংগস প্লাজা", lat: 23.7500, lng: 90.3690, capacity: 660, base: 46, rate: 2.2, category: "Recyclable" },
  { ward: "DNCC-27", zone: 2, landmark: "Dhanmondi Road 15 kitchen market", landmarkBn: "ধানমন্ডি রোড ১৫ কাঁচাবাজার", lat: 23.7443, lng: 90.3702, capacity: 1100, base: 91, rate: 5.2, category: "Organic waste" },
  { ward: "DNCC-27", zone: 3, landmark: "Jigatola bus stand", landmarkBn: "জিগাতলা বাস স্ট্যান্ড", lat: 23.7391, lng: 90.3742, capacity: 1100, base: 77, rate: 3.6, category: "General waste" },
  { ward: "DNCC-27", zone: 3, landmark: "Dhanmondi Road 27 west end", landmarkBn: "ধানমন্ডি রোড ২৭ পশ্চিম", lat: 23.7513, lng: 90.3672, capacity: 660, base: 34, rate: 1.9, category: "General waste" },
  { ward: "DNCC-27", zone: 3, landmark: "Sobhanbag mosque corner", landmarkBn: "শোভানবাগ মসজিদ মোড়", lat: 23.7526, lng: 90.3757, capacity: 660, base: 63, rate: 2.9, category: "General waste" },
  { ward: "DNCC-27", zone: 1, landmark: "Dhanmondi Road 5 school gate", landmarkBn: "ধানমন্ডি রোড ৫ স্কুল গেট", lat: 23.7420, lng: 90.3765, capacity: 660, base: 52, rate: 2.4, category: "General waste" },

  // ── Ward 16 · Kalabagan / Green Road ──────────────────────────────────
  { ward: "DNCC-16", zone: 1, landmark: "Kalabagan Bazar main gate", landmarkBn: "কলাবাগান বাজার প্রধান ফটক", lat: 23.7484, lng: 90.3818, capacity: 1100, base: 96, rate: 5.8, category: "Organic waste" },
  { ward: "DNCC-16", zone: 1, landmark: "Kalabagan Krira Chakra field", landmarkBn: "কলাবাগান ক্রীড়া চক্র মাঠ", lat: 23.7497, lng: 90.3841, capacity: 660, base: 42, rate: 2.1, category: "General waste" },
  { ward: "DNCC-16", zone: 1, landmark: "Kalabagan first lane", landmarkBn: "কলাবাগান ১ম গলি", lat: 23.7472, lng: 90.3835, capacity: 660, base: 68, rate: 3.1, category: "General waste" },
  { ward: "DNCC-16", zone: 2, landmark: "Green Road, opposite Comfort Hospital", landmarkBn: "গ্রীন রোড, কমফোর্ট হাসপাতালের বিপরীতে", lat: 23.7521, lng: 90.3856, capacity: 1100, base: 83, rate: 4.4, category: "Medical waste" },
  { ward: "DNCC-16", zone: 2, landmark: "Green Road / Panthapath junction", landmarkBn: "গ্রীন রোড – পান্থপথ মোড়", lat: 23.7539, lng: 90.3872, capacity: 1100, base: 74, rate: 3.8, category: "General waste" },
  { ward: "DNCC-16", zone: 2, landmark: "Shukrabad crossing", landmarkBn: "শুক্রাবাদ মোড়", lat: 23.7503, lng: 90.3789, capacity: 660, base: 29, rate: 1.7, category: "Recyclable" },
  { ward: "DNCC-16", zone: 2, landmark: "Green Road staff quarters", landmarkBn: "গ্রীন রোড স্টাফ কোয়ার্টার", lat: 23.7548, lng: 90.3838, capacity: 660, base: 55, rate: 2.5, category: "General waste" },

  // ── Ward 32 · Mohammadpur / Lalmatia ──────────────────────────────────
  { ward: "DNCC-32", zone: 1, landmark: "Lalmatia Block C, Road 4", landmarkBn: "লালমাটিয়া ব্লক সি, রোড ৪", lat: 23.7566, lng: 90.3661, capacity: 660, base: 61, rate: 2.7, category: "General waste" },
  { ward: "DNCC-32", zone: 1, landmark: "Lalmatia Block A boys school", landmarkBn: "লালমাটিয়া ব্লক এ স্কুল", lat: 23.7583, lng: 90.3639, capacity: 660, base: 38, rate: 2.0, category: "General waste" },
  { ward: "DNCC-32", zone: 1, landmark: "Lalmatia Block D kitchen market", landmarkBn: "লালমাটিয়া ব্লক ডি কাঁচাবাজার", lat: 23.7551, lng: 90.3625, capacity: 1100, base: 89, rate: 5.0, category: "Organic waste" },
  { ward: "DNCC-32", zone: 2, landmark: "Mohammadpur Town Hall market", landmarkBn: "মোহাম্মদপুর টাউন হল মার্কেট", lat: 23.7605, lng: 90.3592, capacity: 1100, base: 97, rate: 6.1, category: "Organic waste" },
  { ward: "DNCC-32", zone: 2, landmark: "Krishi Market gate 2", landmarkBn: "কৃষি মার্কেট গেট ২", lat: 23.7629, lng: 90.3618, capacity: 1100, base: 80, rate: 4.6, category: "Organic waste" },
  { ward: "DNCC-32", zone: 2, landmark: "Mohammadpur bus stand", landmarkBn: "মোহাম্মদপুর বাস স্ট্যান্ড", lat: 23.7648, lng: 90.3576, capacity: 1100, base: 66, rate: 3.3, category: "General waste" },
  { ward: "DNCC-32", zone: 3, landmark: "Shyamoli Ring Road frontage", landmarkBn: "শ্যামলী রিং রোড", lat: 23.7691, lng: 90.3654, capacity: 660, base: 44, rate: 2.3, category: "General waste" },
  { ward: "DNCC-32", zone: 3, landmark: "Asad Gate footbridge", landmarkBn: "আসাদ গেট ফুটওভারব্রিজ", lat: 23.7597, lng: 90.3706, capacity: 660, base: 31, rate: 1.8, category: "Recyclable" },
  { ward: "DNCC-32", zone: 3, landmark: "Mohammadpur Housing Society", landmarkBn: "মোহাম্মদপুর হাউজিং সোসাইটি", lat: 23.7664, lng: 90.3631, capacity: 660, base: 57, rate: 2.6, category: "General waste" },

  // ── Ward 19 · Tejgaon / Farmgate ──────────────────────────────────────
  { ward: "DNCC-19", zone: 1, landmark: "Farmgate footbridge north", landmarkBn: "ফার্মগেট ফুটওভারব্রিজ উত্তর", lat: 23.7581, lng: 90.3896, capacity: 1100, base: 92, rate: 5.5, category: "General waste" },
  { ward: "DNCC-19", zone: 1, landmark: "Farmgate Anandabazar lane", landmarkBn: "ফার্মগেট আনন্দবাজার গলি", lat: 23.7572, lng: 90.3878, capacity: 1100, base: 85, rate: 4.8, category: "Organic waste" },
  { ward: "DNCC-19", zone: 1, landmark: "Tejgaon College gate", landmarkBn: "তেজগাঁও কলেজ গেট", lat: 23.7561, lng: 90.3915, capacity: 660, base: 49, rate: 2.4, category: "General waste" },
  { ward: "DNCC-19", zone: 2, landmark: "Tejgaon industrial area, Gate 3", landmarkBn: "তেজগাঁও শিল্প এলাকা, গেট ৩", lat: 23.7648, lng: 90.3958, capacity: 1100, base: 36, rate: 2.0, category: "Recyclable" },
  { ward: "DNCC-19", zone: 2, landmark: "Nakhalpara rail crossing", landmarkBn: "নাখালপাড়া রেল ক্রসিং", lat: 23.7676, lng: 90.3921, capacity: 660, base: 73, rate: 3.5, category: "General waste" },
  { ward: "DNCC-19", zone: 2, landmark: "Tejgaon truck stand", landmarkBn: "তেজগাঁও ট্রাক স্ট্যান্ড", lat: 23.7702, lng: 90.3979, capacity: 1100, base: 26, rate: 1.6, category: "General waste" },
];

const CATEGORY_SEED = [
  {
    categoryName: "General waste",
    categoryNameBn: "সাধারণ বর্জ্য",
    handlingNotes: "Standard municipal collection. Direct to Amin Bazar landfill.",
    isHazardous: false,
    colorHex: "#68ad34",
  },
  {
    categoryName: "Organic waste",
    categoryNameBn: "জৈব বর্জ্য",
    handlingNotes: "Market and kitchen waste. Fills fastest; prioritise in monsoon.",
    isHazardous: false,
    colorHex: "#f0b84a",
  },
  {
    categoryName: "Recyclable",
    categoryNameBn: "পুনর্ব্যবহারযোগ্য",
    handlingNotes: "Paper, plastic, metal. Routed to the Zone-5 sorting yard.",
    isHazardous: false,
    colorHex: "#68a5e8",
  },
  {
    categoryName: "Medical waste",
    categoryNameBn: "চিকিৎসা বর্জ্য",
    handlingNotes: "HAZARDOUS. Segregated collection only, licensed handler required.",
    isHazardous: true,
    colorHex: "#ff715f",
  },
];

/* ─────────────────────────────  SEED RUNNER  ───────────────────────────── */

/** Deterministic PRNG so every demo run produces the identical picture. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const random = makeRandom(20230104);

const HOUR = 3_600_000;

export async function seed() {
  console.log("→ Clearing existing data…");
  // Child tables first so foreign keys stay satisfied.
  for (const table of [
    binForecasts,
    notifications,
    complaintStatusHistory,
    complaints,
    schema.routeComparisons,
    schema.collectionHistory,
    schema.routeStops,
    schema.routes,
    truckMaintenanceLogs,
    trucks,
    binSensorReadings,
    bins,
    collectionZones,
    wasteCategories,
    schema.agentMessages,
    schema.agentConversations,
    citizens,
    municipalStaff,
    truckDrivers,
    wardOfficers,
    users,
    wards,
    simulationState,
  ]) {
    await db.delete(table);
  }

  // Reset AUTOINCREMENT counters so a reseed always produces the same ids.
  // Deleting rows alone leaves sqlite_sequence intact, which is why repeated
  // seeding used to push bin ids into the hundreds. Doing it this way also
  // avoids deleting the database file, which Windows refuses while the server
  // holds it open.
  await db.run(sql`delete from sqlite_sequence`);

  console.log("→ Wards and zones…");
  const wardIdByCode = new Map<string, number>();
  for (const w of WARD_SEED) {
    const [row] = await db
      .insert(wards)
      .values({
        ...w,
        disposalLat: AMIN_BAZAR.lat,
        disposalLng: AMIN_BAZAR.lng,
      })
      .returning({ wardId: wards.wardId });
    wardIdByCode.set(w.wardCode, row.wardId);

    for (const z of ZONE_SEED[w.wardCode]) {
      await db.insert(collectionZones).values({ wardId: row.wardId, ...z });
    }
  }

  console.log("→ Waste categories…");
  const categoryIdByName = new Map<string, number>();
  for (const c of CATEGORY_SEED) {
    const [row] = await db
      .insert(wasteCategories)
      .values(c)
      .returning({ id: wasteCategories.wasteCategoryId });
    categoryIdByName.set(c.categoryName, row.id);
  }

  console.log("→ Users across all four roles…");
  const password = await hashPassword("safai1234");

  async function addUser(
    userType: "citizen" | "staff" | "driver" | "officer",
    fullName: string,
    email: string,
    phone: string,
    lang: "en" | "bn" = "en"
  ) {
    const [row] = await db
      .insert(users)
      .values({
        userType,
        fullName,
        email,
        phone,
        passwordHash: password,
        preferredLanguage: lang,
      })
      .returning({ userId: users.userId });
    return row.userId;
  }

  const staffId = await addUser("staff", "Fairuz Anadi", "staff@safaitrack.gov.bd", "01711000001");
  await db.insert(municipalStaff).values({
    userId: staffId,
    employeeNo: "DNCC-OPS-0104",
    designation: "Waste Operations Officer, Zone 5",
    cityCorporation: "Dhaka North City Corporation",
  });

  const staffId2 = await addUser("staff", "Easteak Ahmed", "ops@safaitrack.gov.bd", "01711000002");
  await db.insert(municipalStaff).values({
    userId: staffId2,
    employeeNo: "DNCC-OPS-0123",
    designation: "Fleet Coordinator",
    cityCorporation: "Dhaka North City Corporation",
  });

  const officerIds: number[] = [];
  /** Ward → the officer who walks it, so an inspection is filed by the right one. */
  const officerIdByWard = new Map<number, number>();
  const officerSeed = [
    { name: "Nusrat Jahan", email: "officer27@safaitrack.gov.bd", ward: "DNCC-27", emp: "WO-27-001" },
    { name: "Saleh Mahmud Sami", email: "officer16@safaitrack.gov.bd", ward: "DNCC-16", emp: "WO-16-001" },
    { name: "Tanjila Broti", email: "officer32@safaitrack.gov.bd", ward: "DNCC-32", emp: "WO-32-001" },
    { name: "Md Hasan Al Kayem", email: "officer19@safaitrack.gov.bd", ward: "DNCC-19", emp: "WO-19-001" },
  ];
  for (const o of officerSeed) {
    const id = await addUser("officer", o.name, o.email, "017110001" + officerIds.length);
    await db.insert(wardOfficers).values({
      userId: id,
      employeeNo: o.emp,
      wardId: wardIdByCode.get(o.ward)!,
      officeContact: "+8802-9" + (100000 + officerIds.length),
    });
    officerIds.push(id);
    officerIdByWard.set(wardIdByCode.get(o.ward)!, id);
  }

  const driverIds: number[] = [];
  const driverSeed = [
    { name: "Md. Rafiqul Islam", email: "rafiq@safaitrack.gov.bd", lic: "DHA-TR-884512", shift: "morning" as const },
    { name: "Abdul Karim", email: "karim@safaitrack.gov.bd", lic: "DHA-TR-771203", shift: "morning" as const },
    { name: "Jashim Uddin", email: "jashim@safaitrack.gov.bd", lic: "DHA-TR-663890", shift: "evening" as const },
    { name: "Shahin Alam", email: "shahin@safaitrack.gov.bd", lic: "DHA-TR-559471", shift: "night" as const },
  ];
  for (const d of driverSeed) {
    const id = await addUser("driver", d.name, d.email, "0181100000" + driverIds.length, "bn");
    await db.insert(truckDrivers).values({
      userId: id,
      licenseNo: d.lic,
      licenseExpiry: "2028-06-30",
      shift: d.shift,
      isAvailable: true,
    });
    driverIds.push(id);
  }

  const citizenIds: number[] = [];
  const citizenSeed = [
    { name: "Rumana Akter", email: "rumana@example.com", ward: "DNCC-27", addr: "House 42, Road 12, Dhanmondi", lang: "bn" as const },
    { name: "Tanvir Hasan", email: "tanvir@example.com", ward: "DNCC-16", addr: "Green Road, Kalabagan", lang: "en" as const },
    { name: "Shirin Sultana", email: "shirin@example.com", ward: "DNCC-32", addr: "Block C, Lalmatia", lang: "bn" as const },
    { name: "Imran Chowdhury", email: "citizen@example.com", ward: "DNCC-27", addr: "Road 8/A, Dhanmondi", lang: "en" as const },
  ];
  for (const cz of citizenSeed) {
    const id = await addUser("citizen", cz.name, cz.email, "0191100000" + citizenIds.length, cz.lang);
    await db.insert(citizens).values({
      userId: id,
      address: cz.addr,
      wardId: wardIdByCode.get(cz.ward)!,
      trustScore: 50 + Math.floor(random() * 40),
      reportsFiled: Math.floor(random() * 8),
      reportsConfirmed: Math.floor(random() * 5),
    });
    citizenIds.push(id);
  }

  console.log("→ Fleet…");
  const truckSeed = [
    { plate: "DHAKA METRO-TA-11-4208", cap: 7000, make: "Tata", model: "LPK 1613", ward: "DNCC-27", fuel: 0.38 },
    { plate: "DHAKA METRO-TA-11-3877", cap: 5000, make: "Ashok Leyland", model: "Ecomet 1215", ward: "DNCC-16", fuel: 0.33 },
    { plate: "DHAKA METRO-TA-12-1145", cap: 7000, make: "Tata", model: "LPK 1613", ward: "DNCC-32", fuel: 0.38 },
    { plate: "DHAKA METRO-TA-12-2960", cap: 3500, make: "Isuzu", model: "NPR", ward: "DNCC-19", fuel: 0.27 },
    { plate: "DHAKA METRO-TA-11-5031", cap: 5000, make: "Ashok Leyland", model: "Ecomet 1215", ward: "DNCC-27", fuel: 0.33 },
  ];
  const truckIds: number[] = [];
  for (const t of truckSeed) {
    const [row] = await db
      .insert(trucks)
      .values({
        plateNumber: t.plate,
        capacityKg: t.cap,
        make: t.make,
        model: t.model,
        homeWardId: wardIdByCode.get(t.ward)!,
        fuelLitresPerKm: t.fuel,
        currentOdometerKm: Math.round(40000 + random() * 60000),
        status: "available",
      })
      .returning({ truckId: trucks.truckId });
    truckIds.push(row.truckId);
  }

  await db.insert(truckMaintenanceLogs).values([
    {
      truckId: truckIds[1],
      maintenanceDate: isoDaysAgo(4),
      issueDescription: "Hydraulic compactor seal replacement",
      costBdt: 18500,
      status: "completed",
      loggedByStaffId: staffId2,
    },
    {
      truckId: truckIds[3],
      maintenanceDate: isoDaysAgo(1),
      issueDescription: "Rear axle bearing noise — inspection scheduled",
      costBdt: 0,
      status: "scheduled",
      loggedByStaffId: staffId2,
    },
  ]);

  console.log("→ Bins and 7 days of sensor history…");
  const now = Date.now();
  let binCounter: Record<string, number> = {};

  for (const b of BIN_SEED) {
    const wardId = wardIdByCode.get(b.ward)!;
    const shortCode = b.ward.replace("DNCC-", "W");
    binCounter[shortCode] = (binCounter[shortCode] ?? 0) + 1;
    const binCode = `${shortCode}-B${String(binCounter[shortCode]).padStart(3, "0")}`;

    // Work backwards from the current fill level to the last collection, so
    // the history is internally consistent with `base` and `rate`.
    const hoursSinceCollection = Math.min(72, b.base / b.rate);
    const lastCollectedAt = new Date(now - hoursSinceCollection * HOUR).toISOString();

    const [binRow] = await db
      .insert(bins)
      .values({
        binCode,
        wardId,
        zoneNo: b.zone,
        wasteCategoryId: categoryIdByName.get(b.category)!,
        landmark: b.landmark,
        landmarkBn: b.landmarkBn,
        capacityLiters: b.capacity,
        currentFillPercent: b.base,
        latitude: b.lat,
        longitude: b.lng,
        fillRatePctPerHour: b.rate,
        lastCollectedAt,
        operationalStatus: "active",
      })
      .returning({ binId: bins.binId });

    // Readings every 3 hours since the last collection, with realistic noise.
    const readings: (typeof binSensorReadings.$inferInsert)[] = [];
    let readingNo = 0;
    const steps = Math.max(3, Math.floor(hoursSinceCollection / 3));

    /*
     * A ward officer walks a round rather than checking one bin at random, so
     * the inspection is placed at whichever reading sits closest to a fixed
     * hour rather than scattered. Every bin in a ward then carries an officer
     * reading from about the same moment, which is what a round looks like in
     * the data — and it gives the bin page a real inspection to show without
     * anyone having to file one live.
     */
    const officerId = officerIdByWard.get(wardId);
    const roundHoursAgo = 9;
    let inspectionStep = -1;
    if (officerId !== undefined) {
      let best = Infinity;
      for (let s = 0; s <= steps; s++) {
        const hoursAgo = hoursSinceCollection - (s * hoursSinceCollection) / steps;
        const gap = Math.abs(hoursAgo - roundHoursAgo);
        if (gap < best) {
          best = gap;
          inspectionStep = s;
        }
      }
    }

    for (let s = 0; s <= steps; s++) {
      const hoursAgo = hoursSinceCollection - (s * hoursSinceCollection) / steps;
      const trueFill = b.base - hoursAgo * b.rate;
      const noise = (random() - 0.5) * 4; // ±2 points of reporting noise
      readingNo++;
      const isInspection = s === inspectionStep;
      readings.push({
        binId: binRow.binId,
        readingNo,
        recordedAt: new Date(now - hoursAgo * HOUR).toISOString(),
        fillLevelPercent: clamp(round1(trueFill + noise), 0, 100),
        readingSource: isInspection ? "officer" : random() < 0.15 ? "citizen" : "simulated",
        // Inspections are attributed; the anonymous reports stay anonymous.
        reportedByCitizenId: isInspection ? officerId! : null,
        isValid: true,
      });
    }
    await db.insert(binSensorReadings).values(readings);

    // Fit the forecaster against the history we just wrote.
    const f = forecastBin(
      b.base,
      readings.map(r => ({
        recordedAt: r.recordedAt as string,
        fillLevelPercent: r.fillLevelPercent as number,
      }))
    );
    await db.insert(binForecasts).values({
      binId: binRow.binId,
      currentFillPercent: b.base,
      fillRatePctPerHour: f.fillRatePctPerHour,
      hoursToOverflow: f.hoursToOverflow,
      predictedOverflowAt: f.predictedOverflowAt,
      confidence: f.confidence,
      sampleSize: f.sampleSize,
    });
  }

  console.log("→ Complaints with full audit trails…");
  const allBins = await db.select().from(bins);
  const complaintSeed = [
    { type: "overflow" as const, desc: "Bin has been overflowing onto the footpath since yesterday evening. Smell is very bad.", status: "pending" as const, hours: 0.2, channel: "web" as const, priority: "urgent" as const },
    { type: "missed_collection" as const, desc: "Truck did not come on Road 7 for two days running.", status: "in_progress" as const, hours: 0.6, channel: "web" as const, priority: "high" as const },
    { type: "damaged_bin" as const, desc: "Lid is broken off, dogs are pulling waste out at night.", status: "assigned" as const, hours: 1.1, channel: "sms" as const, priority: "normal" as const },
    { type: "illegal_dumping" as const, desc: "Construction rubble dumped beside the market bin.", status: "resolved" as const, hours: 26, channel: "web" as const, priority: "normal" as const },
    { type: "overflow" as const, desc: "বাজারের পাশে ময়লা উপচে পড়ছে, দ্রুত ব্যবস্থা নিন।", status: "resolved" as const, hours: 48, channel: "ussd" as const, priority: "high" as const },
    { type: "overflow" as const, desc: "Waste spilling near the school gate, children walk past it.", status: "pending" as const, hours: 3.4, channel: "web" as const, priority: "high" as const },
  ];

  let complaintNo = 2080;
  for (const [i, cs] of complaintSeed.entries()) {
    const bin = allBins[Math.floor(random() * allBins.length)];
    const createdAt = new Date(now - cs.hours * HOUR).toISOString();
    complaintNo++;
    const officerForWard = officerSeed.findIndex(o => wardIdByCode.get(o.ward) === bin.wardId);
    const assignedOfficerId = cs.status === "pending" ? null : officerIds[Math.max(0, officerForWard)];

    const [row] = await db
      .insert(complaints)
      .values({
        complaintCode: `CMP-${complaintNo}`,
        citizenId: citizenIds[i % citizenIds.length],
        binId: bin.binId,
        wardId: null,
        assignedOfficerId,
        complaintType: cs.type,
        description: cs.desc,
        locationText: bin.landmark,
        latitude: bin.latitude,
        longitude: bin.longitude,
        priority: cs.priority,
        status: cs.status,
        channel: cs.channel,
        createdAt,
        resolvedAt: cs.status === "resolved" ? new Date(now - (cs.hours - 4) * HOUR).toISOString() : null,
      })
      .returning({ complaintId: complaints.complaintId });

    // Append-only audit trail — every status the complaint passed through.
    const chain: string[] = ["pending"];
    if (["assigned", "in_progress", "resolved"].includes(cs.status)) chain.push("assigned");
    if (["in_progress", "resolved"].includes(cs.status)) chain.push("in_progress");
    if (cs.status === "resolved") chain.push("resolved");

    for (let k = 0; k < chain.length; k++) {
      await db.insert(complaintStatusHistory).values({
        complaintId: row.complaintId,
        changeNo: k + 1,
        oldStatus: k === 0 ? null : chain[k - 1],
        newStatus: chain[k],
        changedAt: new Date(new Date(createdAt).getTime() + k * 2 * HOUR).toISOString(),
        changedByUserId: k === 0 ? citizenIds[i % citizenIds.length] : assignedOfficerId,
        remark:
          k === 0
            ? "Filed by citizen"
            : chain[k] === "resolved"
              ? "Bin cleared and area swept"
              : "Picked up by ward officer",
      });
    }

    await db.insert(notifications).values({
      recipientUserId: citizenIds[i % citizenIds.length],
      complaintId: row.complaintId,
      notificationType: "complaint_update",
      title: `Complaint CMP-${complaintNo} is ${cs.status.replace("_", " ")}`,
      message: `Your report about ${bin.landmark} is now ${cs.status.replace("_", " ")}.`,
      deliveryStatus: cs.status === "resolved" ? "read" : "delivered",
      createdAt,
    });
  }

  console.log("→ Simulation clock…");
  await db.insert(simulationState).values({
    id: 1,
    simClock: new Date(now).toISOString(),
    isRunning: false,
    minutesPerTick: 30,
    ticksElapsed: 0,
  });

  const counts = await db.get<{ b: number; u: number; c: number }>(
    sql`select (select count(*) from bins) as b, (select count(*) from users) as u, (select count(*) from complaints) as c`
  );

  console.log("\n✅ Seed complete.");
  console.log(`   ${counts?.b ?? 0} bins · ${counts?.u ?? 0} users · ${counts?.c ?? 0} complaints`);
  console.log("\n   Demo accounts — password for all: safai1234");
  console.log("   ├─ Municipal staff  staff@safaitrack.gov.bd");
  console.log("   ├─ Ward officer     officer27@safaitrack.gov.bd");
  console.log("   ├─ Truck driver     rafiq@safaitrack.gov.bd");
  console.log("   └─ Citizen          citizen@example.com\n");
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * HOUR).toISOString().slice(0, 10);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
