/* Selo — a tela.
 *
 * O cofre inteiro está no cofre.js; aqui é só o que a pessoa toca. A regra que
 * organiza este arquivo: nada que identifique alguém aparece antes de o cofre
 * abrir, e trancar volta tudo ao começo.
 */

"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const MINUTOS_ATE_TRANCAR = 5;
const LADO_MAIOR = 2000;      // foto de documento acima disso só pesa
const QUALIDADE = 0.82;

/* Os tipos e os números que cada um costuma pedir. É sugestão, não regra:
   qualquer campo pode ser acrescentado ou tirado, porque documento brasileiro
   sempre tem um número a mais que ninguém lembra. */
const TIPOS = {
  "": [],
  "RG": ["Número", "Órgão emissor", "Data de emissão"],
  "CPF": ["Número"],
  "CNH": ["Registro", "Número espelho", "Categoria"],
  "CTPS": ["Número", "Série"],
  "Título de eleitor": ["Número", "Zona", "Seção"],
  "PIS/PASEP": ["Número"],
  "Certidão": ["Matrícula", "Cartório"],
  "Diploma": ["Registro", "Instituição", "Curso"],
  "Passaporte": ["Número"],
  "Comprovante de residência": ["Referente a"],
  "Cartão do SUS": ["Número"],
  "Outro": [],
};

let docAtual = null;      // o documento aberto na tela, ainda não salvo
let relogioTranca = null;
let relogioAviso = null;

/* ------------------------------------------------------------------ o selo */

/**
 * O estado do selo na tela da tranca: "" (trancado), "pensando" (conferindo),
 * "aberto" (deu certo) ou "errou".
 *
 * O tremor precisa ser retirado à mão depois de tocar, senão só aconteceria
 * uma vez — a animação não reinicia sozinha com a classe já posta.
 */
function selo(estado) {
  const m = $("#marca");
  m.classList.remove("pensando", "aberto", "errou");
  if (!estado) return;
  if (estado === "errou") {
    // força o navegador a recalcular antes de repor a classe
    void m.offsetWidth;
  }
  m.classList.add(estado);
}

/* ------------------------------------------------------------- utilidades */

function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.remove("oculto");
  clearTimeout(relogioAviso);
  relogioAviso = setTimeout(() => el.classList.add("oculto"), 3600);
}

function irPara(nome) {
  $$(".tela").forEach((t) => t.classList.toggle("ativa", t.id === "tela-" + nome));
  window.scrollTo(0, 0);
}

function escapar(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function tamanhoBonito(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

function dataCurta(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function diasAte(iso) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(iso + "T00:00:00");
  return Math.round((alvo - hoje) / 86400000);
}

/* ------------------------------------------------- trancar sozinho
 *
 * Cofre aberto na mesa é cofre aberto. O relógio reinicia a cada toque, então
 * quem está usando não é interrompido — quem largou o celular é. */

function adiarTranca() {
  clearTimeout(relogioTranca);
  if (!cofreAberto()) return;
  relogioTranca = setTimeout(() => {
    trancarTudo();
    avisar("O cofre trancou sozinho.");
  }, MINUTOS_ATE_TRANCAR * 60000);
}

function cofreAberto() { return estaAberto(); }

function trancarTudo() {
  trancar();
  docAtual = null;
  clearTimeout(relogioTranca);
  $("#senha").value = "";
  $("#codigo-entrada").value = "";
  $("#passo-recuperar").classList.add("oculto");
  $("#lista").innerHTML = "";
  selo("");
  irPara("tranca");
}

/* --------------------------------------------------------------- a tranca */

async function pintarTranca() {
  const tem = await existeCofre();
  $("#passo-criar").classList.toggle("oculto", tem);
  $("#passo-abrir").classList.toggle("oculto", !tem);
  // O caminho de volta tem de estar à vista justamente quando não há cofre:
  // é o aparelho novo, ou o navegador que apagou tudo.
  $("#passo-restaurar").classList.toggle("oculto", tem);
  $("#passo-codigo").classList.add("oculto");
  irPara("tranca");
}

async function criar() {
  const s1 = $("#senha-nova").value;
  const s2 = $("#senha-nova2").value;
  if (s1 !== s2) { selo("errou"); return avisar("As duas senhas não são iguais."); }
  selo("pensando");
  try {
    const codigo = await criarCofre(s1);
    selo("aberto");
    $("#codigo").textContent = codigo;
    $("#passo-criar").classList.add("oculto");
    $("#passo-codigo").classList.remove("oculto");
    $("#senha-nova").value = $("#senha-nova2").value = "";
  } catch (e) {
    selo("errou");
    avisar(e.message);
  }
}

async function abrir(comCodigo) {
  const segredo = comCodigo ? $("#codigo-entrada").value : $("#senha").value;
  if (!segredo) return avisar(comCodigo ? "Digite o código." : "Digite a senha.");
  selo("pensando");
  let ok;
  try {
    ok = await abrirCofre(segredo, comCodigo);
  } catch (e) {
    selo("errou");
    return avisar(e.message);
  }
  if (!ok) {
    selo("errou");
    return avisar(comCodigo ? "Esse código não abre." : "Senha errada.");
  }

  selo("aberto");
  $("#senha").value = $("#codigo-entrada").value = "";
  // A meia dúzia de décimos aqui é de propósito: é o tempo de o selo virar
  // verde e a fechadura virar visto. Sem essa pausa, a confirmação seria
  // pintada e apagada no mesmo quadro, e ninguém veria.
  await new Promise((f) => setTimeout(f, 620));
  await entrar();
}

async function entrar() {
  adiarTranca();
  await pintarLista();
  irPara("lista");
}

/* ---------------------------------------------------------------- a lista */

async function pintarLista() {
  const busca = ($("#busca").value || "").trim().toLowerCase();
  const docs = await listarDocumentos();

  pintarVencendo(docs);

  const vistos = docs.filter((d) => {
    if (!busca) return true;
    const alvo = [d.titulo, d.tipo, d.titular, ...Object.values(d.campos || {})]
      .join(" ").toLowerCase();
    return alvo.includes(busca);
  });

  const lista = $("#lista");
  if (!vistos.length) {
    lista.innerHTML = `<p class="vazio">${docs.length
      ? "Nada com esse nome."
      : "Ainda não há nada aqui.<br>Comece guardando um documento — ou criando a ficha de um que você precisa recuperar."}</p>`;
    return;
  }

  lista.innerHTML = vistos.map((d) => {
    const classe = d.situacao === "TENHO" ? "tenho"
      : d.situacao === "FALTA_DIGITALIZAR" ? "falta" : "perdi";
    const partes = [];
    if (d.titular) partes.push(d.titular);
    if (d.situacao === "FALTA_DIGITALIZAR") partes.push("falta digitalizar");
    else if (d.situacao === "A_RECUPERAR") partes.push("a recuperar");
    else if (d.arquivos.length) {
      partes.push(`${d.arquivos.length} ${d.arquivos.length === 1 ? "arquivo" : "arquivos"}`);
    }
    if (d.validade) partes.push("vence " + dataCurta(d.validade));
    return `<button class="item ${classe}" data-doc="${escapar(d.id)}">
      <span class="cresce">
        <span class="nome">${escapar(d.titulo || "Sem nome")}</span>
        <span class="sub">${escapar(partes.join(" · "))}</span>
      </span>
      <span class="seta">›</span>
    </button>`;
  }).join("");
}

/**
 * O que está vencendo. É o "lembrar o que você esqueceria": CNH e passaporte
 * vencem, e comprovante de residência só serve se for recente — descobrir isso
 * no balcão é tarde.
 */
function pintarVencendo(docs) {
  const perto = docs
    .filter((d) => d.validade)
    .map((d) => ({ d, dias: diasAte(d.validade) }))
    .filter((x) => x.dias <= 60)
    .sort((a, b) => a.dias - b.dias);

  const el = $("#vencendo");
  el.classList.toggle("oculto", !perto.length);
  if (!perto.length) return;

  el.innerHTML = perto.map(({ d, dias }) =>
    `<b>${escapar(d.titulo || "Documento")}</b>` +
    (dias < 0 ? `venceu em ${dataCurta(d.validade)}`
      : dias === 0 ? "vence hoje"
      : `vence em ${dias} ${dias === 1 ? "dia" : "dias"} (${dataCurta(d.validade)})`)
  ).join("<br>");
}

/* ------------------------------------------------------------ o documento */

function novoDocumento() {
  docAtual = {
    titulo: "", tipo: "", titular: "", situacao: "TENHO",
    campos: {}, validade: null, ondeRecuperar: "", arquivos: [],
  };
  pintarDocumento();
  irPara("doc");
}

async function abrirDocumento(id) {
  docAtual = await lerDocumento(id);
  if (!docAtual) return avisar("Esse documento não está mais aqui.");
  pintarDocumento();
  irPara("doc");
}

function pintarDocumento() {
  const d = docAtual;
  $("#doc-titulo-topo").textContent = d.titulo || "Novo documento";
  $("#doc-titulo").value = d.titulo || "";
  $("#doc-tipo").value = d.tipo || "";
  $("#doc-titular").value = d.titular || "";
  $("#doc-situacao").value = d.situacao || "TENHO";
  $("#doc-validade").value = d.validade || "";
  $("#doc-recuperar").value = d.ondeRecuperar || "";
  $("#apagar-doc").classList.toggle("oculto", !d.id);
  pintarSituacao();
  pintarCampos();
  pintarArquivos();
}

function pintarSituacao() {
  $("#campo-recuperar").classList.toggle("oculto", $("#doc-situacao").value !== "A_RECUPERAR");
}

function pintarCampos() {
  const pares = Object.entries(docAtual.campos || {});
  $("#doc-campos").innerHTML = pares.map(([nome, valor], i) => `
    <div class="par" data-i="${i}">
      <input class="nome-campo" type="text" value="${escapar(nome)}" placeholder="Número">
      <input class="valor-campo" type="text" value="${escapar(valor)}" placeholder="…">
      <button class="icone copiar" title="Copiar">⧉</button>
      <button class="icone tirar" title="Tirar">×</button>
    </div>`).join("");
}

/** Lê os pares da tela de volta para o documento. Vazio dos dois lados some. */
function recolherCampos() {
  const campos = {};
  $$("#doc-campos .par").forEach((p) => {
    const nome = p.querySelector(".nome-campo").value.trim();
    const valor = p.querySelector(".valor-campo").value.trim();
    if (nome || valor) campos[nome || "Número"] = valor;
  });
  return campos;
}

async function pintarArquivos() {
  const el = $("#doc-arquivos");
  const arqs = docAtual.arquivos || [];
  if (!arqs.length) {
    el.innerHTML = `<p class="vazio">Nenhum arquivo ainda.</p>`;
    return;
  }
  el.innerHTML = arqs.map((a) => `
    <div class="arquivo" data-arq="${escapar(a.id)}">
      ${a.tipo.startsWith("image/")
        ? `<img alt="" data-miniatura="${escapar(a.id)}">`
        : `<span class="selo-tipo">PDF</span>`}
      <span class="cresce">
        <span class="nome">${escapar(a.nome)}</span>
        <span class="sub">${tamanhoBonito(a.tamanho)}</span>
      </span>
      <button class="icone ver" title="Abrir">↗</button>
      <button class="icone tirar-arq" title="Tirar">×</button>
    </div>`).join("");

  // As miniaturas só existem decifradas, então são montadas uma a uma depois
  // de a lista estar na tela — senão a tela ficaria esperando o cofre.
  for (const a of arqs.filter((x) => x.tipo.startsWith("image/"))) {
    const bytes = await lerArquivo(a.id).catch(() => null);
    if (!bytes) continue;
    const img = el.querySelector(`[data-miniatura="${a.id}"]`);
    if (img) img.src = URL.createObjectURL(new Blob([bytes], { type: a.tipo }));
  }
}

async function salvarDocumento() {
  const d = docAtual;
  d.titulo = $("#doc-titulo").value.trim();
  d.tipo = $("#doc-tipo").value;
  d.titular = $("#doc-titular").value.trim();
  d.situacao = $("#doc-situacao").value;
  d.validade = $("#doc-validade").value || null;
  d.ondeRecuperar = $("#doc-recuperar").value.trim();
  d.campos = recolherCampos();

  if (!d.titulo) return avisar("Dê um nome ao documento.");

  docAtual = await guardarDocumento(d);
  await pintarLista();
  irPara("lista");
  avisar("Guardado.");
}

/* --------------------------------------------------------- pôr arquivo
 *
 * Foto de documento em tamanho de câmera são 4 MB por lado, e o aparelho não
 * aguenta muitos. Reduzir o lado maior e passar para preto e branco deixa o
 * papel MAIS legível e muito mais leve — é o mesmo truque do "digitalizar" do
 * celular, sem a parte cara, que é endireitar a perspectiva.
 */

function lerComo(arquivo, como) {
  return new Promise((aceita, recusa) => {
    const l = new FileReader();
    l.onload = () => aceita(l.result);
    l.onerror = () => recusa(l.error);
    if (como === "bytes") l.readAsArrayBuffer(arquivo);
    else l.readAsDataURL(arquivo);
  });
}

function carregarImagem(url) {
  return new Promise((aceita, recusa) => {
    const img = new Image();
    img.onload = () => aceita(img);
    img.onerror = () => recusa(new Error("não deu para ler a imagem"));
    img.src = url;
  });
}

async function prepararImagem(arquivo, limpar) {
  const img = await carregarImagem(await lerComo(arquivo, "url"));
  const escala = Math.min(1, LADO_MAIOR / Math.max(img.width, img.height));
  const l = Math.round(img.width * escala);
  const a = Math.round(img.height * escala);

  const tela = document.createElement("canvas");
  tela.width = l; tela.height = a;
  const p = tela.getContext("2d");
  p.drawImage(img, 0, 0, l, a);

  if (limpar) {
    const dados = p.getImageData(0, 0, l, a);
    const px = dados.data;
    for (let i = 0; i < px.length; i += 4) {
      // Cinza pela luminância, e depois contraste puxado em torno do meio:
      // papel fica branco, tinta fica preta, e a sombra da mão some.
      const cinza = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      const forte = Math.max(0, Math.min(255, (cinza - 128) * 1.7 + 140));
      px[i] = px[i + 1] = px[i + 2] = forte;
    }
    p.putImageData(dados, 0, 0);
  }

  const blob = await new Promise((r) => tela.toBlob(r, "image/jpeg", QUALIDADE));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: "image/jpeg" };
}

async function porArquivos(lista, ehFoto) {
  const limpar = ehFoto && $("#limpar-foto").checked;
  let postos = 0;
  for (const arquivo of lista) {
    try {
      let bytes, tipo, nome = arquivo.name || "documento";
      if (arquivo.type.startsWith("image/")) {
        const pronto = await prepararImagem(arquivo, limpar);
        bytes = pronto.bytes; tipo = pronto.tipo;
        nome = nome.replace(/\.[^.]+$/, "") + ".jpg";
      } else {
        // PDF entra intacto. O da CNH e o da CTPS valem pelo código de
        // validação que trazem dentro — mexer neles seria estragar o que eles
        // têm de melhor.
        bytes = new Uint8Array(await lerComo(arquivo, "bytes"));
        tipo = arquivo.type || "application/pdf";
      }
      docAtual.arquivos.push(await guardarArquivo(nome, tipo, bytes));
      postos++;
    } catch (e) {
      console.error(e);
      avisar("Não deu para guardar " + (arquivo.name || "o arquivo") + ".");
    }
  }
  if (postos) {
    await pintarArquivos();
    avisar(postos === 1 ? "Arquivo guardado." : `${postos} arquivos guardados.`);
  }
}

async function verArquivo(id) {
  const ficha = docAtual.arquivos.find((a) => a.id === id);
  const bytes = await lerArquivo(id);
  if (!bytes) return avisar("Esse arquivo não está mais aqui.");
  const blob = new Blob([bytes], { type: ficha.tipo });

  // Compartilhar é o que serve para anexar num formulário; abrir numa aba é o
  // que sobra onde compartilhar arquivo não existe.
  const arquivo = new File([blob], ficha.nome, { type: ficha.tipo });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo] }); return; }
    catch (e) { /* cancelar não é erro */ }
  }
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---------------------------------------------------------------- a cópia */

async function exportarCopia() {
  const pacote = await exportar();
  const texto = JSON.stringify(pacote);
  const blob = new Blob([texto], { type: "application/json" });
  const nome = "selo-copia-" + new Date().toISOString().slice(0, 10) + ".selo";

  const arquivo = new File([blob], nome, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: "Cópia do Selo" });
      marcarCopia();
      return;
    } catch (e) { /* cancelou */ }
  }

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  marcarCopia();
}

function marcarCopia() {
  try { localStorage.setItem("selo.copiaEm", new Date().toISOString()); } catch (e) {}
  pintarAjustes();
  avisar("Cópia tirada. Guarde em mais de um lugar.");
}

async function restaurarDe(arquivo, jaEstouDentro) {
  let pacote;
  try {
    pacote = JSON.parse(await arquivo.text());
  } catch (e) {
    return avisar("Não deu para ler esse arquivo.");
  }
  const segredo = prompt(
    "Digite a senha do cofre desta cópia.\n\n" +
    "Se não lembrar, digite o código de recuperação — ele também abre.");
  if (!segredo) return;

  // O código tem traços e só letras e números; a senha é frase. Chutar errado
  // não custa nada: se a primeira porta não abrir, tenta a outra.
  const pareceCodigo = /^[0-9A-Za-z-\s]+$/.test(segredo) && !/\s{2}/.test(segredo)
    && segredo.replace(/[^0-9A-Za-z]/g, "").length >= 24;

  let ok = false;
  try {
    ok = await restaurar(pacote, segredo, pareceCodigo, false);
    if (!ok) ok = await restaurar(pacote, segredo, !pareceCodigo, false);
  } catch (e) {
    return avisar(e.message);
  }
  if (!ok) return avisar("Nem a senha nem o código abriram essa cópia.");

  if (jaEstouDentro) avisar("Cópia restaurada. Ela substituiu o que estava aqui.");
  else avisar("Pronto, seus documentos voltaram.");
  await entrar();
}

/* -------------------------------------------------------------- ajustes */

function pintarAjustes() {
  let quando = null;
  try { quando = localStorage.getItem("selo.copiaEm"); } catch (e) {}
  const el = $("#ultima-copia");
  el.textContent = quando
    ? "Última cópia: " + dataCurta(quando)
    : "Você ainda não tirou nenhuma cópia.";

  const dias = quando ? -diasAte(quando.slice(0, 10)) : 999;
  const cobra = $("#cobranca");
  cobra.classList.toggle("oculto", dias < 30);
  if (dias >= 30) {
    cobra.innerHTML = quando
      ? `<b>Sua cópia está velha</b>Faz ${dias} dias. Documento que entrou depois disso não está em lugar nenhum além deste aparelho.`
      : `<b>Você ainda não tem cópia</b>Enquanto não tirar uma, perder o celular é perder tudo de novo.`;
  }
}

/* ------------------------------------------------------------------ ligar */

function ligar() {
  // Qualquer toque adia a tranca automática.
  ["click", "keydown", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, adiarTranca, { passive: true }));

  $("#criar").addEventListener("click", criar);
  $("#guardei").addEventListener("change", (e) => {
    $("#entrar-primeira").disabled = !e.target.checked;
  });
  $("#entrar-primeira").addEventListener("click", entrar);
  $("#copiar-codigo").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#codigo").textContent);
      avisar("Código copiado. Cole num lugar seguro.");
    } catch (e) { avisar("Não deu para copiar — anote à mão."); }
  });
  $("#imprimir-codigo").addEventListener("click", () => window.print());

  $("#abrir").addEventListener("click", () => abrir(false));
  $("#senha").addEventListener("keydown", (e) => { if (e.key === "Enter") abrir(false); });
  $("#esqueci").addEventListener("click", () => {
    $("#passo-recuperar").classList.toggle("oculto");
  });
  $("#abrir-codigo").addEventListener("click", () => abrir(true));
  $("#codigo-entrada").addEventListener("keydown", (e) => { if (e.key === "Enter") abrir(true); });

  $("#escolher-copia").addEventListener("click", () => $("#arquivo-copia").click());
  $("#arquivo-copia").addEventListener("change", (e) => {
    if (e.target.files[0]) restaurarDe(e.target.files[0], false);
    e.target.value = "";
  });

  $("#trancar").addEventListener("click", () => { trancarTudo(); avisar("Trancado."); });
  $("#busca").addEventListener("input", pintarLista);
  $("#novo").addEventListener("click", novoDocumento);
  $("#ir-ajustes").addEventListener("click", () => { pintarAjustes(); irPara("ajustes"); });
  $("#voltar-ajustes").addEventListener("click", () => irPara("lista"));

  $("#lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-doc]");
    if (b) abrirDocumento(b.dataset.doc);
  });

  $("#voltar").addEventListener("click", async () => { await pintarLista(); irPara("lista"); });
  $("#doc-situacao").addEventListener("change", pintarSituacao);
  $("#doc-tipo").addEventListener("change", () => {
    // Trocar o tipo sugere os números daquele documento, sem apagar o que já
    // foi digitado: sugestão que apaga trabalho não é sugestão, é armadilha.
    const jaTem = recolherCampos();
    for (const nome of TIPOS[$("#doc-tipo").value] || []) {
      if (!(nome in jaTem)) jaTem[nome] = "";
    }
    docAtual.campos = jaTem;
    pintarCampos();
  });
  $("#add-campo").addEventListener("click", () => {
    docAtual.campos = { ...recolherCampos(), "": "" };
    pintarCampos();
  });
  $("#doc-campos").addEventListener("click", async (e) => {
    const par = e.target.closest(".par");
    if (!par) return;
    if (e.target.classList.contains("tirar")) {
      par.remove();
    } else if (e.target.classList.contains("copiar")) {
      const v = par.querySelector(".valor-campo").value;
      try { await navigator.clipboard.writeText(v); avisar("Copiado."); }
      catch (err) { avisar("Não deu para copiar."); }
    }
  });

  $("#da-camera").addEventListener("click", () => $("#ent-camera").click());
  $("#da-galeria").addEventListener("click", () => $("#ent-galeria").click());
  $("#do-arquivo").addEventListener("click", () => $("#ent-arquivo").click());
  $("#ent-camera").addEventListener("change", (e) => {
    porArquivos(Array.from(e.target.files), true); e.target.value = "";
  });
  $("#ent-galeria").addEventListener("change", (e) => {
    porArquivos(Array.from(e.target.files), true); e.target.value = "";
  });
  $("#ent-arquivo").addEventListener("change", (e) => {
    porArquivos(Array.from(e.target.files), false); e.target.value = "";
  });

  $("#doc-arquivos").addEventListener("click", (e) => {
    const linha = e.target.closest("[data-arq]");
    if (!linha) return;
    const id = linha.dataset.arq;
    if (e.target.classList.contains("ver")) verArquivo(id);
    else if (e.target.classList.contains("tirar-arq")) {
      if (!confirm("Tirar este arquivo do documento?\n\nNão tem como voltar atrás.")) return;
      docAtual.arquivos = docAtual.arquivos.filter((a) => a.id !== id);
      pintarArquivos();
    }
  });

  $("#salvar-doc").addEventListener("click", salvarDocumento);
  $("#apagar-doc").addEventListener("click", async () => {
    if (!docAtual.id) return;
    if (!confirm(`Apagar ${docAtual.titulo || "este documento"} e os arquivos dele?\n\nNão tem como voltar atrás.`)) return;
    await apagarDocumento(docAtual.id);
    await pintarLista();
    irPara("lista");
    avisar("Apagado.");
  });

  $("#exportar").addEventListener("click", exportarCopia);
  $("#restaurar-aqui").addEventListener("click", () => {
    if (!confirm("Restaurar substitui o que está neste aparelho pelo que vier da cópia.\n\nContinuar?")) return;
    $("#arquivo-copia2").click();
  });
  $("#arquivo-copia2").addEventListener("change", (e) => {
    if (e.target.files[0]) restaurarDe(e.target.files[0], true);
    e.target.value = "";
  });

  $("#trocar-senha").addEventListener("click", async () => {
    const nova = $("#senha-troca").value;
    try {
      await trocarSenha(nova);
      $("#senha-troca").value = "";
      avisar("Senha trocada. O código de recuperação continua o mesmo.");
    } catch (e) { avisar(e.message); }
  });

  $("#novo-codigo").addEventListener("click", async () => {
    if (!confirm("Gerar um código novo faz o anterior deixar de valer.\n\nContinuar?")) return;
    try {
      const c = await trocarCodigo();
      const el = $("#codigo-novo");
      el.textContent = c;
      el.classList.remove("oculto");
      avisar("Código novo. Imprima e guarde — ele não aparece de novo.");
    } catch (e) { avisar(e.message); }
  });
}

async function comecar() {
  $("#doc-tipo").innerHTML = Object.keys(TIPOS)
    .map((t) => `<option value="${escapar(t)}">${escapar(t || "—")}</option>`).join("");

  ligar();
  await pintarTranca();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Pede ao navegador que não jogue fora os dados quando o aparelho apertar.
  // Aqui isso é mais sério que em app de recado: o que ele apagaria é a única
  // cópia digital de um documento.
  let fixado = null;
  if (navigator.storage && navigator.storage.persist) {
    fixado = await navigator.storage.persist().catch(() => null);
  }
  $("#onde-mora").innerHTML = "Tudo fica neste aparelho, cifrado. Nada sobe para servidor nenhum.<br>" +
    (fixado === true
      ? "Este aparelho promete não apagar os dados sozinho."
      : "<b>O aparelho pode apagar estes dados se ficar sem espaço.</b> A cópia é o que resolve de vez.");
}

comecar().catch((e) => console.error("não deu para começar", e));
