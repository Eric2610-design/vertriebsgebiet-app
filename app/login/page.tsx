import { loginPassword, sendMagicLink } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string; sent?: string };
}) {
  const next = searchParams?.next || "/app";
  const error = searchParams?.error;
  const sent = searchParams?.sent === "1";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="text-sm text-gray-600">Bitte einloggen, um fortzufahren.</p>
      </div>

      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {sent ? (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Magic-Link wurde gesendet. Bitte Postfach prüfen.
        </div>
      ) : null}

      <form className="rounded-lg border p-4">
        <input type="hidden" name="next" value={next} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">E-Mail</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded border px-3 py-2"
              placeholder="name@firma.de"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Passwort</label>
            <input
              name="password"
              type="password"
              className="w-full rounded border px-3 py-2"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            formAction={loginPassword}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Einloggen
          </button>

          <button
            formAction={sendMagicLink}
            className="rounded border px-4 py-2"
          >
            Wechsel: Magic-Link
          </button>
        </div>
      </form>
    </div>
  );
}
