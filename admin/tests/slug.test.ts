import { describe, it, expect } from "vitest";
import { toKebabCase, generateSlug, deduplicateSlug } from "@/lib/content/slug";
import type { Field } from "@/lib/content/types";

describe("Slug generation and de-duplication", () => {
  it("converts strings to lowercase kebab-case", () => {
    expect(toKebabCase("Hello World")).toBe("hello-world");
    expect(toKebabCase("  Special $&* Characters!! ")).toBe("special-characters");
    expect(toKebabCase("multiple---hyphens")).toBe("multiple-hyphens");
    expect(toKebabCase("")).toBe("item");
  });

  it("auto-generates slug from first required text field", () => {
    const fields: Field[] = [
      { name: "title", type: "text", required: true },
      { name: "description", type: "richtext" },
    ];

    const slug = generateSlug({ title: "Grand Opening Ceremony" }, fields);
    expect(slug).toBe("grand-opening-ceremony");
  });

  it("auto-generates slug from common fields like day or question", () => {
    const scheduleFields: Field[] = [
      { name: "day", type: "text", required: true },
    ];
    expect(generateSlug({ day: "Day 1 - Inauguration" }, scheduleFields)).toBe(
      "day-1-inauguration"
    );

    const faqFields: Field[] = [
      { name: "question", type: "text", required: true },
    ];
    expect(generateSlug({ question: "How to register?" }, faqFields)).toBe(
      "how-to-register"
    );
  });

  it("de-duplicates slugs with -2, -3 increments", () => {
    const existing = ["hackathon", "hackathon-2", "hackathon-3"];

    // Base slug not present
    expect(deduplicateSlug("workshop", existing)).toBe("workshop");

    // Base slug present -> next should be -4
    expect(deduplicateSlug("hackathon", existing)).toBe("hackathon-4");

    // Only base present
    expect(deduplicateSlug("code-quest", ["code-quest"])).toBe("code-quest-2");
  });
});
