"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const ProfileSettings = lazy(() => import("./profile-settings").then(module => ({ default: module.ProfileSettings })));

export function LazyProfileSettings(props: ComponentProps<typeof ProfileSettings>) {
  return <Suspense fallback={<p role="status">Đang mở cài đặt…</p>}><ProfileSettings {...props} /></Suspense>;
}
