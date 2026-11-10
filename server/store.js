import { embedText, embedTexts, memoryText } from './embed.js';
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

// Hybrid ranking: reciprocal-rank fusion of full-text and vector results.
function fuse(text, vectors, lim) {
  const score = new Map();
  const add = (list) => list.forEach((r, i) => {
    const cur = score.get(r.id) || { row: r, s: 0 };
    cur.s += 1 / (60 + i);
    if (r.snippet && !cur.row.snippet) cur.row = { ...cur.row, snippet: r.snippet };
    score.set(r.id, cur);
  });
  add(text);
  add(vectors);
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, lim).map((x) => ({ ...x.row, rank: x.s }));
}

export function createStore(db) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const vec = (v) => `[${v.join(',')}]`;

  // Fire-and-forget: embed a freshly written memory when semantic search is on.
  function embedLater(m) {
    if (!db.vector || !m?.id) return;
    embedText(memoryText(m))
      .then((v) => v && q('UPDATE memories SET embedding = $1::vector WHERE id = $2', [vec(v), m.id]))
      .catch((e) => console.error('[embed]', e.message));
  }

  const missing = async () => Number((await q(`SELECT count(*)::int AS n FROM memories WHERE embedding IS NULL AND status <> 'archived'`))[0].n);

  // Embed up to `limit` memories that have no vector yet.
  async function backfillEmbeddings(limit = 64) {
    if (!db.vector) return { done: 0, remaining: 0, reason: 'pgvector off' };
    const rows = await q(`SELECT id, title, project, summary, left(body, 6000) AS body FROM memories
                          WHERE embedding IS NULL AND status <> 'archived' ORDER BY created_at DESC LIMIT ${Math.min(Number(limit) || 64, 256)}`);
    let done = 0;
    for (let i = 0; i < rows.length; i += 16) {
      const batch = rows.slice(i, i + 16);
      const vecs = await embedTexts(batch.map(memoryText));
      if (!vecs) return { done, remaining: await missing(), reason: 'embeddings unavailable' };
      for (let j = 0; j < batch.length; j++) await q('UPDATE memories SET embedding = $1::vector WHERE id = $2', [vec(vecs[j]), batch[j].id]);
      done += batch.length;
    }
    return { done, remaining: await missing() };
  }

  // Nearest memories by meaning; null when embeddings are unavailable.
  async function semantic(query, where, p, lim) {
    if (!db.vector) return null;
    const v = await embedText(query, { query: true });
    if (!v) return null;
    const params = [...p, vec(v)];
    const n = params.length;
    const hits = await q(
      `SELECT ${LIST_COLS}, 1 - (embedding <=> $${n}::vector) AS similarity FROM memories
       WHERE ${[...where, 'embedding IS NOT NULL'].join(' AND ')}
       ORDER BY embedding <=> $${n}::vector LIMIT ${lim}`,
      params,
    );
    return hits.filter((h) => h.similarity > 0.3);
  }

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
    embedLater(rows[0]);
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
    const vecHits = await semantic(String(query), [...where], [...p], lim);
    const tsq = arg(mode === 'or' ? orQuery(query) : String(query));
    const rows = await q(
      `SELECT ${LIST_COLS}, ts_rank(tsv, websearch_to_tsquery('english', ${tsq})) AS rank,
              ts_headline('english', coalesce(summary, '') || ' ' || left(body, 6000), websearch_to_tsquery('english', ${tsq}),
                'StartSel=⟦,StopSel=⟧,MaxWords=30,MinWords=12,MaxFragments=2,FragmentDelimiter= … ') AS snippet
       FROM memories WHERE ${[...where, `tsv @@ websearch_to_tsquery('english', ${tsq})`].join(' AND ')}
       ORDER BY rank DESC, created_at DESC LIMIT ${lim} OFFSET ${off}`,
      p,
    );
    if (vecHits?.length) return fuse(rows, vecHits, lim);
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
    const skills = await listSkills(project);
    if (skills.length) sec.push(`## Skills you can load (call \`skill\` with the name)\n${skills.slice(0, 25).map((r) => `- ${r.name}: ${clip(r.description || '', 140)}`).join('\n')}`);
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

  // Skills: project skills first, then global ones; a project skill shadows a global one with the same name.
  async function listSkills(project) {
    const rows = await q(
      `SELECT id, title AS name, summary AS description, project, url, updated_at, length(body) AS size FROM memories
       WHERE kind = 'skill' AND status = 'active' AND (project IS NULL OR project = $1)
       ORDER BY (project IS NULL), title LIMIT 200`,
      [project || null],
    );
    const seen = new Set();
    return rows.filter((r) => !seen.has(r.name) && seen.add(r.name));
  }

  async function getSkill(name, project) {
    return (await q(
      `SELECT id, title AS name, summary AS description, project, url, body FROM memories
       WHERE kind = 'skill' AND status = 'active' AND title = $1 AND (project IS NULL OR project = $2)
       ORDER BY (project IS NULL) LIMIT 1`,
      [name, project || null],
    ))[0] || null;
  }

  async function exportAll() {
    return q(`SELECT ${COLS} FROM memories ORDER BY id`);
  }

  return { listSkills, getSkill, backfillEmbeddings, semanticOn: () => Boolean(db.vector), remember, recordVisit, search, get, update, forget, projects, stats, brief, pendingForDay, saveDigest, daysNeedingDigest, exportAll, query: q };
}
