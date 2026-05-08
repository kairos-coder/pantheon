// ══════════════════════════════════════════════════════
// PANTHEON · kairos-graph.js
// Shared Kùzu-WASM graph — the hippocampus of the pantheon.
// All gods read/write to this single in-memory graph.
// Schema mirrors KairosDB: tokens, pairs, svo_triplets, prompts
// Primary: Kùzu-WASM   Fallback: pure JS Map
// ══════════════════════════════════════════════════════

class KairosGraph {
  constructor() {
    this.db = null;
    this.mode = 'js';       // 'kuzu' or 'js'
    this.ready = this._init();
  }

  // ── Init: try Kùzu-WASM first, fall back to pure JS ──
  async _init() {
    try {
      const KuzuModule = await import('https://esm.sh/kuzu-wasm@0.0.1');
      this.db = new KuzuModule.Kuzu.Database(':memory:');

      // Create schema — mirrors KairosDB tables
      await this.db.execute(`
        CREATE NODE TABLE tokens (
          body STRING,
          domain STRING,
          word_type STRING,
          score DOUBLE,
          extracted_at STRING,
          PRIMARY KEY (body)
        )
      `);
      await this.db.execute(`
        CREATE REL TABLE pairs (
          FROM tokens TO tokens,
          relation_type STRING,
          visual_modifier STRING,
          composed_at STRING
        )
      `);
      await this.db.execute(`
        CREATE NODE TABLE svo_triplets (
          id STRING,
          subject STRING,
          verb STRING,
          object STRING,
          tension DOUBLE,
          domain STRING,
          created_at STRING,
          PRIMARY KEY (id)
        )
      `);
      await this.db.execute(`
        CREATE NODE TABLE prompts (
          id STRING,
          body STRING,
          telos STRING,
          plan STRING,
          source_triplet_id STRING,
          synthesized_at STRING,
          PRIMARY KEY (id)
        )
      `);

      this.mode = 'kuzu';
      console.log('🏛️ KairosGraph: Kùzu-WASM online');
    } catch (e) {
      // Pure JS fallback — always works, zero dependencies
      console.log('🏛️ KairosGraph: JS fallback (Kùzu-WASM unavailable)');
      this.db = {
        tokens: new Map(),
        pairs: [],
        svo_triplets: new Map(),
        prompts: new Map()
      };
      this.mode = 'js';
    }
  }

  // ═══════════════════════════════════════════════════
  // TOKENS (Hermes extracts, Aphrodite/Ares classify)
  // ═══════════════════════════════════════════════════

  async rememberToken(token) {
    await this.ready;
    if (this.mode === 'kuzu') {
      await this.db.execute(
        `MERGE (t:tokens {body: $body})
         SET t.domain = $domain,
             t.word_type = $word_type,
             t.score = $score,
             t.extracted_at = $ts`,
        {
          body: token.body,
          domain: token.domain,
          word_type: token.word_type,
          score: token.score,
          ts: token.extracted_at
        }
      );
    } else {
      this.db.tokens.set(token.body, {
        body: token.body,
        domain: token.domain,
        word_type: token.word_type,
        score: token.score,
        extracted_at: token.extracted_at
      });
    }
  }

  async getAllTokens() {
    await this.ready;
    if (this.mode === 'kuzu') {
      const result = await this.db.execute(
        `MATCH (t:tokens) RETURN t.body AS body, t.domain AS domain,
         t.word_type AS word_type, t.score AS score, t.extracted_at AS extracted_at
         ORDER BY t.extracted_at DESC`
      );
      return result.rows || [];
    } else {
      return Array.from(this.db.tokens.values())
        .sort((a, b) => (b.extracted_at || '').localeCompare(a.extracted_at || ''));
    }
  }

  async countTokensByDomain() {
    await this.ready;
    const counts = {};
    if (this.mode === 'kuzu') {
      const result = await this.db.execute(
        `MATCH (t:tokens) RETURN t.domain AS domain, count(*) AS n`
      );
      for (const row of (result.rows || [])) {
        counts[row.domain] = Number(row.n);
      }
    } else {
      for (const token of this.db.tokens.values()) {
        const d = token.domain || 'signal';
        counts[d] = (counts[d] || 0) + 1;
      }
    }
    return counts;
  }

  // ═══════════════════════════════════════════════════
  // PAIRS (Aphrodite composes love pairs)
  // ═══════════════════════════════════════════════════

  async rememberPair(tokenA, tokenB, relationType, visualModifier, ts) {
    await this.ready;
    if (this.mode === 'kuzu') {
      await this.db.execute(
        `MATCH (a:tokens {body: $a}), (b:tokens {body: $b})
         CREATE (a)-[:pairs {
           relation_type: $rel,
           visual_modifier: $mod,
           composed_at: $ts
         }]->(b)`,
        { a: tokenA, b: tokenB, rel: relationType, mod: visualModifier, ts }
      );
    } else {
      this.db.pairs.push({
        a: tokenA,
        b: tokenB,
        relation_type: relationType,
        visual_modifier: visualModifier,
        composed_at: ts
      });
    }
  }

  async getPairs(since = null) {
    await this.ready;
    if (this.mode === 'kuzu') {
      let query = `MATCH (a:tokens)-[p:pairs]->(b:tokens) RETURN a.body, b.body, p.relation_type, p.visual_modifier, p.composed_at`;
      if (since) query += ` WHERE p.composed_at > $since`;
      query += ` ORDER BY p.composed_at ASC`;
      const result = await this.db.execute(query, since ? { since } : {});
      return result.rows || [];
    } else {
      let filtered = this.db.pairs;
      if (since) filtered = filtered.filter(p => p.composed_at > since);
      return filtered
        .sort((a, b) => a.composed_at.localeCompare(b.composed_at))
        .map(p => ({
          'a.body': p.a,
          'b.body': p.b,
          'p.relation_type': p.relation_type,
          'p.visual_modifier': p.visual_modifier,
          'p.composed_at': p.composed_at
        }));
    }
  }

  // ═══════════════════════════════════════════════════
  // SVO TRIPLETS (Aphrodite/Ares compose, Apollo synthesizes)
  // ═══════════════════════════════════════════════════

  async rememberTriplet(subject, verb, object, tension, domain, ts) {
    await this.ready;
    const id = `${subject}-${verb}-${object}-${ts}`;
    if (this.mode === 'kuzu') {
      await this.db.execute(
        `MERGE (t:svo_triplets {id: $id})
         SET t.subject = $subject,
             t.verb = $verb,
             t.object = $object,
             t.tension = $tension,
             t.domain = $domain,
             t.created_at = $ts`,
        { id, subject, verb, object, tension, domain, ts }
      );
    } else {
      this.db.svo_triplets.set(id, {
        id,
        subject,
        verb,
        object,
        tension,
        domain,
        created_at: ts
      });
    }
    return id;
  }

  async getTriplets(since = null) {
    await this.ready;
    if (this.mode === 'kuzu') {
      let query = `MATCH (t:svo_triplets) RETURN t.id, t.subject, t.verb, t.object, t.tension, t.domain, t.created_at`;
      if (since) query += ` WHERE t.created_at > $since`;
      query += ` ORDER BY t.created_at DESC`;
      const result = await this.db.execute(query, since ? { since } : {});
      return result.rows || [];
    } else {
      let filtered = Array.from(this.db.svo_triplets.values());
      if (since) filtered = filtered.filter(t => t.created_at > since);
      return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }

  // ═══════════════════════════════════════════════════
  // PROMPTS (Apollo synthesizes, Demeter cultivates)
  // ═══════════════════════════════════════════════════

  async rememberPrompt(id, body, telos, plan, sourceTripletId, ts) {
    await this.ready;
    if (this.mode === 'kuzu') {
      await this.db.execute(
        `MERGE (p:prompts {id: $id})
         SET p.body = $body,
             p.telos = $telos,
             p.plan = $plan,
             p.source_triplet_id = $sourceTripletId,
             p.synthesized_at = $ts`,
        { id, body, telos, plan, sourceTripletId, ts }
      );
    } else {
      this.db.prompts.set(id, {
        id,
        body,
        telos,
        plan,
        source_triplet_id: sourceTripletId,
        synthesized_at: ts
      });
    }
  }

  async getPrompts(since = null) {
    await this.ready;
    if (this.mode === 'kuzu') {
      let query = `MATCH (p:prompts) RETURN p.id, p.body, p.telos, p.plan, p.source_triplet_id, p.synthesized_at`;
      if (since) query += ` WHERE p.synthesized_at > $since`;
      query += ` ORDER BY p.synthesized_at DESC`;
      const result = await this.db.execute(query, since ? { since } : {});
      return result.rows || [];
    } else {
      let filtered = Array.from(this.db.prompts.values());
      if (since) filtered = filtered.filter(p => p.synthesized_at > since);
      return filtered.sort((a, b) => b.synthesized_at.localeCompare(a.synthesized_at));
    }
  }

  // ═══════════════════════════════════════════════════
  // NARRATIVE VIEWS (kairos-cantica style)
  // ═══════════════════════════════════════════════════

  async getSpiralNarrative(cycles = 3) {
    await this.ready;
    const cycleMs = 16 * 60 * 1000; // 16-minute spiral
    const since = new Date(Date.now() - cycles * cycleMs).toISOString();
    return await this.getPairs(since);
  }

  async getDomainTensions() {
    await this.ready;
    const tensions = {};

    if (this.mode === 'kuzu') {
      const result = await this.db.execute(
        `MATCH (a:tokens)-[:pairs]->(b:tokens)
         RETURN a.domain AS da, b.domain AS db, count(*) AS n
         ORDER BY n DESC`
      );
      for (const row of (result.rows || [])) {
        const key = `${row.da} × ${row.db}`;
        tensions[key] = Number(row.n);
      }
    } else {
      for (const p of this.db.pairs) {
        const tokenA = this.db.tokens.get(p.a);
        const tokenB = this.db.tokens.get(p.b);
        if (tokenA && tokenB) {
          const key = `${tokenA.domain} × ${tokenB.domain}`;
          tensions[key] = (tensions[key] || 0) + 1;
        }
      }
    }

    return Object.entries(tensions)
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => {
        const [da, db] = key.split(' × ');
        return { da, db, n };
      });
  }
}

// ── Singleton — every god imports this same instance ──
const kairosGraph = new KairosGraph();
export { kairosGraph, KairosGraph };
