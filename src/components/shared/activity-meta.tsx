import {
  BanknoteIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CameraIcon,
  CircleCheckBigIcon,
  FilePenLineIcon,
  FileSignatureIcon,
  FileTextIcon,
  FileXIcon,
  HardDriveIcon,
  PackageMinusIcon,
  PackagePlusIcon,
  PencilLineIcon,
  PhoneIncomingIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
  StickyNoteIcon,
  UserCheckIcon,
  UserPlusIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType } from "@/types/batops";
import { cn } from "@/lib/utils";

const META: Record<ActivityType, { icon: LucideIcon; tint: string }> = {
  call: { icon: PhoneIncomingIcon, tint: "bg-amber-50 text-amber-700 ring-amber-200" },
  client_created: { icon: UserPlusIcon, tint: "bg-blue-50 text-blue-700 ring-blue-200" },
  client_updated: { icon: PencilLineIcon, tint: "bg-slate-100 text-slate-600 ring-slate-200" },
  client_converted: { icon: UserCheckIcon, tint: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  quote_created: { icon: FileTextIcon, tint: "bg-slate-100 text-slate-600 ring-slate-200" },
  quote_sent: { icon: SendIcon, tint: "bg-blue-50 text-blue-700 ring-blue-200" },
  quote_reminder: { icon: BellRingIcon, tint: "bg-amber-50 text-amber-700 ring-amber-200" },
  quote_signed: { icon: FileSignatureIcon, tint: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  quote_refused: { icon: FileXIcon, tint: "bg-rose-50 text-rose-700 ring-rose-200" },
  intervention_created: { icon: WrenchIcon, tint: "bg-slate-100 text-slate-600 ring-slate-200" },
  intervention_scheduled: { icon: CalendarCheckIcon, tint: "bg-blue-50 text-blue-700 ring-blue-200" },
  intervention_status: { icon: RefreshCwIcon, tint: "bg-blue-50 text-blue-700 ring-blue-200" },
  intervention_completed: { icon: CircleCheckBigIcon, tint: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  photos_added: { icon: CameraIcon, tint: "bg-slate-100 text-slate-600 ring-slate-200" },
  report_sent: { icon: FilePenLineIcon, tint: "bg-blue-50 text-blue-700 ring-blue-200" },
  invoice_issued: { icon: ReceiptTextIcon, tint: "bg-slate-100 text-slate-600 ring-slate-200" },
  payment_received: { icon: BanknoteIcon, tint: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  equipment_added: { icon: PackagePlusIcon, tint: "bg-blue-50 text-blue-700 ring-blue-200" },
  equipment_updated: { icon: HardDriveIcon, tint: "bg-slate-100 text-slate-600 ring-slate-200" },
  equipment_removed: { icon: PackageMinusIcon, tint: "bg-slate-100 text-slate-600 ring-slate-200" },
  contract_created: { icon: ShieldCheckIcon, tint: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  note: { icon: StickyNoteIcon, tint: "bg-amber-50 text-amber-700 ring-amber-200" },
};

/** Pastille d'icône d'un événement de timeline. */
export function ActivityIcon({ type, className }: { type: ActivityType; className?: string }) {
  const { icon: Icon, tint } = META[type];
  return (
    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full ring-1", tint, className)}>
      <Icon className="size-3.5" strokeWidth={2} />
    </span>
  );
}
