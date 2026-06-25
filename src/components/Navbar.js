"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // Don't show navbar on landing page
  if (pathname === "/") return null;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[var(--bg-primary)]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
            <svg
              className="w-4 h-4 text-black"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <span className="text-lg font-bold text-white group-hover:opacity-80 transition-opacity">
            JobConnect
          </span>
        </Link>

        {/* Nav Links */}
        <div className="hidden sm:flex items-center gap-1">
          <Link
            href="/dashboard"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/dashboard"
                ? "text-white bg-white/[0.08]"
                : "text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/analyze"
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/analyze"
                ? "text-white bg-white/[0.08]"
                : "text-[var(--text-secondary)] hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            Analyze
          </Link>
        </div>

        {/* User Section */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-white leading-tight">
                {user.displayName}
              </span>
              <span className="text-xs text-[var(--text-muted)] leading-tight">
                {user.email}
              </span>
            </div>
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-8 h-8 rounded-full ring-2 ring-white/10"
                referrerPolicy="no-referrer"
              />
            )}
            <button
              onClick={logout}
              id="logout-btn"
              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] 
                         border border-white/[0.08] hover:text-red-400 hover:border-red-400/30 
                         hover:bg-red-400/[0.06] transition-all cursor-pointer"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
