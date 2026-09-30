export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { withHandler, json, error } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export const GET = withHandler(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return error("Authentication required", "UNAUTHORIZED", 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return error("Profile not found", "NOT_FOUND", 404);
  }

  return json({
    id: user.id,
    email: user.email,
    full_name: profile.full_name,
    role: profile.role,
  });
});
