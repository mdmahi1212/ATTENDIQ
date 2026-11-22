/**
 * Rule F: a random id for this phone's browser (kept in localStorage), sent with self-verify so the server can bind
 * the student to one phone. It identifies nothing about the person; the server stores only its SHA-256.
 */
const KEY = "aiq-device-id";

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID(); // storage blocked: a new id each time (the server then asks for an admin reset)
  }
}

/** Short readable label for the admin ("Android · Chrome"), from the user agent. */
export function deviceLabel(ua: string): string {
  const os = /iphone|ipad/i.test(ua) ? "iPhone" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : "Other";
  const br = /edg\//i.test(ua) ? "Edge" : /crios|chrome/i.test(ua) ? "Chrome" : /fxios|firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Browser";
  return `${os} · ${br}`;
}
