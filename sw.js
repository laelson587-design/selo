/* Service worker do Selo.
 *
 * Guarda só a casca — as cinco coisas que fazem o app abrir. Os documentos
 * NÃO passam por aqui: eles moram no IndexedDB, cifrados, e cache de service
 * worker é texto em claro no disco. Guardar documento aqui desfaria tudo o que
 * o cofre faz.
 *
 * Serve do cache e busca a versão nova por trás, que entra na abertura
 * seguinte. Suba a VERSAO para forçar a limpeza imediata.
 */

const VERSAO = "selo-v4";

const CASCA = ["./", "./index.html", "./estilo.css", "./cofre.js", "./app.js",
               "./manifest.json", "./icone.svg", "./icone-192.png", "./icone-512.png"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (ev) => {
  const pedido = ev.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  ev.respondWith(caches.open(VERSAO).then(async (cache) => {
    const guardado = await cache.match(pedido, { ignoreSearch: true });
    const rede = fetch(pedido).then((r) => {
      if (r && r.ok) cache.put(pedido, r.clone());
      return r;
    }).catch(() => null);

    if (guardado) { ev.waitUntil(rede); return guardado; }
    const daRede = await rede;
    if (daRede) return daRede;
    if (pedido.mode === "navigate") {
      const inicial = await cache.match("./index.html");
      if (inicial) return inicial;
    }
    return new Response("Sem conexão.", { status: 503 });
  }));
});
