const THROTTLE_PATTERNS = [
  /verify you are human/i,
  /captcha/i,
  /too many requests/i,
  /rate limit/i,
  /try again later/i,
  /temporarily blocked/i,
  /suspicious activity/i,
  /account suspended/i,
  /please log in/i,
  /something went wrong.*try again/i,
];

export function detectThrottleFromText(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  for (const pattern of THROTTLE_PATTERNS) {
    if (pattern.test(normalized)) {
      return `Reddit throttle detected: ${pattern.source}`;
    }
  }
  return null;
}

export function detectThrottleFromDocument(doc: Document = document): string | null {
  const bodyText = doc.body?.innerText ?? "";
  const title = doc.title ?? "";
  const combined = `${title}\n${bodyText}`;
  return detectThrottleFromText(combined);
}

export function isVerificationPage(url: string): boolean {
  return (
    url.includes("/captcha") ||
    url.includes("/verify") ||
    url.includes("challenge")
  );
}
