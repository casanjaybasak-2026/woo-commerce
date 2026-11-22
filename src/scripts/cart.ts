// Browser-side cart: a list of product ids in localStorage. Prices are always computed on the server.
const KEY = "shelfmade:cart";

export function getCart(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent("cart:change", { detail: ids }));
}

export function addToCart(id: string) {
  const ids = getCart();
  if (!ids.includes(id)) save([...ids, id]);
}

export function removeFromCart(id: string) {
  save(getCart().filter((x) => x !== id));
}

export function setCart(ids: string[]) {
  save(ids);
}

export function clearCart() {
  save([]);
}

export function syncBadge() {
  const n = getCart().length;
  document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
    el.textContent = String(n);
    el.hidden = n === 0;
  });
  document.querySelectorAll<HTMLElement>("[data-cart-live]").forEach((el) => {
    el.textContent = `${n} item${n === 1 ? "" : "s"} in cart`;
  });
}

window.addEventListener("cart:change", syncBadge);
window.addEventListener("storage", (e) => e.key === KEY && syncBadge());
syncBadge();
