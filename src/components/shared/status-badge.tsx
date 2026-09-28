import { Badge } from "@/components/ui/badge";
import type { StatusMeta } from "@/lib/domain/labels";

/** Badge de statut standardisé : `<StatusBadge meta={QUOTE_STATUS[status]} />`. */
export function StatusBadge({ meta, className }: { meta: StatusMeta; className?: string }) {
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
