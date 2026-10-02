export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json } from "@/lib/http";
import { requireRole } from "@/lib/auth/requireRole";

export const GET = withHandler(async () => {
  const { user, profile } = await requireRole(["editor", "admin", "super_admin"]);

  return json({
    id: user.id,
    email: user.email,
    full_name: profile.full_name,
    role: profile.role,
  });
});
