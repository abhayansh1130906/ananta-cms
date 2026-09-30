"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser, useOverview } from "@/lib/query";
import { useTheme } from "@/components/theme-provider";
import { PublishModal } from "@/components/publish/publish-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sun,
  Moon,
  Laptop,
  LogOut,
  User,
  Send,
  Menu,
  ShieldCheck,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

interface TopbarProps {
  onToggleSidebar?: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: overview } = useOverview({ refetchInterval: 10000 });
  const { theme, setTheme } = useTheme();
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const supabase = createClient();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      router.push("/login");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error signing out";
      toast.error(msg);
    }
  };

  const pendingCount = overview?.pending_changes ?? 0;
  const liveVersion = overview?.live_version;

  return (
    <header className="h-16 border-b bg-card/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onToggleSidebar}
            aria-label="Toggle Navigation Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        {/* LIVE Version Badge */}
        <div className="flex items-center gap-2">
          <Badge
            variant={liveVersion ? "outline" : "secondary"}
            className="flex items-center gap-1.5 py-1 px-2.5 font-mono text-xs shadow-2xs border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>LIVE: {liveVersion ? `v${liveVersion}` : "None"}</span>
          </Badge>

          {overview?.active_release && (
            <Badge variant="secondary" className="animate-pulse text-[11px] hidden sm:inline-flex">
              Building v{overview.active_release.version}...
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Publish Button */}
        <Button
          onClick={() => setPublishModalOpen(true)}
          size="sm"
          className="relative gap-1.5 font-medium shadow-sm"
        >
          <Send className="h-4 w-4" />
          <span>Publish</span>
          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[11px] font-semibold bg-primary-foreground text-primary">
              {pendingCount}
            </span>
          )}
        </Button>

        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Toggle theme">
              {!mounted ? (
                <Laptop className="h-4 w-4" />
              ) : theme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : theme === "light" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Laptop className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
              <Sun className="h-4 w-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
              <Moon className="h-4 w-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
              <Laptop className="h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2 pr-3 h-9" aria-label="User menu">
              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs border">
                {user?.full_name ? user.full_name[0].toUpperCase() : <User className="h-3.5 w-3.5" />}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-medium leading-none truncate max-w-[120px]">
                  {user?.full_name || user?.email?.split("@")[0] || "Staff User"}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.full_name || "Staff Member"}</p>
                <p className="text-xs leading-none text-muted-foreground truncate">{user?.email}</p>
                <div className="pt-1">
                  <Badge
                    variant={user?.role === "admin" ? "default" : "secondary"}
                    className="text-[10px] uppercase font-semibold tracking-wider"
                  >
                    {user?.role === "admin" ? (
                      <ShieldCheck className="h-3 w-3 mr-1 inline" />
                    ) : (
                      <Shield className="h-3 w-3 mr-1 inline" />
                    )}
                    {user?.role || "editor"}
                  </Badge>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive gap-2 cursor-pointer">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PublishModal open={publishModalOpen} onOpenChange={setPublishModalOpen} />
    </header>
  );
}
