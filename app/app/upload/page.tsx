
export const dynamic = "force-dynamic";

export default function UploadPage() {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Upload</h2>
      <p>
        Hier kommt dein flexibler Hersteller-Import rein (Excel/CSV),
        inkl. Anzeige „welche Hersteller importiert“ und Entfernen-Funktion.
      </p>

      <p style={{ opacity: 0.8 }}>
        Wenn du hier schon deinen bestehenden Upload-Wizard hast: verdrahte ihn
        in diese Seite oder ersetze diese Seite durch deinen Wizard.
      </p>
    </div>
  );
}
