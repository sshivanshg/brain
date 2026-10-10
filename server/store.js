import { dayOf, shiftDay, scrub, titleFrom, extractiveSummary, domainOf, orQuery, clip } from './util.js';

export const KINDS = [
  'note', 'session', 'decision', 'lesson', 'preference', 'profile', 'todo', 'fact',
  'browse', 'highlight', 'bookmark', 'voice', 'digest', 'prompt', 'prompt-log',
  'skill', 'agent', 'playbook', 'doc', 'memory',
];

const COLS = `id, kind, title, body, summary, source, project, tags, url, meta, pinned, status,
  day::text AS day, ext_key, created_at, updated_at`;
const LIST_COLS = `id, kind, title, left(body, 700) AS body, length(body) AS body_len, summary, source, project, tags,
  url, meta, pinned, status, day::text AS day, created_at, updated_at`;

export function createStore(db) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  async function remember(m) {
    const body = scrub(m.body ?? m.content ?? '');
    const kind = KINDS.includes(m.kind) ? m.kind : 'note';
    const rows = await q(
      `INSERT INTO memories (kind, title, body, summary, source, project, tags, url, meta, pinned, day, ext_key)
       VALUES ($1, $2, $3, $4, $5, $6, ARRAY(SELECT jsonb_array_elements_text($7::jsonb)), $8, $9::jsonb, $10, $11::date, $12)
       ON CONFLICT (ext_key) DO UPDATE SET
         kind = EXCLUDED.kind, title = EXCLUDED.title, body = EXCLUDED.body,
         summary = COALESCE(EXCLUDED.summary, memories.summary), project = EXCLUDED.project,
         tags = EXCLUDED.tags, url = EXCLUDED.url, meta = memories.meta || EXCLUDED.meta,
         day = CASE WHEN $13 THEN EXCLUDED.day ELSE memories.day END,
         status = 'active', updated_at = now()
       RETURNING ${COLS}`,
      [
        kind,
        scrub(m.title || titleFrom(body)),
        body,
        m.summary ? scrub(m.summary) : null,
        m.source || 'unknown',
        m.project || null,
        JSON.stringify(Array.isArray(m.tags) ? m.tags.map(String) : []),
        m.url || null,
        JSON.stringify(m.meta || {}),
        Boolean(m.pinned),
        m.day || dayOf(),
        m.ext_key || null,
        Boolean(m.day),
      ],
    );
    return rows[0];
  }

  // One row per URL per day; repeat visits add dwell time and highlights.
  async function recordVisit(v) {
    const day = v.day || dayOf(v.at ? new Date(v.at) : new Date());
    const text = scrub(clip(String(v.text || '').replace(/\n{3,}/g, '\n\n'), 12000) || '');
    const meta = {
      domain: domainOf(v.url),
      visits: 1,
      dwell: Math.max(0, Math.round(Number(v.dwell) || 0)),
      highlights: (v.highlights || []).map((h) => scrub(clip(String(h), 1000))).slice(0, 20),
      agent: v.source === 'chrome-agent',
    };
    const rows = await q(
      `INSERT INTO memories (kind, title, body, summary, source, url, meta, day, ext_key)
       VALUES ('browse', $1, $2, $3, $4, $5, $6::jsonb, $7::date, $8)
       ON CONFLICT (ext_key) DO UPDATE SET
         title = EXCLUDED.title,
         body = CASE WHEN length(EXCLUDED.body) > length(memories.body) THEN EXCLUDED.body ELSE memories.body END,
         summary = COALESCE(memories.summary, EXCLUDED.summary),
         meta = memories.meta || jsonb_build_object(
           'visits', COALESCE((memories.meta->>'visits')::int, 0) + 1,
           'dwell', COALESCE((memories.meta->>'dwell')::int, 0) + COALESCE((EXCLUDED.meta->>'dwell')::int, 0),
           'highlights', COALESCE(memories.meta->'highlights', '[]'::jsonb) || COALESCE(EXCLUDED.meta->'highlights', '[]'::jsonb)),
         status = CASE WHEN memories.status = 'archived' THEN 'archived' ELSE 'active' END,
         updated_at = now()
       RETURNING id, title, body, summary, meta`,
      [
        scrub(clip(v.title || v.url, 300)),
        text,
        extractiveSummary(text, v.description),
        v.source || 'chrome',
        v.url,
        JSON.stringify(meta),
        day,
        `browse:${day}:${v.url}`,
      ],
    );
    return rows[0];
  }

  async function search({ q: query, kind, project, source, day, since, status, limit = 30, offset = 0, mode = 'and' } = {}) {
    const p = [];
    const where = [];
    const arg = (v) => { p.push(v); return `$${p.length}`; };
    if (status === 'any') { /* everything */ } else if (status) where.push(`status = ${arg(status)}`);
    else where.push(`status <> 'archived'`);
    if (kind) where.push(`kind = ANY(string_to_array(${arg(String(kind))}, ','))`);
    if (project) where.push(`project = ${arg(project)}`);
    if (source) where.push(`source = ${arg(source)}`);
    if (day) where.push(`day = ${arg(day)}::date`);
    if (since) where.push(`day >= ${arg(since)}::date`);
    const lim = Math.min(Number(limit) || 30, 200);
    const off = Math.max(Number(offset) || 0, 0);

    if (!query) {
      return q(`SELECT ${LIST_COLS} FROM memories ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY pinned DESC, created_at DESC LIMIT ${lim} OFFSET ${off}`, p);
    }
    const tsq = arg(mode === 'or' ? orQuery(query) : String(query));
    const rows = await q(
      `SELECT ${LIST_COLS}, ts_rank(tsv, websearch_to_tsquery('english', ${tsq})) AS rank,
              ts_headline('english', coalesce(summary, '') || ' ' || left(body, 6000), websearch_to_tsquery('english', ${tsq}),
                'StartSel=⟦,StopSel=⟧,MaxWords=30,MinWords=12,MaxFragments=2,FragmentDelimiter= … ') AS snippet
       FROM memories WHERE ${[...where, `tsv @@ websearch_to_tsquery('english', ${tsq})`].join(' AND ')}
       ORDER BY rank DESC, created_at DESC LIMIT ${lim} OFFSET ${off}`,
      p,
    );
    if (rows.length || mode === 'or') return rows;
    // Partial words / URLs: fall back to substring match, then to an OR query.
    p.pop();
    const like = arg(`%${query}%`);
    const loose = await q(
      `SELECT ${LIST_COLS} FROM memories WHERE ${[...where, `(title ILIKE ${like} OR body ILIKE ${like} OR url ILIKE ${like})`].join(' AND ')}
       ORDER BY created_at DESC LIMIT ${lim}`,
      p,
    );
    return loose.length ? loose : search({ q: query, kind, project, source, day, since, status, limit, mode: 'or' });
  }

  async function get(id) {
    return (await q(`SELECT ${COLS} FROM memories WHERE id = $1`, [id]))[0] || null;
  }

  const EDITABLE = ['title', 'body', 'summary', 'kind', 'project', 'url', 'pinned', 'status', 'tags', 'meta'];
  async function update(id, patch) {
    const sets = [];
    const p = [id];
    for (const key of EDITABLE) {
      if (!(key in patch)) continue;
      let v = patch[key];
      if (key === 'tags') { p.push(JSON.stringify(v || [])); sets.push(`tags = ARRAY(SELECT jsonb_array_elements_text($${p.length}::jsonb))`); continue; }
      if (key === 'meta') { p.push(JSON.stringify(v || {})); sets.push(`meta = meta || $${p.length}::jsonb`); continue; }
      if (['title', 'body', 'summary'].includes(key)) v = scrub(v);
      p.push(v);
      sets.push(`${key} = $${p.length}`);
    }
    if (!sets.length) return get(id);
    return (await q(`UPDATE memories SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLS}`, p))[0] || null;
  }

  const forget = (id) => update(id, { status: 'archived' });

  async function projects() {
    return q(`SELECT project, count(*)::int AS count, max(created_at) AS last_active,
                     count(*) FILTER (WHERE kind = 'session')::int AS sessions,
                     count(*) FILTER (WHERE kind IN ('decision', 'lesson'))::int AS knowledge
              FROM memories WHERE project IS NOT NULL AND status <> 'archived'
              GROUP BY project ORDER BY last_active DESC`);
  }

  async function stats() {
    const today = dayOf();
    const [totals] = await q(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE day = $1::date)::int AS today,
        count(*) FILTER (WHERE kind = 'browse' AND day = $1::date)::int AS pages_today,
        count(*) FILTER (WHERE kind = 'session' AND day = $1::date)::int AS sessions_today,
        count(*) FILTER (WHERE kind IN ('lesson', 'decision'))::int AS knowledge,
        count(DISTINCT project)::int AS projects
      FROM memories WHERE status <> 'archived'`, [today]);
    const byKind = await q(`SELECT kind, count(*)::int AS count FROM memories WHERE status <> 'archived' GROUP BY kind ORDER BY count DESC`);
    const bySource = await q(`SELECT source, count(*)::int AS count FROM memories WHERE day >= $1::date GROUP BY source ORDER BY count DESC`, [shiftDay(today, -7)]);
    const heat = await q(`SELECT day::text AS day, count(*)::int AS count FROM memories WHERE day >= $1::date GROUP BY day ORDER BY day`, [shiftDay(today, -119)]);
    return { today, ...totals, byKind, bySource, heat };
  }

  // One tidy line per memory: a descriptive title if there is one, else the body.
  const line = (r, max) => clip(String(r.title && r.title.length > 30 ? r.title : r.summary || r.body || r.title).replace(/\s+/g, ' ').trim(), max);

  // The context every agent gets before it starts working.
  async function brief({ project, max = 9000 } = {}) {
    const sec = [];
    const profile = (await q(`SELECT body FROM memories WHERE kind = 'profile' AND status = 'active' ORDER BY updated_at DESC LIMIT 1`))[0];
    if (profile) sec.push(`## About me\n${clip(profile.body, 1200)}`);
    const prefs = await q(`SELECT title, body FROM memories WHERE kind = 'preference' AND status = 'active'
                           AND (project IS NULL OR project = $1) ORDER BY pinned DESC, created_at DESC LIMIT 25`, [project || null]);
    if (prefs.length) sec.push(`## How I like to work\n${prefs.map((r) => `- ${line(r, 300)}`).join('\n')}`);
    if (project) {
      const lessons = await q(`SELECT id, title, body FROM memories WHERE kind = 'lesson' AND status = 'active'
                               AND (project = $1 OR project IS NULL) ORDER BY pinned DESC, created_at DESC LIMIT 15`, [project]);
      if (lessons.length) sec.push(`## Lessons — don't repeat these\n${lessons.map((r) => `- ${line(r, 280)} (#${r.id})`).join('\n')}`);
      const facts = await q(`SELECT id, title, summary, body FROM memories WHERE kind IN ('fact', 'memory') AND status = 'active'
                             AND project = $1 ORDER BY pinned DESC, updated_at DESC LIMIT 12`, [project]);
      if (facts.length) sec.push(`## What we know about ${project}\n${facts.map((r) => `- ${line(r, 260)} (#${r.id})`).join('\n')}`);
      const decisions = await q(`SELECT id, title, body, day::text AS day FROM memories WHERE kind = 'decision' AND status = 'active'
                                 AND project = $1 ORDER BY created_at DESC LIMIT 12`, [project]);
      if (decisions.length) sec.push(`## Decisions already made in ${project}\n${decisions.map((r) => `- ${r.day}: ${line(r, 260)} (#${r.id})`).join('\n')}`);
      const todos = await q(`SELECT id, title FROM memories WHERE kind = 'todo' AND status = 'active'
                             AND (project = $1 OR project IS NULL) ORDER BY pinned DESC, created_at DESC LIMIT 10`, [project]);
      if (todos.length) sec.push(`## Open threads\n${todos.map((r) => `- [ ] ${r.title} (#${r.id})`).join('\n')}`);
      const sessions = await q(`SELECT id, title, summary, day::text AS day, source FROM memories WHERE kind = 'session' AND project = $1
                                AND status <> 'archived' ORDER BY created_at DESC LIMIT 5`, [project]);
      if (sessions.length) sec.push(`## Recent sessions here\n${sessions.map((r) => `- ${r.day} (${r.source}): ${clip(r.summary || r.title, 300)}`).join('\n')}`);
      const pinned = await q(`SELECT id, kind, title FROM memories WHERE pinned AND project = $1 AND status = 'active'
                              AND kind NOT IN ('lesson', 'decision', 'todo', 'preference') LIMIT 10`, [project]);
      if (pinned.length) sec.push(`## Pinned for ${project}\n${pinned.map((r) => `- ${r.kind}: ${r.title} (#${r.id})`).join('\n')}`);
    }
    const digest = (await q(`SELECT day::text AS day, body FROM memories WHERE kind = 'digest' AND status <> 'archived' ORDER BY day DESC LIMIT 1`))[0];
    if (digest) sec.push(`## Latest daily digest (${digest.day})\n${clip(digest.body, 1500)}`);
    const head = `# Brain briefing${project ? ` — ${project}` : ''}\n`;
    const foot = '\n\n_Save decisions, lessons, preferences and todos with the brain `remember` tool as they happen; use `recall` before asking me something you might already know._';
    if (!sec.length) return `${head}\nThe brain has nothing on this yet. Start writing to it with \`remember\`.${foot}`;
    return clip(head + '\n' + sec.join('\n\n'), max) + foot;
  }

  async function pendingForDay(day) {
    return q(`SELECT id, kind, title, summary, left(body, 1200) AS body, url, source, project, meta
              FROM memories WHERE day = $1::date AND status = 'active'
              AND kind IN ('browse', 'session', 'note', 'highlight', 'bookmark', 'voice', 'decision', 'lesson', 'todo')
              ORDER BY created_at`, [day]);
  }

  async function saveDigest(day, body, { source = 'dream', title } = {}) {
    const digest = await remember({
      kind: 'digest', day, body, source, ext_key: `digest:${day}`,
      title: title || `Daily digest · ${day}`, summary: clip(body.replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim(), 400),
    });
    const keepRaw = process.env.BRAIN_KEEP_RAW === '1';
    const compacted = await q(
      `UPDATE memories SET status = 'compacted', updated_at = now()${keepRaw ? '' : ', body = left(body, 600)'}
       WHERE day = $1::date AND kind = 'browse' AND status = 'active' RETURNING id`, [day]);
    return { digest, compacted: compacted.length };
  }

  async function daysNeedingDigest() {
    return q(`SELECT day::text AS day, count(*)::int AS items FROM memories m
              WHERE status = 'active' AND kind IN ('browse', 'session') AND day < $1::date
              AND NOT EXISTS (SELECT 1 FROM memories d WHERE d.kind = 'digest' AND d.day = m.day)
              GROUP BY day ORDER BY day`, [dayOf()]);
  }

  async function exportAll() {
    return q(`SELECT ${COLS} FROM memories ORDER BY id`);
  }

  return { remember, recordVisit, search, get, update, forget, projects, stats, brief, pendingForDay, saveDigest, daysNeedingDigest, exportAll, query: q };
}
