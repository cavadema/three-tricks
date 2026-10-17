// Ranking do Three Tricks: guarda a melhor nota de cada jogador por pico,
// na semana e de todos os tempos, num Redis da Upstash (via REST).

// Picos do circuito: a nota é de uma manobra só e todos entram na soma do ranking geral.
const CIRCUITO = { rampa: 4000, caixote: 4000, reto: 5000, descida: 6500 };
// Modo livre: a nota é a soma de uma sessão de 60 s, por isso fica fora do ranking geral.
const LIVRE = { sessao: 60000 };
const PICOS = { ...CIRCUITO, ...LIVRE };
const ALL = Object.keys(CIRCUITO);
const TOP = 20;
const RATE_MAX = 12; // envios por IP a cada 10 minutos

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(commands) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  return out.map(x => x.result);
}

// Semana ISO no horário de Brasília, para o ranking semanal zerar na segunda.
function weekKey(now = Date.now()) {
  const d = new Date(now - 3 * 3600 * 1000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}w${String(week).padStart(2, '0')}`;
}
const boardKey = (pico, period) => `tt:lb:${pico}:${period === 'week' ? weekKey() : 'all'}`;

const cleanName = s => String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} ._\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const cleanId = s => (/^[a-z0-9-]{8,64}$/i.test(String(s || '')) ? String(s) : null);
const cleanTrick = s => String(s || '').replace(/[<>]/g, '').slice(0, 80);

async function board(pico, period, device) {
  const key = boardKey(pico, period);
  const [top, myRank, myScore, count] = await redis([
    ['ZRANGE', key, '0', String(TOP - 1), 'REV', 'WITHSCORES'],
    device ? ['ZREVRANK', key, device] : ['ECHO', ''],
    device ? ['ZSCORE', key, device] : ['ECHO', ''],
    ['ZCARD', key]
  ]);
  const ids = [];
  for (let i = 0; i < top.length; i += 2) ids.push(top[i]);
  if (device && myRank !== null && myRank >= TOP) ids.push(device);
  const names = ids.length ? await redis([['HMGET', 'tt:names', ...ids], ['HMGET', `tt:tricks:${pico}:${period === 'week' ? weekKey() : 'all'}`, ...ids]]) : [[], []];
  const rows = [];
  for (let i = 0; i < top.length; i += 2) rows.push({ rank: i / 2 + 1, name: names[0][i / 2] || 'Skatista', trick: names[1][i / 2] || '', score: Math.round(+top[i + 1]), me: top[i] === device });
  let me = null;
  if (device && myRank !== null && myScore !== null) {
    me = { rank: myRank + 1, score: Math.round(+myScore), name: names[0][ids.indexOf(device)] || '', trick: names[1][ids.indexOf(device)] || '' };
    if (myRank > 0) {
      const above = await redis([['ZRANGE', key, String(myRank - 1), String(myRank - 1), 'REV', 'WITHSCORES']]);
      if (above[0] && above[0].length) me.gap = Math.round(+above[0][1] - me.score) + 1;
    }
  }
  return { pico, period, week: weekKey(), total: count || 0, rows, me };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'ranking_off' });
  try {
    if (req.method === 'GET') {
      const pico = req.query.pico === 'geral' ? 'geral' : (PICOS[req.query.pico] ? req.query.pico : 'geral');
      const period = req.query.period === 'all' ? 'all' : 'week';
      return res.status(200).json(await board(pico, period, cleanId(req.query.device)));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const device = cleanId(b.device), name = cleanName(b.name), pico = String(b.pico || ''), trick = cleanTrick(b.trick);
    const score = Math.round(Number(b.score));
    if (!device || name.length < 2 || !PICOS[pico] || !Number.isFinite(score) || score <= 0 || score > PICOS[pico]) {
      return res.status(400).json({ error: 'invalid' });
    }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
    const [hits] = await redis([['INCR', `tt:rate:${ip}`], ['EXPIRE', `tt:rate:${ip}`, '600', 'NX']]);
    if (hits > RATE_MAX) return res.status(429).json({ error: 'rate' });

    const wk = weekKey(), wKey = boardKey(pico, 'week'), aKey = boardKey(pico, 'all');
    const out = await redis([
      ['HSET', 'tt:names', device, name],
      ['ZADD', wKey, 'GT', 'CH', String(score), device],
      ['EXPIRE', wKey, String(60 * 86400)],
      ['ZADD', aKey, 'GT', 'CH', String(score), device]
    ]);
    const improved = { week: out[1] === 1, all: out[3] === 1 };
    // Guarda a manobra só quando a nota melhorou e recalcula a soma geral do jogador.
    const follow = [];
    if (improved.week) follow.push(['HSET', `tt:tricks:${pico}:${wk}`, device, trick], ['EXPIRE', `tt:tricks:${pico}:${wk}`, String(60 * 86400)]);
    if (improved.all) follow.push(['HSET', `tt:tricks:${pico}:all`, device, trick]);
    const base = follow.length;
    for (const period of ['week', 'all']) for (const p of ALL) follow.push(['ZSCORE', boardKey(p, period), device]);
    const r2 = await redis(follow);
    const sum = off => ALL.reduce((a, _, k) => a + Math.round(+(r2[base + off + k] || 0)), 0);
    const gW = boardKey('geral', 'week'), gA = boardKey('geral', 'all');
    await redis([['ZADD', gW, String(sum(0)), device], ['EXPIRE', gW, String(60 * 86400)], ['ZADD', gA, String(sum(ALL.length)), device]]);
    const [weekBoard, allBoard] = await Promise.all([board(pico, 'week', device), board(pico, 'all', device)]);
    return res.status(200).json({ ok: true, improved, week: weekBoard.me, all: allBoard.me, weekTotal: weekBoard.total });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
