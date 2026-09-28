import type { User } from "@/types/batops";
import { initials } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

export function UserAvatar({
  user,
  className,
}: {
  user: Pick<User, "full_name" | "color_hex">;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: user.color_hex }}
    >
      {initials(user.full_name)}
    </span>
  );
}
