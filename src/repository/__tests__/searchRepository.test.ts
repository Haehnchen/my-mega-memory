import Database from 'better-sqlite3';
import { SearchRepository, SearchEntry } from '../SearchRepository';
import { SEARCH_TABLE_SQL } from '../../searchDatabase';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(SEARCH_TABLE_SQL);
  return db;
}

function makeEntry(overrides: Partial<SearchEntry> = {}): SearchEntry {
  return {
    content: 'test content',
    sessionId: 'session-1',
    projectId: 'project-1',
    cardType: 'assistant',
    sessionTitle: 'Test Session',
    projectName: 'test-project',
    timestamp: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SearchRepository', () => {
  let db: Database.Database;
  let repo: SearchRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SearchRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('inserts and retrieves via search', () => {
    repo.insert(makeEntry({ content: 'hello world search' }));
    const results = repo.search('hello');
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe('session-1');
    expect(results[0].content).toContain('hello');
  });

  it('returns highlighted matches with mark tags', () => {
    repo.insert(makeEntry({ content: 'the quick brown fox' }));
    const results = repo.search('quick');
    expect(results[0].content).toContain('<mark>');
    expect(results[0].content).toContain('</mark>');
  });

  it('returns empty array for no matches', () => {
    repo.insert(makeEntry({ content: 'hello world' }));
    const results = repo.search('nonexistent');
    expect(results).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      repo.insert(makeEntry({ content: `match item ${i}`, sessionId: `session-${i}` }));
    }
    const results = repo.search('match', 3);
    expect(results).toHaveLength(3);
  });

  it('deletes by session ID', () => {
    repo.insert(makeEntry({ content: 'session one', sessionId: 'session-1' }));
    repo.insert(makeEntry({ content: 'session two', sessionId: 'session-2' }));

    repo.deleteBySessionId('session-1');

    const results1 = repo.search('session');
    expect(results1).toHaveLength(1);
    expect(results1[0].sessionId).toBe('session-2');
  });

  it('returns correct count', () => {
    expect(repo.getCount()).toBe(0);
    repo.insert(makeEntry());
    repo.insert(makeEntry({ sessionId: 'session-2' }));
    expect(repo.getCount()).toBe(2);
  });

  it('preserves metadata fields', () => {
    repo.insert(makeEntry({
      content: 'searchable',
      sessionId: 'sid',
      projectId: 'pid',
      cardType: 'user',
      sessionTitle: 'My Title',
      projectName: 'my-proj',
    }));
    const results = repo.search('searchable');
    expect(results[0].sessionId).toBe('sid');
    expect(results[0].projectId).toBe('pid');
    expect(results[0].cardType).toBe('user');
    expect(results[0].sessionTitle).toBe('My Title');
    expect(results[0].projectName).toBe('my-proj');
  });

  it('returns a score for each result', () => {
    repo.insert(makeEntry({ content: 'hello world' }));
    const results = repo.search('hello');
    expect(typeof results[0].score).toBe('number');
    expect(results[0].score).toBeGreaterThanOrEqual(0);
  });

  it('filters by project name via searchByProject', () => {
    repo.insert(makeEntry({ content: 'shared term', projectName: 'alpha' }));
    repo.insert(makeEntry({ content: 'shared term', projectName: 'beta', sessionId: 'session-2' }));

    const all = repo.search('shared');
    expect(all).toHaveLength(2);

    const filtered = repo.searchByProject('alpha', 'shared');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].projectName).toBe('alpha');
  });

  it('caps results at MAX_LIMIT', () => {
    for (let i = 0; i < 110; i++) {
      repo.insert(makeEntry({ content: `findme item ${i}`, sessionId: `session-${i}` }));
    }
    const results = repo.search('findme', 200);
    expect(results.length).toBeLessThanOrEqual(100);
  });

  it('escapes FTS5 special characters without throwing', () => {
    repo.insert(makeEntry({ content: 'hello world' }));
    // Should not throw on special chars like quotes, asterisks, etc.
    expect(() => repo.search('hello"world')).not.toThrow();
    expect(() => repo.search('test*')).not.toThrow();
    expect(() => repo.search('OR AND NOT')).not.toThrow();
  });

  it('escapeFts5Query wraps query as single quoted substring', () => {
    expect(repo.escapeFts5Query('foo bar')).toBe('"foo bar"');
    expect(repo.escapeFts5Query('src/utils/helper.ts')).toBe('"src/utils/helper.ts"');
  });

  it('searches substring matches with paths', () => {
    repo.insert(makeEntry({ content: 'file at projects/llm-provider-indexer/src/Indexer/providers' }));
    const results = repo.search('llm-provider-indexer/src/Indexer');
    expect(results).toHaveLength(1);
  });

  it('escapeFts5Value escapes double quotes', () => {
    expect(repo.escapeFts5Value('say "hello"')).toBe('say ""hello""');
  });

  it('returns timestamp in results', () => {
    repo.insert(makeEntry({ content: 'timestamped', timestamp: '2025-06-15T12:00:00Z' }));
    const results = repo.search('timestamped');
    expect(results[0].timestamp).toBe('2025-06-15T12:00:00Z');
  });
});
