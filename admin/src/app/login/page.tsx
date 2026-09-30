"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Mail, Loader2, Sparkles } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        toast.error(error.message);
        return;
      }

      toast.success("Welcome back to Ananta CMS");
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/40 to-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Ananta CMS</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Headless content management & atomic release pipeline
          </p>
        </div>

        <Card className="border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the editorial dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {errorMsg && (
                <div
                  role="alert"
                  className="p-3 text-sm rounded-lg bg-destructive/15 text-destructive font-medium border border-destructive/20"
                >
                  {errorMsg}
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="staff@ananta.fest"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              {/* Demo Credentials Helper */}
              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Demo Admin Access</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail("admin_123@g.com");
                      setPassword("admin_123");
                    }}
                    className="text-primary hover:underline font-medium"
                  >
                    Fill Credentials
                  </button>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/60 border font-mono text-xs space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Email:</span>
                    <span className="text-foreground font-semibold select-all">admin_123@g.com</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Password:</span>
                    <span className="text-foreground font-semibold select-all">admin_123</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span>Role:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-sans font-medium">admin (Full Access)</span>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
