const KEY = 'shogi.tutorial.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDone(): Set<string> {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { done?: unknown }).done)) {
      return new Set((parsed as { done: unknown[] }).done.filter((item): item is string => typeof item === 'string'));
    }
  } catch {
    // 壊れたデータは無視して最初から
  }
  return new Set();
}

export function saveDone(done: ReadonlySet<string>): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ done: [...done] }));
  } catch {
    // 保存できない環境（プライベートモード等）では進捗を持たない
  }
}

export function resetDone(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // noop
  }
}
