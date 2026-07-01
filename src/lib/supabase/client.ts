"use client";

import { createBrowserClient } from "@supabase/ssr";

/** 브라우저(클라이언트 컴포넌트)에서 사용하는 Supabase 클라이언트 (anon key) */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
