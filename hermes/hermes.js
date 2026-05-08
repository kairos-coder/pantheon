// ══════════════════════════════════════════════════════
// HERMES · Extraction Logic
// Domain dictionaries, classification, extractAndStore
// ══════════════════════════════════════════════════════

import { kairosGraph } from '../kairos-graph.js';

// ── Domain seed dictionaries ──
const SIGNAL = new Set(['message','signal','swift','trade','path','word','code','travel','cross','courier','speed','threshold']);
const LOVE = new Set(['love','heart','desire','beauty','grace','tenderness','embrace','longing','bloom','devotion','soul','charm']);
const WAR = new Set(['battle','strike','clash','blade','shield','rage','force','conquest','enemy','siege','weapon','army']);
const WISDOM = new Set(['truth','mind','pattern','knowledge','logic','reason','insight','clarity','thought','learning','vision','design']);
const STORM = new Set(['thunder','lightning','decree','command','order','rule','wrath','judgment','authority','law','dominion','sky']);
const TIDE = new Set(['ocean','wave','current','depth','flow','sea','flood','salt','surge','abyss','drift','water']);
const WILD = new Set(['hunt','beast','moon','forest','fang','claw','track','chase','instinct','roam','predator','wilderness']);
const VINE = new Set(['ecstasy','dance','madness','release','wine','frenzy','ritual','trance','abandon','revelry','intoxication','chaos']);
const FORGE = new Set(['hammer','fire','anvil','craft','iron','shape','creation','tool','metal','build','smelt','temper']);
const FARM = new Set(['seed','harvest','soil','grain','crop','cycle','growth','field','earth','cultivate','season','root']);
const CROWN = new Set(['legacy','oath','throne','lineage','memory','law','reign','blood','honor','dynasty','covenant','stone']);
const LIGHT = new Set(['dawn','harmony','prophecy','song','balance','golden','lyre','oracle','radiance','healing','clarity','truth']);

const ALL_WORDS = new Set([...SIGNAL, ...LOVE, ...WAR, ...WISDOM, ...STORM, ...TIDE, ...WILD, ...VINE, ...FORGE, ...FARM, ...CROWN, ...LIGHT]);

const DOMAIN_MAP = {
  signal: SIGNAL, love: LOVE, war: WAR, wisdom: WISDOM,
  storm: STORM, tide: TIDE, wild: WILD, vine: VINE,
  forge: FORGE, farm: FARM, crown: CROWN, light: LIGHT
};

// ── Classification functions ──
export function classifyDomain(word) {
  for (const [domain, words] of Object.entries(DOMAIN_MAP)) {
    if (words.has(word)) return domain;
  }
  return 'signal';
}

export function classifyWordType(word, domain) {
  // Objects
  if (['fruit','field','tool','ocean','edge','decree','order','pattern','vision','stone','truth'].includes(word)) return 'O';
  // Verbs (action words)
  if (['strike','clash','forge','build','smelt','temper','flow','drift','surge','chase','roam','cultivate','harvest','bloom','embrace','dance','release'].includes(word)) return 'V';
  // Default
  return 'S';
}

// ── Main extraction function ──
export async function extractAndStore(text, source = 'manual') {
  await kairosGraph.ready;
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const seen = new Set();
  let stored = 0;

  for (const word of words) {
    if (!ALL_WORDS.has(word) || seen.has(word)) continue;
    seen.add(word);

    const domain = classifyDomain(word);
    const token = {
      body: word,
      domain: domain,
      word_type: classifyWordType(word, domain),
      score: 90,
      extracted_at: new Date().toISOString()
    };

    await kairosGraph.rememberToken(token);
    stored++;
  }
  return stored;
}

// ── PubMed-style query topics ──
export const PUBMED_QUERIES = [
  'neural network cognition',
  'language model attention mechanism',
  'memory consolidation brain hippocampus',
  'sentiment classification natural language',
  'cognitive architecture reasoning system',
  'artificial intelligence ethics safety',
  'deep learning embedding token representation',
  'consciousness neural correlates brain',
  'emotion recognition affective computing',
  'knowledge graph ontology semantic web'
];

// ── RSS feed names (delegates to edge function for actual fetching) ──
export const RSS_FEEDS = ['bbc', 'aljazeera', 'hn', 'hn-algolia'];
