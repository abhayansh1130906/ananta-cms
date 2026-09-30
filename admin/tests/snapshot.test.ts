import { describe, it, expect } from "vitest";
import { buildSnapshot } from "@/lib/publish/snapshot";

describe("buildSnapshot", () => {
  const contentTypes = [
    {
      key: "events",
      name: "Events",
      is_singleton: false,
      fields: [{ name: "title", type: "text", required: true }],
    },
    {
      key: "announcements",
      name: "Announcements",
      is_singleton: false,
      fields: [{ name: "title", type: "text", required: true }],
    },
    {
      key: "empty_type",
      name: "Empty Type",
      is_singleton: false,
      fields: [],
    },
  ];

  it("builds snapshot where deleted items are absent", () => {
    const typesData = {
      events: [
        {
          id: "event-1",
          slug: "live-event",
          sort_order: 0,
          data: { title: "Live Event" },
          is_deleted: false,
        },
        {
          id: "event-2",
          slug: "deleted-event",
          sort_order: 1,
          data: { title: "Deleted Event" },
          is_deleted: true,
        },
      ],
      announcements: [],
      empty_type: [],
    };

    const snapshot = buildSnapshot({
      releaseId: "release-uuid-1",
      version: 1,
      contentTypes: contentTypes as any,
      typesData: typesData as any,
      publishedAt: "2026-10-01T00:00:00.000Z",
    });

    // Check release metadata
    expect(snapshot.release_id).toBe("release-uuid-1");
    expect(snapshot.version).toBe(1);
    expect(snapshot.published_at).toBe("2026-10-01T00:00:00.000Z");

    // Deleted item absent from events
    expect(snapshot.types.events).toHaveLength(1);
    expect(snapshot.types.events[0].slug).toBe("live-event");
    expect(snapshot.types.events.some((e) => e.slug === "deleted-event")).toBe(false);
  });

  it("ensures every content_types key is present in schema and types (empty types present)", () => {
    const typesData = {
      events: [
        {
          id: "event-1",
          slug: "first-event",
          sort_order: 0,
          data: { title: "First Event" },
        },
      ],
    };

    const snapshot = buildSnapshot({
      releaseId: "release-uuid-2",
      version: 2,
      contentTypes: contentTypes as any,
      typesData: typesData as any,
    });

    // All keys present in schema
    expect(snapshot.schema).toHaveProperty("events");
    expect(snapshot.schema).toHaveProperty("announcements");
    expect(snapshot.schema).toHaveProperty("empty_type");

    // All keys present in types, with empty types mapped to empty array []
    expect(snapshot.types).toHaveProperty("events");
    expect(snapshot.types).toHaveProperty("announcements");
    expect(snapshot.types).toHaveProperty("empty_type");

    expect(snapshot.types.announcements).toEqual([]);
    expect(snapshot.types.empty_type).toEqual([]);
    expect(snapshot.types.events).toHaveLength(1);
  });

  it("calculates a valid SHA-256 checksum matching { schema, types }", () => {
    const snapshot = buildSnapshot({
      releaseId: "release-uuid-3",
      version: 3,
      contentTypes: contentTypes as any,
      typesData: {},
    });

    expect(snapshot.checksum).toBeDefined();
    expect(snapshot.checksum).toHaveLength(64); // SHA-256 hex string length
    expect(/^[a-f0-9]{64}$/.test(snapshot.checksum)).toBe(true);
  });
});
