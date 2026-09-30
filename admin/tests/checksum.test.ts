import { describe, it, expect } from "vitest";
import { stableStringify, checksum, sha256Hex } from "@/lib/publish/checksum";

describe("stableStringify and checksum", () => {
  it("serializes objects deterministically with sorted keys", () => {
    const obj1 = { b: 2, a: 1, c: 3 };
    const obj2 = { a: 1, c: 3, b: 2 };

    expect(stableStringify(obj1)).toBe('{"a":1,"b":2,"c":3}');
    expect(stableStringify(obj1)).toBe(stableStringify(obj2));
  });

  it("handles deeply nested structures with shuffled keys", () => {
    const complex1 = {
      types: {
        events: [
          { id: "1", slug: "hackathon", data: { title: "Hackathon", venue: "Hall A" } },
          { id: "2", slug: "code-quest", data: { time: "10:00", day: "Friday" } },
        ],
        pages: [],
      },
      schema: {
        events: { name: "Events", is_singleton: false, fields: [] },
        pages: { name: "Pages", is_singleton: false, fields: [] },
      },
    };

    const complex2 = {
      schema: {
        pages: { is_singleton: false, fields: [], name: "Pages" },
        events: { fields: [], is_singleton: false, name: "Events" },
      },
      types: {
        pages: [],
        events: [
          { slug: "hackathon", data: { venue: "Hall A", title: "Hackathon" }, id: "1" },
          { data: { day: "Friday", time: "10:00" }, id: "2", slug: "code-quest" },
        ],
      },
    };

    const str1 = stableStringify(complex1);
    const str2 = stableStringify(complex2);

    expect(str1).toBe(str2);
    expect(checksum(complex1)).toBe(checksum(complex2));
  });

  it("produces standard SHA-256 hex checksums", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(sha256Hex("hello world")).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });

  it("maintains checksum stability regardless of property insertion order", () => {
    const iterations = 50;
    const baseKeys = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];

    const hashes = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      // Shuffle keys randomly
      const shuffled = [...baseKeys].sort(() => Math.random() - 0.5);
      const obj: Record<string, any> = {};
      for (const k of shuffled) {
        obj[k] = {
          nested_b: 2,
          nested_a: 1,
          array: [{ y: 2, x: 1 }],
        };
      }
      hashes.add(checksum(obj));
    }

    // All 50 shuffled objects must yield the exact same hash
    expect(hashes.size).toBe(1);
  });
});
