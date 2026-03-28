/**
 * seed.ts — Development seed data
 *
 * Usage:
 *   npm run db:seed                  # seed (idempotent)
 *   npm run db:seed -- --clean       # delete existing seed data first
 *
 * Creates:
 *   - 6 family members (1 admin, 3 adults, 2 children)
 *   - Personal calendar layers (auto-created by trigger; verified here)
 *   - 8 sample events spread over the next 30 days
 *   - 6 sample tasks (mix of priorities, assignees, kid-mode)
 *   - Event attendees and reminders
 *
 * All seed users have password: Hoopla123!
 */

import bcrypt from "bcryptjs";
import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://hoopla:hoopla_dev_secret@localhost:5432/hillfamilyhoopla";

const SEED_PASSWORD = "Hoopla123!";
const BCRYPT_ROUNDS = 12;

// ─── Seed users ───────────────────────────────────────────────────────────────

interface SeedUser {
  id: string;
  email: string;
  name: string;
  age: number;
  sex: string;
  phone: string | null;
  profileColor: string;
  role: "admin" | "adult" | "child";
}

const SEED_USERS: SeedUser[] = [
  {
    id: randomUUID(),
    email: "parent1@hillfamilyhoopla.dev",
    name: "Alex Hill",
    age: 42,
    sex: "male",
    phone: "555-0101",
    profileColor: "#3B82F6", // blue
    role: "admin",
  },
  {
    id: randomUUID(),
    email: "parent2@hillfamilyhoopla.dev",
    name: "Jamie Hill",
    age: 40,
    sex: "female",
    phone: "555-0102",
    profileColor: "#EC4899", // pink
    role: "adult",
  },
  {
    id: randomUUID(),
    email: "grandma@hillfamilyhoopla.dev",
    name: "Ruth Hill",
    age: 68,
    sex: "female",
    phone: "555-0103",
    profileColor: "#8B5CF6", // violet
    role: "adult",
  },
  {
    id: randomUUID(),
    email: "teen@hillfamilyhoopla.dev",
    name: "Casey Hill",
    age: 16,
    sex: "non-binary",
    phone: null,
    profileColor: "#22C55E", // green
    role: "adult",
  },
  {
    id: randomUUID(),
    email: "kid1@hillfamilyhoopla.dev",
    name: "Jordan Hill",
    age: 10,
    sex: "male",
    phone: null,
    profileColor: "#F97316", // orange
    role: "child",
  },
  {
    id: randomUUID(),
    email: "kid2@hillfamilyhoopla.dev",
    name: "Skyler Hill",
    age: 7,
    sex: "female",
    phone: null,
    profileColor: "#EF4444", // red
    role: "child",
  },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysFromNow(n: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addHours(date: Date, h: number): Date {
  return new Date(date.getTime() + h * 60 * 60 * 1000);
}

// ─── Core seeder ─────────────────────────────────────────────────────────────

async function seed(client: pg.PoolClient, clean: boolean) {
  if (clean) {
    console.log("[seed] Cleaning existing seed data…");
    // Delete seed users (cascade removes their layers, events, tasks)
    const emails = SEED_USERS.map((u) => u.email);
    await client.query(
      "DELETE FROM users WHERE email = ANY($1::text[])",
      [emails]
    );
    console.log("[seed] Cleaned.");
  }

  // ── Hash password once ───────────────────────────────────────────────────
  console.log("[seed] Hashing passwords…");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  // ── Upsert users ─────────────────────────────────────────────────────────
  console.log("[seed] Inserting users…");
  const insertedUsers: SeedUser[] = [];

  for (const user of SEED_USERS) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [user.email]
    );

    if (existing.rows.length > 0) {
      console.log(`  ↳ ${user.name} (${user.email}) — already exists, skipping`);
      // Use the existing ID for event/task creation
      insertedUsers.push({ ...user, id: existing.rows[0]!.id });
      continue;
    }

    await client.query(
      `INSERT INTO users (
        id, email, password_hash, name, age, sex, phone,
        profile_color, role, email_verified, password_changed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW())`,
      [
        user.id,
        user.email,
        passwordHash,
        user.name,
        user.age,
        user.sex,
        user.phone,
        user.profileColor,
        user.role,
      ]
    );
    insertedUsers.push(user);
    console.log(`  ✓ ${user.name} (${user.role})`);
  }

  // ── Get family layer ──────────────────────────────────────────────────────
  const familyLayerRow = await client.query<{ id: string }>(
    "SELECT id FROM calendar_layers WHERE is_family_layer = true LIMIT 1"
  );
  if (!familyLayerRow.rows[0]) {
    throw new Error("Family calendar layer not found — run migrations first");
  }
  const familyLayerId = familyLayerRow.rows[0].id;

  // ── Get personal layers (created by trigger) ──────────────────────────────
  const userLayerRows = await client.query<{ user_id: string; id: string }>(
    `SELECT user_id, id FROM calendar_layers
     WHERE user_id = ANY($1::uuid[]) AND is_family_layer = false`,
    [insertedUsers.map((u) => u.id)]
  );
  const userLayerMap = new Map(
    userLayerRows.rows.map((r) => [r.user_id, r.id])
  );

  const alex  = insertedUsers[0]!;
  const jamie = insertedUsers[1]!;
  const ruth  = insertedUsers[2]!;
  const casey = insertedUsers[3]!;
  const jordan = insertedUsers[4]!;
  const skyler = insertedUsers[5]!;

  // ── Sample events ─────────────────────────────────────────────────────────
  console.log("[seed] Inserting events…");

  interface EventSeed {
    title: string;
    description?: string;
    location?: string;
    layerId: string;
    createdBy: string;
    start: Date;
    end: Date;
    isAllDay?: boolean;
    category: string;
    attendees?: string[];
  }

  const events: EventSeed[] = [
    {
      title: "Family Dinner",
      description: "Weekly Sunday family dinner at home.",
      location: "123 Hill Lane",
      layerId: familyLayerId,
      createdBy: alex.id,
      start: daysFromNow(2, 18, 0),
      end: daysFromNow(2, 20, 0),
      category: "family",
      attendees: insertedUsers.map((u) => u.id),
    },
    {
      title: "Jordan's Soccer Practice",
      description: "Riverside Youth Soccer League",
      location: "Riverside Park Field 3",
      layerId: userLayerMap.get(jordan.id) ?? familyLayerId,
      createdBy: jamie.id,
      start: daysFromNow(3, 16, 0),
      end: daysFromNow(3, 17, 30),
      category: "sports",
      attendees: [jordan.id, jamie.id],
    },
    {
      title: "Doctor Appointment — Alex",
      description: "Annual physical at Dr. Chen",
      location: "Valley Medical Center",
      layerId: userLayerMap.get(alex.id) ?? familyLayerId,
      createdBy: alex.id,
      start: daysFromNow(5, 10, 0),
      end: daysFromNow(5, 11, 0),
      category: "medical",
      attendees: [alex.id],
    },
    {
      title: "Casey's School Presentation",
      description: "History project presentation — parents invited",
      location: "Lincoln High School — Room 204",
      layerId: userLayerMap.get(casey.id) ?? familyLayerId,
      createdBy: casey.id,
      start: daysFromNow(7, 9, 0),
      end: daysFromNow(7, 10, 0),
      category: "school",
      attendees: [casey.id, alex.id, jamie.id],
    },
    {
      title: "Ruth's Birthday",
      description: "Grandma turns 69! 🎂",
      layerId: familyLayerId,
      createdBy: alex.id,
      start: daysFromNow(10, 0, 0),
      end: daysFromNow(10, 23, 59),
      isAllDay: true,
      category: "family",
      attendees: insertedUsers.map((u) => u.id),
    },
    {
      title: "Skyler's Playdate",
      description: "Playdate with Emma from school",
      location: "Sunshine Elementary",
      layerId: userLayerMap.get(skyler.id) ?? familyLayerId,
      createdBy: jamie.id,
      start: daysFromNow(12, 15, 30),
      end: daysFromNow(12, 17, 30),
      category: "social",
      attendees: [skyler.id, jamie.id],
    },
    {
      title: "Family Movie Night",
      description: "Vote on the movie beforehand!",
      layerId: familyLayerId,
      createdBy: alex.id,
      start: daysFromNow(14, 19, 0),
      end: daysFromNow(14, 21, 30),
      category: "family",
      attendees: insertedUsers.map((u) => u.id),
    },
    {
      title: "HOA Meeting",
      description: "Monthly neighborhood HOA meeting",
      location: "Community Center",
      layerId: userLayerMap.get(alex.id) ?? familyLayerId,
      createdBy: alex.id,
      start: daysFromNow(18, 19, 0),
      end: daysFromNow(18, 20, 30),
      category: "other",
      attendees: [alex.id],
    },
  ];

  const insertedEventIds: string[] = [];
  for (const evt of events) {
    const evtId = randomUUID();
    await client.query(
      `INSERT INTO events (
        id, layer_id, created_by, title, description, location,
        start_time, end_time, is_all_day, category, external_source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'internal')`,
      [
        evtId,
        evt.layerId,
        evt.createdBy,
        evt.title,
        evt.description ?? null,
        evt.location ?? null,
        evt.start,
        evt.end,
        evt.isAllDay ?? false,
        evt.category,
      ]
    );

    // Insert attendees
    if (evt.attendees?.length) {
      for (const userId of evt.attendees) {
        await client.query(
          `INSERT INTO event_attendees (event_id, user_id, status)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [evtId, userId, userId === evt.createdBy ? "accepted" : "invited"]
        );
      }
    }

    // Add a push reminder (30 min before) for the creator
    await client.query(
      `INSERT INTO reminders (event_id, user_id, reminder_type, minutes_before)
       VALUES ($1, $2, 'push', 30)`,
      [evtId, evt.createdBy]
    );

    insertedEventIds.push(evtId);
    console.log(`  ✓ ${evt.title}`);
  }

  // ── Sample tasks ──────────────────────────────────────────────────────────
  console.log("[seed] Inserting tasks…");

  interface TaskSeed {
    title: string;
    description?: string;
    createdBy: string;
    assignedTo?: string;
    dueDate?: Date;
    priority: "low" | "medium" | "high" | "urgent";
    status: "pending" | "in-progress" | "completed" | "cancelled";
    isKidMode?: boolean;
    category?: string;
  }

  const tasks: TaskSeed[] = [
    {
      title: "Pick up dry cleaning",
      createdBy: alex.id,
      assignedTo: alex.id,
      dueDate: daysFromNow(2),
      priority: "medium",
      status: "pending",
      category: "errands",
    },
    {
      title: "Schedule dentist appointments for all kids",
      description: "Jordan and Skyler both need their 6-month checkup",
      createdBy: jamie.id,
      assignedTo: jamie.id,
      dueDate: daysFromNow(7),
      priority: "high",
      status: "in-progress",
      category: "health",
    },
    {
      title: "Clean bedroom",
      description: "Tidy up and put toys away before Friday",
      createdBy: jamie.id,
      assignedTo: jordan.id,
      dueDate: daysFromNow(4, 17, 0),
      priority: "medium",
      status: "pending",
      isKidMode: true,
      category: "chores",
    },
    {
      title: "Water the garden",
      description: "The tomatoes and herbs need water every other day",
      createdBy: alex.id,
      assignedTo: casey.id,
      dueDate: daysFromNow(1, 17, 0),
      priority: "low",
      status: "completed",
      category: "chores",
    },
    {
      title: "Feed Biscuit",
      description: "Give the dog his dinner — one cup of dry food",
      createdBy: jamie.id,
      assignedTo: skyler.id,
      dueDate: daysFromNow(0, 17, 30),
      priority: "high",
      status: "pending",
      isKidMode: true,
      category: "pets",
    },
    {
      title: "Review and pay HOA dues",
      createdBy: alex.id,
      assignedTo: alex.id,
      dueDate: daysFromNow(10),
      priority: "urgent",
      status: "pending",
      category: "finances",
    },
  ];

  for (const task of tasks) {
    await client.query(
      `INSERT INTO tasks (
        id, created_by, assigned_to, title, description,
        due_date, priority, status, is_kid_mode, category
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        randomUUID(),
        task.createdBy,
        task.assignedTo ?? null,
        task.title,
        task.description ?? null,
        task.dueDate ?? null,
        task.priority,
        task.status,
        task.isKidMode ?? false,
        task.category ?? null,
      ]
    );
    console.log(`  ✓ ${task.title}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n[seed] ✓ Seed complete!");
  console.log(`
┌─────────────────────────────────────────┐
│  Seed credentials (all share password)  │
│  Password: ${SEED_PASSWORD.padEnd(29)}│
├──────────────────────┬──────────────────┤
│  Email               │  Role            │
├──────────────────────┼──────────────────┤
│  parent1@...dev      │  admin           │
│  parent2@...dev      │  adult           │
│  grandma@...dev      │  adult           │
│  teen@...dev         │  adult           │
│  kid1@...dev         │  child           │
│  kid2@...dev         │  child           │
└──────────────────────┴──────────────────┘
(@...dev = @hillfamilyhoopla.dev)
  `);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes("--clean");

  if (clean && process.env["NODE_ENV"] === "production") {
    console.error("[seed] --clean is not allowed in production");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const client = await pool.connect();
    try {
      await seed(client, clean);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[seed] ✗ Failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
