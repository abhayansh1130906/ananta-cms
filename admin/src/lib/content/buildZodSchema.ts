import { z } from "zod";
import type { Field } from "./types";
import { isValidImageUrl, isValidHttpsUrl } from "./sanitize";

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_TEXT_LENGTH = 5000;
export const MAX_RICHTEXT_LENGTH = 100000;
export const MAX_URL_LENGTH = 2048;
export const MAX_LIST_ITEMS = 500;

/**
 * Builds a runtime Zod schema for a single field definition with strict bounds.
 */
export function buildFieldSchema(field: Field, mediaBaseUrl?: string): z.ZodTypeAny {
  const isReq = field.required === true;
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case "text": {
      schema = isReq
        ? z
            .string({ message: `${field.label || field.name} is required` })
            .min(1, `${field.label || field.name} cannot be empty`)
            .max(MAX_TEXT_LENGTH, `${field.label || field.name} exceeds max length of ${MAX_TEXT_LENGTH}`)
        : z
            .string()
            .max(MAX_TEXT_LENGTH, `${field.label || field.name} exceeds max length of ${MAX_TEXT_LENGTH}`)
            .optional()
            .nullable();
      break;
    }

    case "richtext": {
      schema = isReq
        ? z
            .string({ message: `${field.label || field.name} is required` })
            .min(1, `${field.label || field.name} cannot be empty`)
            .max(MAX_RICHTEXT_LENGTH, `${field.label || field.name} exceeds max length of ${MAX_RICHTEXT_LENGTH}`)
        : z
            .string()
            .max(MAX_RICHTEXT_LENGTH, `${field.label || field.name} exceeds max length of ${MAX_RICHTEXT_LENGTH}`)
            .optional()
            .nullable();
      break;
    }

    case "number": {
      schema = isReq
        ? z.number({ message: `${field.label || field.name} must be a number` })
        : z.number().optional().nullable();
      break;
    }

    case "boolean": {
      schema = isReq ? z.boolean() : z.boolean().optional().nullable();
      break;
    }

    case "date": {
      const dateSchema = z.string().regex(DATE_REGEX, "Invalid date format, expected YYYY-MM-DD");
      schema = isReq
        ? dateSchema
        : z.union([dateSchema, z.literal("")]).optional().nullable();
      break;
    }

    case "time": {
      const timeSchema = z.string().regex(TIME_REGEX, "Invalid time format, expected HH:mm (24h)");
      schema = isReq
        ? timeSchema
        : z.union([timeSchema, z.literal("")]).optional().nullable();
      break;
    }

    case "datetime": {
      const dtSchema = z.string().regex(
        DATETIME_REGEX,
        "Invalid datetime format, expected YYYY-MM-DDTHH:mm"
      );
      schema = isReq
        ? dtSchema
        : z.union([dtSchema, z.literal("")]).optional().nullable();
      break;
    }

    case "url": {
      const urlSchema = z
        .string()
        .max(MAX_URL_LENGTH, "URL exceeds maximum allowed length")
        .refine((val) => isValidHttpsUrl(val), {
          message: "URL must be a valid HTTPS URL (https://...)",
        });
      schema = isReq
        ? urlSchema
        : z.union([urlSchema, z.literal("")]).optional().nullable();
      break;
    }

    case "select": {
      const options = field.options || [];
      const selectSchema = z
        .string()
        .max(255, "Select option exceeds max length")
        .refine((val) => (options.length > 0 ? options.includes(val) : true), {
          message: `Value must be one of: ${options.join(", ")}`,
        });
      schema = isReq
        ? selectSchema
        : z.union([selectSchema, z.literal("")]).optional().nullable();
      break;
    }

    case "image": {
      const imageInner = z.object({
        url: z
          .string()
          .min(1, "Image URL is required")
          .max(MAX_URL_LENGTH, "Image URL exceeds max length")
          .refine((url) => isValidImageUrl(url, mediaBaseUrl), {
            message:
              "Image URL must start with this project's storage public URL for the media bucket",
          }),
        alt: z.string().max(500, "Alt text exceeds max length").optional().nullable(),
      });

      schema = isReq ? imageInner : imageInner.optional().nullable();
      break;
    }

    case "list": {
      const itemSchema = field.of && field.of.length > 0
        ? buildZodSchema(field.of, mediaBaseUrl)
        : z.record(z.string(), z.unknown());

      const arraySchema = z.array(itemSchema).max(MAX_LIST_ITEMS, `List cannot exceed ${MAX_LIST_ITEMS} items`);
      schema = isReq ? arraySchema : arraySchema.optional().nullable();
      break;
    }

    case "group": {
      const groupSchema = field.of && field.of.length > 0
        ? buildZodSchema(field.of, mediaBaseUrl)
        : z.record(z.string(), z.unknown());

      schema = isReq ? groupSchema : groupSchema.optional().nullable();
      break;
    }

    default:
      schema = z.unknown();
      break;
  }

  return schema;
}

/**
 * Builds a runtime Zod schema for an array of Field definitions.
 * Unknown extra keys are stripped according to CMS contract.
 */
export function buildZodSchema(
  fields: Field[],
  mediaBaseUrl?: string
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    shape[field.name] = buildFieldSchema(field, mediaBaseUrl);
  }

  return z.object(shape).strip();
}
