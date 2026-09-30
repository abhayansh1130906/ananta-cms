/**
 * Triggers the DEPLOY_HOOK_URL if configured.
 * Does not crash if env is missing or a placeholder.
 */
export async function triggerDeployHook(): Promise<{
  triggered: boolean;
  warning?: string;
}> {
  const hookUrl = process.env.DEPLOY_HOOK_URL?.trim();

  if (
    !hookUrl ||
    hookUrl.startsWith("<") ||
    hookUrl.includes("placeholder") ||
    hookUrl === "add later"
  ) {
    const warning = "DEPLOY_HOOK_URL is not configured or placeholder";
    console.warn(`[DeployHook Warning] ${warning}: ${hookUrl}`);
    return { triggered: false, warning };
  }

  try {
    const res = await fetch(hookUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Ananta-CMS-Publisher/1.0",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Deploy hook returned HTTP ${res.status}: ${errorText}`);
    }

    return { triggered: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[DeployHook Error]", err);
    throw new Error(`Deploy hook call failed: ${errorMsg}`);
  }
}
