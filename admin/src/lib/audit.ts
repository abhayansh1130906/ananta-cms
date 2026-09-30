import { createAdminClient } from "./supabase/admin";
import type { Json } from "@/types/database";

export interface AuditLogParams {
  actor: string | null;
  action: "create" | "update" | "delete" | "publish" | "rollback" | "retry" | string;
  entity: string;
  entityId?: string | null;
  diff?: Json | null;
}

export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_log").insert({
      actor: params.actor,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ?? null,
      diff: params.diff ?? null,
    });

    if (error) {
      console.error("[AuditLog Error]", error);
    }
  } catch (err) {
    console.error("[AuditLog Exception]", err);
  }
}
