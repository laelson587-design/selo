/* Selo — o cofre.
 *
 * Aqui mora a única coisa deste app que não pode estar errada: os documentos
 * saem daqui cifrados e voltam inteiros, ou não saem.
 *
 * O desenho tem duas portas para o mesmo cofre, e isso é de propósito. Um app
 * feito para quem já perdeu documento não pode ter como único ponto de falha
 * "lembre-se desta frase".
 *
 *   senha ────┐
 *             ├──► abrem a chave-mestra ──► abre os documentos
 *   código ───┘
 *
 * A chave-mestra é sorteada uma vez e nunca sai daqui. O que fica guardado são
 * duas cópias dela, cada uma trancada por um lado. Perder as duas é o único
 * jeito de perder o cofre — e o código de recuperação sozinho, sem o arquivo,
 * é um monte de letras que não abre nada. Por isso ele pode ficar impresso na
 * casa de outra pessoa sem risco nenhum.
 *
 * Nada de criptografia caseira: quem cifra é o WebCrypto, que já vem no
 * navegador. AES-GCM de 256 bits para os dados, PBKDF2 para transformar a
 * senha em chave. O GCM também autentica — arquivo mexido não decifra, ele
 * falha, e é assim que a restauração percebe cópia corrompida.
 */

"use strict";

const VOLTAS_SENHA = 310000;   // PBKDF2 para senha de gente, que é fraca
const VOLTAS_CODIGO = 100000;  // o código é sorteado e já tem 160 bits
const TAMANHO_IV = 12;         // o que o AES-GCM espera

/* ------------------------------------------------------------- o depósito
 *
 * Onde os bytes ficam. No navegador é o IndexedDB — localStorage não serve,
 * documento é megabyte e ele guarda texto e pouco. O teste troca por um
 * depósito de memória, e é assim que ele roda no Node sem navegador nenhum.
 */

const LOJAS = ["cofre", "documentos", "arquivos"];

function depositoNaMemoria() {
  const lojas = {};
  for (const l of LOJAS) lojas[l] = new Map();
  return {
    async pegar(loja, chave) { return lojas[loja].get(chave) || null; },
    async por(loja, chave, valor) { lojas[loja].set(chave, valor); },
    async tirar(loja, chave) { lojas[loja].delete(chave); },
    async tudo(loja) { return Array.from(lojas[loja].values()); },
    async limpar() { for (const l of LOJAS) lojas[l].clear(); },
  };
}

function depositoIndexedDB() {
  let banco = null;

  function abrir() {
    if (banco) return Promise.resolve(banco);
    return new Promise((aceita, recusa) => {
      const p = indexedDB.open("selo", 1);
      p.onupgradeneeded = () => {
        for (const l of LOJAS) {
          if (!p.result.objectStoreNames.contains(l)) p.result.createObjectStore(l);
        }
      };
      p.onsuccess = () => { banco = p.result; aceita(banco); };
      p.onerror = () => recusa(p.error);
    });
  }

  function transacao(loja, modo, faz) {
    return abrir().then((b) => new Promise((aceita, recusa) => {
      const t = b.transaction(loja, modo);
      const pedido = faz(t.objectStore(loja));
      t.oncomplete = () => aceita(pedido ? pedido.result : undefined);
      t.onerror = () => recusa(t.error);
    }));
  }

  return {
    pegar: (loja, chave) => transacao(loja, "readonly", (s) => s.get(chave)),
    por: (loja, chave, valor) => transacao(loja, "readwrite", (s) => s.put(valor, chave)),
    tirar: (loja, chave) => transacao(loja, "readwrite", (s) => s.delete(chave)),
    tudo: (loja) => transacao(loja, "readonly", (s) => s.getAll()),
    async limpar() {
      for (const l of LOJAS) await transacao(l, "readwrite", (s) => s.clear());
    },
  };
}

let deposito = typeof indexedDB !== "undefined" ? depositoIndexedDB() : depositoNaMemoria();

/** O teste troca o depósito por um de memória antes de qualquer coisa. */
function usarDeposito(d) { deposito = d; }

/* ----------------------------------------------------------------- bytes */

const cripto = (typeof crypto !== "undefined" ? crypto : null);

function sortear(n) {
  return cripto.getRandomValues(new Uint8Array(n));
}

function daTexto(s) { return new TextEncoder().encode(s); }
function praTexto(b) { return new TextDecoder().decode(b); }

/* Base64 na mão porque o app roda em navegador e em Node, e as duas casas têm
   caminhos diferentes para isso. Chunk de 8k para não estourar a pilha do
   apply() com arquivo grande. */
function praBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}

function daBase64(texto) {
  const bruto = atob(texto);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

/* --------------------------------------------------------- chaves e cifra */

async function chaveDeSegredo(segredo, sal, voltas) {
  const material = await cripto.subtle.importKey(
    "raw", daTexto(segredo), "PBKDF2", false, ["deriveKey"]);
  return cripto.subtle.deriveKey(
    { name: "PBKDF2", salt: sal, iterations: voltas, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]);
}

async function cifrar(chave, bytes) {
  const iv = sortear(TAMANHO_IV);
  const selado = new Uint8Array(
    await cripto.subtle.encrypt({ name: "AES-GCM", iv }, chave, bytes));
  // O IV não é segredo, mas precisa vir junto para a abertura. Fica colado na
  // frente: um blob só, um lugar só de onde tirar.
  const junto = new Uint8Array(iv.length + selado.length);
  junto.set(iv, 0);
  junto.set(selado, iv.length);
  return junto;
}

async function decifrar(chave, junto) {
  const iv = junto.subarray(0, TAMANHO_IV);
  const corpo = junto.subarray(TAMANHO_IV);
  return new Uint8Array(
    await cripto.subtle.decrypt({ name: "AES-GCM", iv }, chave, corpo));
}

/* ------------------------------------------------------ código impresso
 *
 * Base32 do Crockford: sem I, L, O e U. As três primeiras somem porque se
 * confundem com 1 e 0 na letra de forma, e o U some para não formar palavra
 * feia por acaso. Quem copia da folha erra menos, que é o ponto inteiro de
 * existir uma folha.
 */
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function codificar(bytes) {
  let bits = 0, acumulado = 0, fora = "";
  for (const b of bytes) {
    acumulado = (acumulado << 8) | b;
    bits += 8;
    while (bits >= 5) {
      fora += ALFABETO[(acumulado >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) fora += ALFABETO[(acumulado << (5 - bits)) & 31];
  return (fora.match(/.{1,4}/g) || []).join("-");
}

/** Aceita a folha copiada torto: minúscula, sem traço, com I no lugar do 1. */
function limparCodigo(bruto) {
  return String(bruto || "").toUpperCase()
    .replace(/[ILO]/g, (c) => (c === "O" ? "0" : "1"))
    .replace(/[^0-9A-Z]/g, "");
}

/* ------------------------------------------------------------- o cofre */

const CHAVE_COFRE = "unico";

/* A chave-mestra vive só aqui, e só enquanto o cofre está aberto. Trancar é
   soltar esta variável — não existe cópia dela em disco em lugar nenhum. */
let mestra = null;

function estaAberto() { return !!mestra; }

function trancar() { mestra = null; }

async function existeCofre() {
  return !!(await deposito.pegar("cofre", CHAVE_COFRE));
}

/**
 * Cria o cofre. Devolve o código de recuperação — é a única vez que ele
 * aparece, porque guardá-lo em lugar nenhum é o que o torna seguro.
 */
async function criarCofre(senha) {
  if (await existeCofre()) throw new Error("Este aparelho já tem um cofre.");
  if (!senha || senha.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");

  mestra = await cripto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const cruMestra = new Uint8Array(await cripto.subtle.exportKey("raw", mestra));

  const codigo = codificar(sortear(20));   // 160 bits
  const salSenha = sortear(16);
  const salCodigo = sortear(16);

  const porSenha = await chaveDeSegredo(senha, salSenha, VOLTAS_SENHA);
  const porCodigo = await chaveDeSegredo(limparCodigo(codigo), salCodigo, VOLTAS_CODIGO);

  await deposito.por("cofre", CHAVE_COFRE, {
    versao: 1,
    salSenha: praBase64(salSenha),
    salCodigo: praBase64(salCodigo),
    voltasSenha: VOLTAS_SENHA,
    voltasCodigo: VOLTAS_CODIGO,
    mestraPorSenha: praBase64(await cifrar(porSenha, cruMestra)),
    mestraPorCodigo: praBase64(await cifrar(porCodigo, cruMestra)),
    criadoEm: new Date().toISOString(),
  });

  cruMestra.fill(0);
  return codigo;
}

/**
 * Abre o cofre. A porta é a mesma para os dois segredos — o que muda é qual
 * cópia da chave-mestra se tenta destrancar.
 *
 * Devolve true ou false, e não lança: senha errada é o caso comum, não é
 * defeito. Só a falta do cofre é erro.
 */
async function abrirCofre(segredo, comCodigo) {
  const c = await deposito.pegar("cofre", CHAVE_COFRE);
  if (!c) throw new Error("Não existe cofre neste aparelho.");
  return abrirCom(c, segredo, comCodigo).then((k) => {
    if (!k) return false;
    mestra = k;
    return true;
  });
}

/* Separado de abrirCofre porque a restauração precisa abrir um cofre que veio
   de fora, sem ainda ser o deste aparelho. */
async function abrirCom(c, segredo, comCodigo) {
  const sal = daBase64(comCodigo ? c.salCodigo : c.salSenha);
  const voltas = comCodigo ? (c.voltasCodigo || VOLTAS_CODIGO) : (c.voltasSenha || VOLTAS_SENHA);
  const limpo = comCodigo ? limparCodigo(segredo) : segredo;
  const embrulho = daBase64(comCodigo ? c.mestraPorCodigo : c.mestraPorSenha);

  const chave = await chaveDeSegredo(limpo, sal, voltas);
  let cru;
  try {
    cru = await decifrar(chave, embrulho);
  } catch (e) {
    // O AES-GCM falha quando a chave está errada. É por aqui que se sabe que a
    // senha não confere, e não por comparação de hash guardado.
    return null;
  }
  return cripto.subtle.importKey("raw", cru, { name: "AES-GCM" }, true,
    ["encrypt", "decrypt"]);
}

/**
 * Troca a senha sem mexer nos documentos: o que se refaz é o embrulho da
 * chave-mestra, não os arquivos. Por isso é instantâneo mesmo com o cofre
 * cheio — e por isso o código de recuperação continua valendo depois.
 */
async function trocarSenha(nova) {
  if (!mestra) throw new Error("O cofre está trancado.");
  if (!nova || nova.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");
  const c = await deposito.pegar("cofre", CHAVE_COFRE);
  const cru = new Uint8Array(await cripto.subtle.exportKey("raw", mestra));
  const sal = sortear(16);
  c.salSenha = praBase64(sal);
  c.voltasSenha = VOLTAS_SENHA;
  c.mestraPorSenha = praBase64(await cifrar(await chaveDeSegredo(nova, sal, VOLTAS_SENHA), cru));
  await deposito.por("cofre", CHAVE_COFRE, c);
  cru.fill(0);
}

/**
 * Sorteia um código novo e aposenta o anterior. Existe porque a folha se perde
 * — e num app para quem perde papel, não ter como tirar outra seria o mesmo
 * defeito que ele veio consertar. Vale a mesma regra da senha: o que se refaz
 * é o embrulho, não os documentos.
 */
async function trocarCodigo() {
  if (!mestra) throw new Error("O cofre está trancado.");
  const c = await deposito.pegar("cofre", CHAVE_COFRE);
  const cru = new Uint8Array(await cripto.subtle.exportKey("raw", mestra));
  const codigo = codificar(sortear(20));
  const sal = sortear(16);
  c.salCodigo = praBase64(sal);
  c.voltasCodigo = VOLTAS_CODIGO;
  c.mestraPorCodigo = praBase64(
    await cifrar(await chaveDeSegredo(limparCodigo(codigo), sal, VOLTAS_CODIGO), cru));
  await deposito.por("cofre", CHAVE_COFRE, c);
  cru.fill(0);
  return codigo;
}

/* ----------------------------------------------------------- documentos */

function agora() { return new Date().toISOString(); }

function idNovo() {
  return Date.now().toString(36) + "-" + praBase64(sortear(6)).replace(/[^a-z0-9]/gi, "");
}

/**
 * Guarda um documento. Tudo que identifica alguém — título, números, notas —
 * vai cifrado junto: um cofre que deixasse "CNH de Laelson" legível ao lado do
 * arquivo trancado não estaria escondendo grande coisa.
 */
async function guardarDocumento(doc) {
  if (!mestra) throw new Error("O cofre está trancado.");
  const id = doc.id || idNovo();
  const inteiro = {
    id,
    titulo: "",
    tipo: "",
    titular: "",
    situacao: "TENHO",     // TENHO | FALTA_DIGITALIZAR | A_RECUPERAR
    campos: {},            // números que se digitam em formulário
    validade: null,        // "2027-04-30" para o que vence
    ondeRecuperar: "",     // o caminho da segunda via, para não recomeçar do zero
    arquivos: [],
    criadoEm: agora(),
    ...doc,
    id,
    mexidoEm: agora(),
  };
  const selado = await cifrar(mestra, daTexto(JSON.stringify(inteiro)));
  await deposito.por("documentos", id, { id, corpo: praBase64(selado) });
  return inteiro;
}

async function lerDocumento(id) {
  if (!mestra) throw new Error("O cofre está trancado.");
  const linha = await deposito.pegar("documentos", id);
  if (!linha) return null;
  return JSON.parse(praTexto(await decifrar(mestra, daBase64(linha.corpo))));
}

async function listarDocumentos() {
  if (!mestra) throw new Error("O cofre está trancado.");
  const linhas = await deposito.tudo("documentos");
  const fora = [];
  for (const l of linhas) {
    fora.push(JSON.parse(praTexto(await decifrar(mestra, daBase64(l.corpo)))));
  }
  fora.sort((a, b) => (a.titulo || "").localeCompare(b.titulo || "", "pt-BR"));
  return fora;
}

async function apagarDocumento(id) {
  const doc = await lerDocumento(id);
  if (!doc) return false;
  for (const a of doc.arquivos) await deposito.tirar("arquivos", a.id);
  await deposito.tirar("documentos", id);
  return true;
}

/* ------------------------------------------------------------- arquivos */

/**
 * Guarda os bytes de um arquivo e devolve a ficha dele para pendurar no
 * documento. Nome e tipo ficam com a ficha, que é cifrada junto do documento;
 * o que vai para a loja de arquivos é só o borrão.
 */
async function guardarArquivo(nome, tipo, bytes) {
  if (!mestra) throw new Error("O cofre está trancado.");
  const id = idNovo();
  const selado = await cifrar(mestra, bytes);
  await deposito.por("arquivos", id, { id, corpo: praBase64(selado) });
  return { id, nome, tipo, tamanho: bytes.length, em: agora() };
}

async function lerArquivo(id) {
  if (!mestra) throw new Error("O cofre está trancado.");
  const linha = await deposito.pegar("arquivos", id);
  if (!linha) return null;
  return decifrar(mestra, daBase64(linha.corpo));
}

/* --------------------------------------------------------------- a cópia
 *
 * É a razão de o app existir: o problema não é achar documento, é perder. A
 * cópia sai com tudo dentro, do jeito que já está — cifrado. Ninguém decifra
 * para exportar e cifra de novo, o que seria uma chance a mais de erro num
 * caminho que não pode ter erro.
 *
 * Por isso a cópia pode ser espalhada à vontade: Drive, e-mail, pen drive. Sem
 * a senha ou o código, é ruído. Redundância sai de graça quando o arquivo é
 * opaco — e redundância é o que resolve perda.
 */
const MARCA = "selo.cofre";

async function exportar() {
  const c = await deposito.pegar("cofre", CHAVE_COFRE);
  if (!c) throw new Error("Não existe cofre neste aparelho.");
  return {
    marca: MARCA,
    versao: 1,
    tiradaEm: agora(),
    cofre: c,
    documentos: await deposito.tudo("documentos"),
    arquivos: await deposito.tudo("arquivos"),
  };
}

/**
 * Restaura. Confere antes de escrever: o segredo tem de abrir a chave-mestra
 * da cópia, senão a restauração pararia no meio e deixaria o aparelho com um
 * cofre que ninguém abre.
 *
 * `juntar` decide o que fazer com o que já está aqui. Substituir é o caso de
 * celular novo; juntar é o de duas cópias que seguiram caminhos diferentes.
 */
async function restaurar(pacote, segredo, comCodigo, juntar) {
  if (!pacote || pacote.marca !== MARCA) {
    throw new Error("Este arquivo não é uma cópia do Selo.");
  }
  const chave = await abrirCom(pacote.cofre, segredo, comCodigo);
  if (!chave) return false;

  if (!juntar) await deposito.limpar();
  await deposito.por("cofre", CHAVE_COFRE, pacote.cofre);
  for (const d of pacote.documentos || []) await deposito.por("documentos", d.id, d);
  for (const a of pacote.arquivos || []) await deposito.por("arquivos", a.id, a);

  mestra = chave;
  return true;
}

/* No navegador o app é uma página só e tudo isto é global, como no Tino. No
   Node o teste precisa pedir — e é só o teste que passa por aqui. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    usarDeposito, depositoNaMemoria,
    criarCofre, abrirCofre, trancar, estaAberto, existeCofre, trocarSenha, trocarCodigo,
    guardarDocumento, lerDocumento, listarDocumentos, apagarDocumento,
    guardarArquivo, lerArquivo,
    exportar, restaurar,
    codificar, limparCodigo, praBase64, daBase64, daTexto, praTexto,
  };
}
