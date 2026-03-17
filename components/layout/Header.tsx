"use client";

import { useState } from "react";
import { PermissionToggle } from "./PermissionToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PasswordChangeModal } from "./PasswordChangeModal";
import { logout } from "@/app/login/actions";
import { usePermission } from "@/contexts/PermissionContext";
import { LogOut, KeyRound } from "lucide-react";

function getInitial(name: string): string {
  if (!name) return "?";
  const first = name[0];
  const hangul = name.charCodeAt(0);
  if (hangul >= 0xac00 && hangul <= 0xd7a3) return first;
  return name.slice(0, 2).toUpperCase();
}

export function Header() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const { currentUserName } = usePermission();

  async function handleSignOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/40 bg-white/80 px-8 backdrop-blur-xl">
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <PermissionToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                suppressHydrationWarning
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
                aria-label="프로필 메뉴"
              >
                {getInitial(currentUserName)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuItem onClick={() => setPasswordModalOpen(true)}>
                <KeyRound className="size-4" />
                비밀번호 변경
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="size-4" />
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <PasswordChangeModal open={passwordModalOpen} onOpenChange={setPasswordModalOpen} />
    </>
  );
}
