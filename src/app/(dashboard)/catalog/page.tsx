import type { Metadata } from "next";
import { CatalogView } from "./catalog-view";

export const metadata: Metadata = { title: "Catalogue & tarifs" };

export default function CatalogPage() {
  return <CatalogView />;
}
