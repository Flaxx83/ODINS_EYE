import { parseTravelTime } from './travel-input.js';

/** Preserve literal endpoints; this verifies a selected trip tool, not its intent. */
export function explicitTripDetails(message, now) {
  const clean = parseTravelTime(message, now).clean;
  const sentences = clean
    .split(/[.!?]\s+(?=jag\b)/i)
    .map((s) => s.replace(/[.!?]+$/, '').trim())
    .filter(Boolean);
  const result = {};
  for (const sentence of sentences) {
    const route = sentence.match(/\bfrån\s+(.+?)(?:\s+till\s+(.+)|$)/i);
    if (route) {
      result.origin = route[1].trim();
      if (route[2]) result.destination = route[2].trim();
    }
    const arrive = sentence.match(
      /\bjag\s+(?:behöver|måste|ska|vill)\s+(?:vara|komma|anlända)\s+(?:(?:i|på|till)\s+)?(.+)$/i,
    );
    if (arrive && !/\bfrån\b/i.test(sentence)) {
      result.destination = arrive[1].trim();
      result.arrival = true;
    }
  }
  // An explicit departure takes precedence over a home address mentioned as context.
  if (!result.origin) {
    const home = sentences
      .map((s) => s.match(/\bjag\s+bor\s+(?:på|vid)\s+(.+)$/i)?.[1])
      .filter(Boolean);
    const addresses = home.filter((a) =>
      /(?:\s+i\s+|,\s*(?:\d{3}\s?\d{2}\s+)?)\p{L}/iu.test(a),
    );
    if (addresses.length === 1) result.origin = addresses[0].trim();
    else if (addresses.length > 1) result.ambiguous = true;
  }
  return result;
}
