"use client";

import { useAdmin } from "@/components/admin/AdminShell";
import CalculadoraImportacao from "@/components/admin/CalculadoraImportacao";

export default function AdminPage() {
  useAdmin();

  return (
    <div className="max-w-xl mx-auto">
      <CalculadoraImportacao />
    </div>
  );
}
