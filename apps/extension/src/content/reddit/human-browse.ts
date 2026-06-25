export type BrowseProgress = (step: string) => void;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function humanPause(minMs: number, maxMs: number): Promise<void> {
  await sleep(randomBetween(minMs, maxMs));
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

async function typeHumanLike(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string
): Promise<void> {
  element.focus();
  element.value = "";
  element.dispatchEvent(new Event("input", { bubbles: true }));

  for (const char of text) {
    element.value += char;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await humanPause(45, 140);
  }
}

function dispatchClick(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
  );
}

export async function scrollLikeHuman(steps = 3): Promise<void> {
  for (let i = 0; i < steps; i += 1) {
    window.scrollBy({
      top: randomBetween(180, 520),
      behavior: "smooth",
    });
    await humanPause(400, 1100);
  }
}

export async function navigateToSubreddit(
  subreddit: string,
  onProgress?: BrowseProgress
): Promise<void> {
  const clean = subreddit.replace(/^r\//i, "").trim();
  onProgress?.(`Opening r/${clean}/new…`);
  const target = `https://www.reddit.com/r/${clean}/new/`;
  if (!location.href.startsWith(target)) {
    location.href = target;
    await humanPause(2500, 4500);
  }
  await scrollLikeHuman(2 + Math.floor(Math.random() * 2));
  await humanPause(500, 1200);
}

export async function searchKeywordInUi(
  keyword: string,
  onProgress?: BrowseProgress
): Promise<void> {
  onProgress?.(`Searching Reddit for "${keyword}"…`);

  const searchInput = document.querySelector(
    'input[type="search"], input[name="q"], #header-search-bar input, faceplate-search-input input'
  ) as HTMLInputElement | null;

  if (searchInput) {
    dispatchClick(searchInput);
    await humanPause(200, 500);
    await typeHumanLike(searchInput, keyword);
    await humanPause(300, 700);
    searchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    searchInput.form?.requestSubmit();
    await humanPause(2000, 3500);
    await scrollLikeHuman(2 + Math.floor(Math.random() * 2));
    return;
  }

  const encoded = encodeURIComponent(keyword);
  location.href = `https://www.reddit.com/search/?q=${encoded}&sort=new&t=week`;
  await humanPause(2000, 3500);
  await scrollLikeHuman(2 + Math.floor(Math.random() * 2));
}

export async function skimPostLinks(maxClicks: number, onProgress?: BrowseProgress): Promise<void> {
  const links = Array.from(
    document.querySelectorAll(
      'a[data-testid="post-title"], a[slot="title"], a.title, shreddit-post a[href*="/comments/"]'
    )
  ).slice(0, 8);

  if (links.length === 0) return;

  const picks = shuffle(links).slice(0, Math.min(maxClicks, 2));
  for (const link of picks) {
    onProgress?.("Skimming a thread…");
    dispatchClick(link);
    await humanPause(1500, 2800);
    await scrollLikeHuman(1 + Math.floor(Math.random() * 2));
    history.back();
    await humanPause(1200, 2200);
  }
}
