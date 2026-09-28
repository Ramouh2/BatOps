import { Building2Icon, BuildingIcon } from "lucide-react";
import type { Client } from "@/types/batops";
import { clientDisplayName } from "@/lib/domain/clients";
import { initials } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const TYPE_STYLE: Record<Client["type"], string> = {
  particulier: "bg-blue-50 text-blue-700 ring-blue-200",
  professionnel: "bg-violet-50 text-violet-700 ring-violet-200",
  syndic: "bg-teal-50 text-teal-700 ring-teal-200",
};

/** Pastille client : initiales (particulier) ou pictogramme (pro / syndic), teinte selon le type. */
export function ClientAvatar({ client, className }: { client: Pick<Client, "type" | "company_name" | "civility" | "first_name" | "last_name">; className?: string }) {
  const Icon = client.type === "syndic" ? Building2Icon : BuildingIcon;
  const name = client.type === "particulier" ? [client.first_name, client.last_name].filter(Boolean).join(" ") : clientDisplayName(client);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ring-1", TYPE_STYLE[client.type], className)}
    >
      {client.type === "particulier" ? initials(name) : <Icon className="size-4" strokeWidth={1.75} />}
    </span>
  );
}
