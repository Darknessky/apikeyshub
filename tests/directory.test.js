import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, FILTER_GROUPS } from '../src/data.js';
import { getResults, facetCount } from '../src/directory.js';
import { REFERRAL_LINKS } from '../src/config.js';

const state = overrides => ({ query: '', collection: 'all', sort: 'curated', filters: Object.fromEntries(FILTER_GROUPS.map(g => [g.key, []])), ...overrides });
test('search finds the imported providers and their documented models', () => {
  assert.deepEqual(getResults(PROVIDERS, state({ query: '  YZMAO  ' })).map(p => p.id), ['yzmao']);
  assert.deepEqual(getResults(PROVIDERS, state({ query: '  BUDS AI  ' })).map(p => p.id), ['buds']);
  assert.deepEqual(getResults(PROVIDERS, state({ query: 'claude-opus-5-5' })).map(p => p.id), ['ireze', 'byesu']);
  assert.equal(getResults(PROVIDERS, state({ query: 'agentrouter' })).length, 0);
  assert.equal(getResults(PROVIDERS, state({ query: 'emtf' })).length, 0);
  assert.equal(getResults(PROVIDERS, state({ query: '<script>missing</script>' })).length, 0);
});
test('filters combine with OR within a group and AND across groups', () => {
  const s = state(); s.filters.auth = ['API Key', 'Not documented']; s.filters.clients = ['Anthropic'];
  assert.deepEqual(getResults(PROVIDERS, s).map(p => p.id), ['ireze', 'freemodel', 'byesu', 'aerolink', 'codex-relay']);
  s.filters.auth = ['Not documented'];
  assert.deepEqual(getResults(PROVIDERS, s).map(p => p.id), ['aerolink']);
  s.filters.auth = ['API Key']; s.filters.clients = []; assert.equal(getResults(PROVIDERS, s).length, 8);
});
test('facet counts respect other groups and retain choices in the same group', () => {
  const s = state(); s.filters.auth = ['API Key']; s.filters.clients = ['OpenAI'];
  assert.equal(facetCount(PROVIDERS, s, 'auth', 'Not documented'), 1);
  assert.equal(facetCount(PROVIDERS, s, 'clients', 'Anthropic'), 4);
  assert.equal(facetCount(PROVIDERS, s, 'status', 'Offline'), 0);
});
test('collections display the selected source entries', () => {
  assert.deepEqual(getResults(PROVIDERS, state({ collection: 'disabled' })), []);
  assert.deepEqual(getResults(PROVIDERS, state({ collection: 'top' })), []);
  assert.deepEqual(getResults([{ ...PROVIDERS[0], badge: 'Featured' }], state({ collection: 'top' })).map(p => p.id), ['ireze']);
  assert.deepEqual(getResults(PROVIDERS, state({ collection: 'new' })).map(p => p.id), ['ireze', 'byesu', 'moyuu', 'artbloom']);
  assert.deepEqual(getResults(PROVIDERS, state({ collection: 'recommended' })).map(p => p.id), ['buds']);
});
test('all sort options work, and missing latency sorts last', () => {
  assert.deepEqual(getResults(PROVIDERS, state()).map(p => p.id), PROVIDERS.map(p => p.id));
  const alphabetical = getResults(PROVIDERS, state({ sort: 'name' }));
  assert.equal(alphabetical[0].id, 'aerolink'); assert.equal(alphabetical.at(-1).id, 'yzmao');
  assert.equal(getResults(PROVIDERS, state({ sort: 'newest' }))[0].id, 'artbloom');
  const sample = [null, 80, 20].map((latency, i) => ({ ...PROVIDERS[0], id: String(i), latency }));
  assert.deepEqual(getResults(sample, state({ sort: 'latency' })).map(p => p.latency), [20, 80, null]);
});
test('only the requested providers are included, with supplied links and documented endpoints', () => {
  assert.deepEqual(PROVIDERS.map(p => p.name), ['Ireze', 'freemodel.in', 'Byesu API', 'Aerolink AI', 'Moyuu', 'ArtBloom', 'Yzmao', 'Codex-Relay', 'Buds AI']);
  assert.deepEqual(REFERRAL_LINKS, {
    'codex-relay': 'https://shr.pn/TwMI', yzmao: 'https://shr.pn/XsEt', freemodel: 'https://shr.pn/E3JQ',
    moyuu: 'https://shr.pn/iwsy', byesu: 'https://byesu.com/sign-up?aff=gmEx',
    aerolink: 'https://shr.pn/T76x',
    buds: 'https://apichat.budsin.dev/sign-up?aff=IXKX',
    artbloom: 'https://api.artbloom.tech/signup?ref=URDP2KLBFE',
    ireze: 'https://ireze.site/?ref=REF_82fa33b7',
  });
  assert.equal(Object.keys(REFERRAL_LINKS).length, PROVIDERS.length);
  PROVIDERS.forEach(p => {
    const link = new URL(REFERRAL_LINKS[p.id]);
    assert.equal(link.protocol, 'https:');
    assert.ok(!link.hostname.includes('example.com'));
    assert.equal(p.route, ({ byesu: 'https://byesu.com/v1', ireze: 'https://ireze.site/v1' })[p.id] ?? null);
    assert.equal(p.latency, null);
  });
});
