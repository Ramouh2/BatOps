import Link from "next/link";
import { BatopsMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <BatopsMark className="size-10" />
      <h1 className="mt-6 text-xl font-semibold text-slate-900">Page introuvable</h1>
      <p className="mt-1 text-sm text-muted-foreground">Cette adresse n&apos;existe pas dans BATOPS.</p>
      <Button asChild className="mt-6">
        <Link href="/">Revenir à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
