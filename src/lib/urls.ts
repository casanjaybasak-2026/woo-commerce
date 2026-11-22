export function mediaUrl(key: string): string {
  return "/media/" + key.split("/").map(encodeURIComponent).join("/");
}

export function absoluteUrl(siteUrl: string, path: string): string {
  return siteUrl.replace(/\/$/, "") + path;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
