"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthProvider";

export default function AdminLoginPage() {
  const router = useRouter();
  const { openSignIn } = useAuth();

  useEffect(() => {
    openSignIn("admin");
    router.replace("/");
  }, [openSignIn, router]);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-sm text-zinc-600">
      Opening admin login...
    </main>
  );
}
