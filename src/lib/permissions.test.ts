import { describe, expect, it } from "vitest";
import { can, canAccessPath, ROLE_HOME } from "./permissions";
import { navSectionsFor } from "./navigation";

describe("rôles & permissions", () => {
  it("donne tout au dirigeant", () => {
    for (const path of ["/dashboard", "/quotes/new", "/invoices", "/settings", "/catalog", "/tech"]) {
      expect(canAccessPath("owner", path)).toBe(true);
    }
    expect(can("owner", "view_margins")).toBe(true);
  });

  it("prive la secrétaire des marges et des paramètres", () => {
    expect(canAccessPath("dispatcher", "/planning")).toBe(true);
    expect(canAccessPath("dispatcher", "/invoices")).toBe(true);
    expect(canAccessPath("dispatcher", "/settings")).toBe(false);
    expect(can("dispatcher", "view_margins")).toBe(false);
  });

  it("limite le technicien à l'app terrain, sans aucune donnée financière", () => {
    for (const path of ["/dashboard", "/quotes", "/invoices", "/catalog", "/settings", "/clients"]) {
      expect(canAccessPath("technician", path)).toBe(false);
    }
    expect(canAccessPath("technician", "/tech")).toBe(true);
    expect(canAccessPath("technician", "/tech/jobs/int_martin")).toBe(true);
    expect(can("technician", "view_financials")).toBe(false);
    expect(ROLE_HOME.technician).toBe("/tech");
  });

  it("donne au comptable la lecture seule des devis et factures", () => {
    expect(canAccessPath("accountant", "/invoices")).toBe(true);
    expect(canAccessPath("accountant", "/quotes")).toBe(true);
    expect(canAccessPath("accountant", "/planning")).toBe(false);
    expect(can("accountant", "manage_invoices")).toBe(false);
    expect(can("accountant", "manage_quotes")).toBe(false);
  });

  it("laisse publiques les routes portail et connexion", () => {
    expect(canAccessPath("technician", "/portal/ptk_x")).toBe(true);
    expect(canAccessPath("accountant", "/login")).toBe(true);
  });

  it("filtre la navigation par rôle", () => {
    const labels = (role: Parameters<typeof navSectionsFor>[0]) => navSectionsFor(role).flatMap((s) => s.items.map((i) => i.href));
    expect(labels("technician")).toEqual([]);
    expect(labels("accountant")).toEqual(["/quotes", "/invoices"]);
    expect(labels("dispatcher")).not.toContain("/settings");
    expect(labels("owner")).toContain("/settings");
  });
});
