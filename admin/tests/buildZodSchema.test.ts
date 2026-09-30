import { describe, it, expect } from "vitest";
import { buildZodSchema } from "@/lib/content/buildZodSchema";
import type { Field } from "@/lib/content/types";

describe("buildZodSchema", () => {
  const mediaBaseUrl = "https://example.supabase.co/storage/v1/object/public/media";

  it("validates text and richtext fields (required vs optional)", () => {
    const fields: Field[] = [
      { name: "title", type: "text", required: true },
      { name: "summary", type: "text" },
      { name: "body", type: "richtext", required: true },
    ];

    const schema = buildZodSchema(fields, mediaBaseUrl);

    // Valid data
    const valid = schema.parse({
      title: "My Title",
      summary: "Short summary",
      body: "<p>Hello</p>",
    });
    expect(valid.title).toBe("My Title");

    // Rejects empty required text
    expect(() =>
      schema.parse({
        title: "",
        body: "<p>Hello</p>",
      })
    ).toThrow();

    // Rejects missing required field
    expect(() =>
      schema.parse({
        summary: "Optional summary",
      })
    ).toThrow();
  });

  it("validates number and boolean fields", () => {
    const fields: Field[] = [
      { name: "price", type: "number", required: true },
      { name: "discount", type: "number" },
      { name: "featured", type: "boolean" },
    ];

    const schema = buildZodSchema(fields, mediaBaseUrl);

    const valid = schema.parse({
      price: 19.99,
      featured: true,
    });
    expect(valid.price).toBe(19.99);
    expect(valid.featured).toBe(true);

    expect(() => schema.parse({ price: "not-a-number" })).toThrow();
  });

  it("validates date, time, and datetime formats without timezone conversion", () => {
    const fields: Field[] = [
      { name: "event_date", type: "date", required: true },
      { name: "start_time", type: "time", required: true },
      { name: "published_at", type: "datetime", required: true },
    ];

    const schema = buildZodSchema(fields, mediaBaseUrl);

    const valid = schema.parse({
      event_date: "2026-10-15",
      start_time: "14:30",
      published_at: "2026-10-15T14:30",
    });
    expect(valid.event_date).toBe("2026-10-15");
    expect(valid.start_time).toBe("14:30");
    expect(valid.published_at).toBe("2026-10-15T14:30");

    // Invalid date
    expect(() =>
      schema.parse({
        event_date: "15-10-2026",
        start_time: "14:30",
        published_at: "2026-10-15T14:30",
      })
    ).toThrow();

    // Invalid time (hour > 23)
    expect(() =>
      schema.parse({
        event_date: "2026-10-15",
        start_time: "25:00",
        published_at: "2026-10-15T14:30",
      })
    ).toThrow();
  });

  it("validates url and image fields with strict security rules", () => {
    const fields: Field[] = [
      { name: "website", type: "url", required: true },
      { name: "banner", type: "image", required: true },
    ];

    const schema = buildZodSchema(fields, mediaBaseUrl);

    // Valid https URL and valid media bucket image
    const valid = schema.parse({
      website: "https://ananta.fest/2026",
      banner: {
        url: `${mediaBaseUrl}/2026/banner.png`,
        alt: "Fest Banner",
      },
    });
    expect(valid.website).toBe("https://ananta.fest/2026");

    // Rejects non-https URL
    expect(() =>
      schema.parse({
        website: "http://insecure.com",
        banner: { url: `${mediaBaseUrl}/2026/banner.png` },
      })
    ).toThrow();

    // Rejects image not hosted on project media bucket
    expect(() =>
      schema.parse({
        website: "https://ananta.fest",
        banner: { url: "https://external-domain.com/evil.png" },
      })
    ).toThrow();
  });

  it("validates select field options", () => {
    const fields: Field[] = [
      {
        name: "category",
        type: "select",
        required: true,
        options: ["workshop", "competition", "talk"],
      },
    ];

    const schema = buildZodSchema(fields, mediaBaseUrl);

    expect(schema.parse({ category: "workshop" }).category).toBe("workshop");
    expect(() => schema.parse({ category: "invalid-category" })).toThrow();
  });

  it("validates list and group fields shaped by 'of'", () => {
    const fields: Field[] = [
      {
        name: "schedule",
        type: "list",
        of: [
          { name: "time", type: "time", required: true },
          { name: "title", type: "text", required: true },
        ],
      },
      {
        name: "meta",
        type: "group",
        of: [
          { name: "author", type: "text", required: true },
          { name: "version", type: "number" },
        ],
      },
    ];

    const schema = buildZodSchema(fields, mediaBaseUrl);

    const valid = schema.parse({
      schedule: [
        { time: "09:00", title: "Keynote" },
        { time: "11:30", title: "Workshop" },
      ],
      meta: {
        author: "Admin Team",
        version: 1,
      },
    });

    expect(valid.schedule).toHaveLength(2);
    expect((valid.meta as any).author).toBe("Admin Team");

    // Rejects invalid list item time
    expect(() =>
      schema.parse({
        schedule: [{ time: "invalid-time", title: "Keynote" }],
        meta: { author: "Admin" },
      })
    ).toThrow();
  });

  it("strips unknown extra keys", () => {
    const fields: Field[] = [
      { name: "name", type: "text", required: true },
    ];

    const schema = buildZodSchema(fields, mediaBaseUrl);
    const parsed = schema.parse({
      name: "Valid Name",
      unknown_hacker_key: "should be stripped",
      another_extra: 12345,
    });

    expect(parsed).toEqual({ name: "Valid Name" });
    expect((parsed as any).unknown_hacker_key).toBeUndefined();
  });
});
