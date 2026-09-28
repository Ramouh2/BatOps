import { AirVentIcon, BoxIcon, DropletsIcon, FanIcon, FlameIcon, HeaterIcon, ThermometerSunIcon, ZapIcon, type LucideIcon } from "lucide-react";
import type { EquipmentCategory } from "@/types/batops";
import { cn } from "@/lib/utils";

const ICONS: Record<EquipmentCategory, LucideIcon> = {
  climatisation: AirVentIcon,
  pac_air_eau: HeaterIcon,
  pac_air_air: ThermometerSunIcon,
  chaudiere: FlameIcon,
  ballon_ecs: DropletsIcon,
  vmc: FanIcon,
  tableau_elec: ZapIcon,
  autre: BoxIcon,
};

export function EquipmentIcon({ category, className }: { category: EquipmentCategory; className?: string }) {
  const Icon = ICONS[category];
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600", className)}>
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}
