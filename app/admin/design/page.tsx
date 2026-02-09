"use client";

import RequireRole from "@/components/RequireRole";
import { Card, CardContent, CardHeader, Input, Button } from "@/components/ui";

export default function DesignSettingsPage() {
  return (
    <RequireRole allow={["admin", "superadmin"]}>
      <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Seitendesign</h1>
          <p className="text-sm text-slate-600">Platzhalter für spätere Design- und Branding-Einstellungen.</p>
        </div>

        <Card>
          <CardHeader className="text-sm font-semibold">Branding</CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Primärfarbe</div>
                <Input placeholder="#000000" disabled />
              </div>
              <div>
                <div className="text-xs text-slate-500">Akzentfarbe</div>
                <Input placeholder="#2563eb" disabled />
              </div>
            </div>
            <Button variant="secondary" disabled>
              Speichern (folgt)
            </Button>
          </CardContent>
        </Card>
      </main>
    </RequireRole>
  );
}
