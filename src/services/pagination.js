// ─────────────────────────────────────────────────────────────────────────────
// fetchAllPages: paginates a Supabase query past the platform's default
// 1000-row cap.
//
// Supabase/PostgREST returns at most 1000 rows per request by default —
// silently, no error — regardless of how many rows actually match the
// filter. Any report or aggregation that sums/counts a `.select()` without
// pagination will quietly start dropping rows the day the underlying table
// passes that threshold (see tasks/auditoria_admin_2026-09-18.md, 1.3).
//
// `builder(from, to)` must return a Supabase query with .range(from, to)
// applied, ordered by a UNIQUE column (or a compound order ending in one) —
// pagination via .range() on a non-unique sort can skip or duplicate rows
// at page boundaries when there are ties on the sort key.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000

export async function fetchAllPages(builder) {
    let all = []
    let from = 0

    while (true) {
        const { data, error } = await builder(from, from + PAGE_SIZE - 1)
        if (error) return { data: null, error }

        all = all.concat(data || [])
        if (!data || data.length < PAGE_SIZE) break
        from += PAGE_SIZE
    }

    return { data: all, error: null }
}
