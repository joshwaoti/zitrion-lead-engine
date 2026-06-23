/**
 * Tolerant JSON extraction for free-model output.
 */
export function extractJson(text: string): unknown {
  const cleaned = stripFences(text).trim();
  if (cleaned.length === 0) return undefined;

  const direct = tryParse(cleaned);
  if (direct !== FAILED) return direct;

  const match = cleaned.match(/[{[][\s\S]*[}\]]/);
  if (match) {
    const block = tryParse(match[0]);
    if (block !== FAILED) return block;
  }
  return undefined;
}

const FAILED = Symbol("failed");

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return FAILED;
  }
}

function stripFences(text: string): string {
  return text.replace(/```(?:json)?/gi, "").replace(/```/g, "");
}
