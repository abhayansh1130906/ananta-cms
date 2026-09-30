import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";

const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");

const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : process.env[key];
};

const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = getEnv("SUPABASE_SECRET_KEY");

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map((item) => stableStringify(item)).join(",")}]`;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${entries.join(",")}}`;
}

function checksum(data) {
  return crypto.createHash("sha256").update(stableStringify(data)).digest("hex");
}

async function seed() {
  console.log("Seeding festival data...");

  const items = [
    // Events
    {
      type_key: "events",
      slug: "opening-keynote-cultural-night",
      sort_order: 1,
      status: "published",
      data: {
        title: "Opening Keynote & Cultural Night",
        description: "<p>Kick off Ananta 2026 with an inspiring keynote followed by an electrifying evening of music, dance, and theatrical performances.</p>",
        date: "2026-10-15",
        time: "18:00",
        venue: "Grand Amphitheatre",
        banner: { url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200", alt: "Festival stage with lights" },
        registration_url: "https://ananta-festival.org/register/keynote"
      }
    },
    {
      type_key: "events",
      slug: "ai-robotics-exhibition",
      sort_order: 2,
      status: "published",
      data: {
        title: "AI & Autonomous Robotics Exhibition",
        description: "<p>Explore breakthrough innovations in artificial intelligence, humanoid robotics, and autonomous systems built by student labs and industry partners.</p>",
        date: "2026-10-16",
        time: "10:30",
        venue: "Innovation Pavilion",
        banner: { url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200", alt: "Robotics exhibition" },
        registration_url: "https://ananta-festival.org/register/robotics"
      }
    },
    {
      type_key: "events",
      slug: "hackathon-grand-finale",
      sort_order: 3,
      status: "published",
      data: {
        title: "36-Hour National Hackathon Grand Finale",
        description: "<p>Top 30 finalist teams present their cutting-edge solutions to a panel of venture capitalists and senior tech leaders.</p>",
        date: "2026-10-17",
        time: "14:00",
        venue: "Auditorium Hall B",
        banner: { url: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200", alt: "Hackathon participants collaborating" },
        registration_url: "https://ananta-festival.org/register/hackathon"
      }
    },

    // Announcements
    {
      type_key: "announcements",
      slug: "registrations-now-open",
      sort_order: 1,
      status: "published",
      data: {
        title: "Registrations are officially open for Ananta 2026!",
        body: "<p>Reserve your festival passes and workshop seats early. Limited slots available for workshops and hackathons.</p>",
        pinned: true
      }
    },
    {
      type_key: "announcements",
      slug: "schedule-and-venue-guide-released",
      sort_order: 2,
      status: "published",
      data: {
        title: "Full Schedule & Campus Navigation Guide Released",
        body: "<p>Check out the daily track schedules and campus map to plan your visit across all 3 days.</p>",
        pinned: false
      }
    },

    // Schedule
    {
      type_key: "schedule",
      slug: "day-1-inauguration-and-tech",
      sort_order: 1,
      status: "published",
      data: {
        day: "Day 1 - Thursday, Oct 15",
        slots: [
          { time: "09:00", title: "Registration & Welcome Breakfast", location: "Central Plaza" },
          { time: "11:00", title: "Inaugural Ceremony & Lamp Lighting", location: "Main Auditorium" },
          { time: "14:00", title: "Tech Talks & Innovation Showcase", location: "Seminar Block 3" },
          { time: "18:00", title: "Cultural Night & Live Concert", location: "Grand Amphitheatre" }
        ]
      }
    },
    {
      type_key: "schedule",
      slug: "day-2-competitions-and-arts",
      sort_order: 2,
      status: "published",
      data: {
        day: "Day 2 - Friday, Oct 16",
        slots: [
          { time: "10:00", title: "AI & Robotics Expo Opens", location: "Innovation Pavilion" },
          { time: "12:00", title: "Design Sprint & Creative Labs", location: "Design Studio A" },
          { time: "15:00", title: "Panel: Future of Generative Technologies", location: "Main Auditorium" },
          { time: "19:00", title: "DJ Night & Starlight Social", location: "North Lawns" }
        ]
      }
    },

    // Coordinators
    {
      type_key: "coordinators",
      slug: "aarav-sharma",
      sort_order: 1,
      status: "published",
      data: {
        name: "Aarav Sharma",
        role: "Festival Convenor",
        photo: { url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400", alt: "Aarav Sharma portrait" },
        phone: "+91 98765 43210",
        email: "aarav.sharma@ananta.edu"
      }
    },
    {
      type_key: "coordinators",
      slug: "priya-patel",
      sort_order: 2,
      status: "published",
      data: {
        name: "Priya Patel",
        role: "Technical Lead",
        photo: { url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400", alt: "Priya Patel portrait" },
        phone: "+91 98765 43211",
        email: "priya.patel@ananta.edu"
      }
    },

    // FAQs
    {
      type_key: "faqs",
      slug: "who-can-attend",
      sort_order: 1,
      status: "published",
      data: {
        question: "Who can attend Ananta Festival?",
        answer: "<p>Ananta Festival is open to students, researchers, industry professionals, and creative enthusiasts from all institutions and organizations.</p>"
      }
    },
    {
      type_key: "faqs",
      slug: "is-entry-free",
      sort_order: 2,
      status: "published",
      data: {
        question: "Is admission to the festival free?",
        answer: "<p>General admission and exhibitions are free with a valid student or attendee badge. Specific workshops and the hackathon require pre-registration.</p>"
      }
    },

    // Pages
    {
      type_key: "pages",
      slug: "about",
      sort_order: 1,
      status: "published",
      data: {
        title: "About Ananta Festival",
        hero_image: { url: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200", alt: "Audience gathering" },
        body: "<p>Ananta is our annual flagship celebration bringing together over 10,000 innovators, creators, and leaders for three days of discovery, art, and technology.</p>"
      }
    }
  ];

  for (const item of items) {
    const { data: existing } = await supabase
      .from("content_items")
      .select("id")
      .eq("type_key", item.type_key)
      .eq("slug", item.slug)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("content_items").insert({
        type_key: item.type_key,
        slug: item.slug,
        sort_order: item.sort_order,
        status: item.status,
        draft_data: item.data,
        published_data: item.data,
        version: 1,
        has_unpublished_changes: false,
        is_deleted: false,
      });
      if (error) console.error(`Error inserting ${item.slug}:`, error);
      else console.log(`Inserted ${item.type_key}/${item.slug}`);
    } else {
      const { error } = await supabase
        .from("content_items")
        .update({
          draft_data: item.data,
          published_data: item.data,
          status: "published",
          has_unpublished_changes: false,
        })
        .eq("id", existing.id);
      if (error) console.error(`Error updating ${item.slug}:`, error);
      else console.log(`Updated ${item.type_key}/${item.slug}`);
    }
  }

  // Fetch current release count to bump version
  const { data: latestRelease } = await supabase
    .from("releases")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latestRelease?.version ?? 1) + 1;
  console.log(`Building release v${nextVersion}...`);

  // Fetch all content types
  const { data: contentTypes } = await supabase.from("content_types").select("*");
  const schema = {};
  for (const ct of contentTypes || []) {
    schema[ct.key] = {
      name: ct.name,
      is_singleton: ct.is_singleton,
      fields: ct.fields,
    };
  }

  // Fetch all published content items
  const { data: allItems } = await supabase
    .from("content_items")
    .select("*")
    .eq("is_deleted", false)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  const types = {};
  for (const ct of contentTypes || []) {
    types[ct.key] = [];
  }
  for (const item of allItems || []) {
    if (!types[item.type_key]) types[item.type_key] = [];
    types[item.type_key].push({
      id: item.id,
      slug: item.slug,
      sort_order: item.sort_order,
      data: item.published_data,
    });
  }

  const newReleaseId = crypto.randomUUID();
  const publishedAt = new Date().toISOString();
  const computedChecksum = checksum({ schema, types });

  const snapshotPayload = {
    release_id: newReleaseId,
    version: nextVersion,
    published_at: publishedAt,
    checksum: computedChecksum,
    schema,
    types,
  };

  const jsonBuffer = Buffer.from(JSON.stringify(snapshotPayload, null, 2), "utf-8");

  // Upload to Supabase Storage
  console.log("Uploading snapshot to Supabase Storage...");
  await supabase.storage
    .from("snapshots")
    .upload(`releases/${newReleaseId}/content.json`, jsonBuffer, {
      contentType: "application/json",
      upsert: true,
    });

  await supabase.storage
    .from("snapshots")
    .upload("latest/content.json", jsonBuffer, {
      contentType: "application/json",
      upsert: true,
    });

  // Record release
  await supabase.from("releases").insert({
    id: newReleaseId,
    version: nextVersion,
    checksum: computedChecksum,
    status: "published",
    created_by: null,
    storage_path: `releases/${newReleaseId}/content.json`,
  });

  console.log(`Release v${nextVersion} published successfully!`);
}

seed().catch(console.error);
