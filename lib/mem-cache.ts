/**
 * In-memory LRU cache with TTL support.
 * Provides sub-millisecond lookups for repeat queries — no external dependencies.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number // Date.now() based
}

export class MemCache<T = unknown> {
  private readonly maxSize: number
  private readonly defaultTtlMs: number
  private readonly store = new Map<string, CacheEntry<T>>()

  constructor(opts: { maxSize?: number; defaultTtlMs?: number } = {}) {
    this.maxSize = opts.maxSize ?? 256
    this.defaultTtlMs = opts.defaultTtlMs ?? 30 * 60 * 1000 // 30 min default
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }

    // Move to end (most recently used) for LRU
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlMs?: number): void {
    // If key exists, delete first so it moves to end
    this.store.delete(key)

    // Evict oldest entries if at capacity
    while (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) this.store.delete(oldestKey)
      else break
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}

// ---------------------------------------------------------------------------
// Symptom normalization — creates a canonical key so equivalent queries hit
// the same cache entry regardless of word order, punctuation, or stop words.
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "i", "me", "my", "mine",
  "we", "our", "ours", "you", "your", "yours", "he", "him", "his", "she",
  "her", "hers", "it", "its", "they", "them", "their", "theirs", "am", "im",
  "ive", "that", "this", "these", "those", "what", "which", "who", "whom",
  "whose", "where", "when", "why", "how", "not", "no", "nor", "so", "if",
  "of", "in", "on", "at", "to", "for", "with", "about", "from", "by",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "up", "down", "out", "off", "over", "under", "again", "further", "then",
  "once", "also", "just", "very", "really", "quite", "too", "much", "more",
  "most", "less", "least", "than", "some", "any", "all", "both", "each",
  "few", "many", "several", "such", "own", "same", "other", "another",
  "been", "being", "having", "doing", "going", "get", "got", "getting",
  "feel", "feeling", "felt", "like", "since", "ago", "now", "still",
  "experiencing", "experience", "experiencing", "lot", "lots", "bit",
])

/**
 * Produce a normalized cache key from symptom text.
 * - lowercased
 * - punctuation removed
 * - stop words removed
 * - words sorted alphabetically
 *
 * This means "headache and fever for 2 days" and "fever, headache, 2 days"
 * both produce the same key: "2 days fever headache"
 */
export function normalizeSymptomKey(symptoms: string): string {
  const words = symptoms
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")   // strip punctuation
    .split(/\s+/)                     // split on whitespace
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))

  // Deduplicate and sort
  const unique = [...new Set(words)].sort()
  return unique.join(" ")
}

// ---------------------------------------------------------------------------
// Singleton cache instance for symptom analysis results
// ---------------------------------------------------------------------------

let _analysisCache: MemCache | null = null

export function getAnalysisCache(): MemCache {
  if (!_analysisCache) {
    _analysisCache = new MemCache({
      maxSize: 512,            // ~512 cached symptom queries
      defaultTtlMs: 60 * 60 * 1000, // 1 hour TTL
    })
  }
  return _analysisCache
}
