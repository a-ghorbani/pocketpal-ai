/**
 * Prompt rendering for knowledge-base retrieval hits.
 *
 * Retrieved excerpts are quoted under a source header so the model can
 * cite which file/chunk a claim came from, and the total quoted volume
 * is capped so retrieval can never crowd out the user's own text.
 */
import type {KbSearchHit} from '../store/KnowledgeBaseStore';

export const formatKbHitsForPrompt = (
  hits: KbSearchHit[],
  budgetChars: number,
): string => {
  if (hits.length === 0) {
    return '';
  }

  const parts: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const header =
      `--- Knowledge base: ${hit.docName} (chunk ${hit.position + 1}` +
      `, relevance ${hit.cosine.toFixed(2)}) ---`;
    let text = hit.text.trim();
    const remaining = budgetChars - used - header.length - 2;
    if (remaining <= 100) {
      break;
    }
    if (text.length > remaining) {
      text = `${text.slice(0, remaining)}...`;
    }
    parts.push(`${header}\n${text}`);
    used += header.length + text.length + 2;
  }

  if (parts.length === 0) {
    return '';
  }
  return `Quoted from the local knowledge base for this question:\n\n${parts.join('\n\n')}`;
};
