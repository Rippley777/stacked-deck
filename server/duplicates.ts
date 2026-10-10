import {
  hasDuplicateIdentity,
  matchingCandidates,
  possibleDuplicates,
  type DuplicateDraft,
} from '../shared/duplicates.js';
import type { UserRepository } from './store.js';

export async function findDuplicateCandidates(repository: UserRepository, draft: DuplicateDraft) {
  if (!hasDuplicateIdentity(draft)) return { items: [], total: 0 };
  // Owner-filtered identifier projection avoids hydrating thousands of cards, tags and valuations.
  // Normalize in one place for identical SQLite/Azure SQL behavior and conservative punctuation handling.
  const candidates = matchingCandidates(draft, await repository.duplicateIdentities());
  const inventory = await repository.inventory(candidates.slice(0, 12).map((c) => c.item.id));
  return { items: possibleDuplicates(draft, inventory), total: candidates.length };
}
