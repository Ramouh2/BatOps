import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FieldShell } from "@/components/layout/field-shell";

export const metadata: Metadata = { title: "App technicien" };

export default function FieldLayout({ children }: { children: ReactNode }) {
  return <FieldShell>{children}</FieldShell>;
}
