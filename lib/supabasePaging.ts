export type SupabasePageResult<T> = { data: T[] | null; error: any };

/**
 * Fetches rows in pages using PostgREST ranges.
 *
 * Motivation: Supabase/PostgREST often caps responses (commonly at 1000 rows).
 * Even if you use `.limit()`, you can still hit that server-side cap.
 * With `.range(from, to)` you can safely page through.
 */
export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => Promise<SupabasePageResult<T>>,
  opts?: { pageSize?: number; maxRows?: number }
): Promise<T[]> {
  const pageSize = Math.max(1, Math.floor(opts?.pageSize ?? 1000));
  const maxRows = Math.max(1, Math.floor(opts?.maxRows ?? Number.POSITIVE_INFINITY));

  const out: T[] = [];
  let from = 0;

  while (out.length < maxRows) {
    const remaining = maxRows - out.length;
    const size = Math.min(pageSize, remaining);
    const to = from + size - 1;

    const { data, error } = await fetchPage(from, to);
    if (error) throw error;

    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;

    out.push(...rows);

    if (rows.length < size) break;
    from += size;
  }

  return out;
}
