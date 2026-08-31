/* Testa o cofre do Selo.
 *
 * É a parte onde um defeito não aparece na tela. Cofre que abre com a senha
 * errada, cópia que volta faltando byte, documento com o título legível ao
 * lado do arquivo trancado — nada disso dá sintoma. Ou está testado, ou está
 * na sorte.
 *
 * Roda com `node scripts/teste.js`, sem instalar nada e sem navegador: o
 * cofre.js troca o IndexedDB por um depósito de memória quando o teste pede.
 */

const cofre = require("../cofre.js");

let falhas = 0;
function ok(nome, cond, extra) {
  if (cond) { console.log("  ok   " + nome); return; }
  falhas++;
  console.log("  FALHA " + nome + (extra !== undefined ? "  → " + JSON.stringify(extra) : ""));
}

async function esperaErro(nome, faz) {
  try { await faz(); ok(nome, false, "não reclamou"); }
  catch (e) { ok(nome, true); }
}

const SENHA = "cavalo bateria grampo correto";
const bytesDeMentira = (n, semente) =>
  Uint8Array.from({ length: n }, (_, i) => (i * 31 + semente) % 256);

async function main() {
  // ------------------------------------------------------------------ 1
  console.log("\n1. criar o cofre");
  cofre.usarDeposito(cofre.depositoNaMemoria());

  ok("aparelho começa sem cofre", (await cofre.existeCofre()) === false);
  const codigo = await cofre.criarCofre(SENHA);
  ok("agora existe", (await cofre.existeCofre()) === true);
  ok("devolveu o código de recuperação", typeof codigo === "string" && codigo.length > 20, codigo);
  ok("o código sai em grupos, para copiar da folha", /^[0-9A-Z]{4}(-[0-9A-Z]{4})+$/.test(codigo), codigo);
  ok("sem letras que se confundem na letra de forma", !/[ILOU]/.test(codigo), codigo);
  ok("o cofre já nasce aberto", cofre.estaAberto() === true);

  await esperaErro("não deixa criar dois cofres", () => cofre.criarCofre(SENHA));
  await esperaErro("recusa senha curta", async () => {
    cofre.usarDeposito(cofre.depositoNaMemoria());
    await cofre.criarCofre("123");
  });

  // ------------------------------------------------------------------ 2
  console.log("\n2. abrir e trancar");
  cofre.usarDeposito(cofre.depositoNaMemoria());
  const cod = await cofre.criarCofre(SENHA);

  cofre.trancar();
  ok("trancou", cofre.estaAberto() === false);
  await esperaErro("trancado não lê documento", () => cofre.listarDocumentos());

  ok("senha errada não abre", (await cofre.abrirCofre("senha errada")) === false);
  ok("continua trancado depois de errar", cofre.estaAberto() === false);
  ok("senha certa abre", (await cofre.abrirCofre(SENHA)) === true);

  cofre.trancar();
  ok("o código abre", (await cofre.abrirCofre(cod, true)) === true);

  cofre.trancar();
  const torto = cod.toLowerCase().replace(/-/g, " ");
  ok("o código aceita cópia torta da folha", (await cofre.abrirCofre(torto, true)) === true, torto);

  cofre.trancar();
  ok("código errado não abre", (await cofre.abrirCofre("XXXX-XXXX-XXXX-XXXX", true)) === false);
  await cofre.abrirCofre(SENHA);

  // ------------------------------------------------------------------ 3
  console.log("\n3. o documento, e o que fica legível");
  const doc = await cofre.guardarDocumento({
    titulo: "Diploma",
    tipo: "DIPLOMA",
    situacao: "A_RECUPERAR",
    ondeRecuperar: "Secretaria da faculdade — pedir segunda via",
    campos: { registro: "123456" },
  });
  ok("nasceu com id", !!doc.id);
  ok("guardou a situação", doc.situacao === "A_RECUPERAR");

  const lido = await cofre.lerDocumento(doc.id);
  ok("volta igual", lido.titulo === "Diploma" && lido.campos.registro === "123456");
  ok("guardou onde recuperar", lido.ondeRecuperar.includes("segunda via"));

  const pacoteEspiado = await cofre.exportar();
  const cru = JSON.stringify(pacoteEspiado);
  ok("o título NÃO fica legível no que é guardado", !cru.includes("Diploma"), "vazou");
  ok("o número NÃO fica legível", !cru.includes("123456"), "vazou");
  ok("nem o caminho da segunda via", !cru.includes("faculdade"), "vazou");

  // ------------------------------------------------------------------ 4
  console.log("\n4. o arquivo, byte a byte");
  const originais = bytesDeMentira(50000, 7);
  const ficha = await cofre.guardarArquivo("cnh.pdf", "application/pdf", originais);
  ok("a ficha guarda nome e tipo", ficha.nome === "cnh.pdf" && ficha.tipo === "application/pdf");
  ok("e o tamanho", ficha.tamanho === 50000);

  const voltou = await cofre.lerArquivo(ficha.id);
  ok("voltou do mesmo tamanho", voltou.length === originais.length, voltou.length);
  ok("voltou byte a byte", originais.every((b, i) => voltou[i] === b));

  await cofre.guardarDocumento({ ...doc, arquivos: [ficha] });
  ok("o documento aponta para o arquivo",
    (await cofre.lerDocumento(doc.id)).arquivos[0].id === ficha.id);

  // ------------------------------------------------------------------ 5
  console.log("\n5. a cópia, que é a razão do app existir");
  const pacote = await cofre.exportar();
  ok("a cópia leva o cofre, os documentos e os arquivos",
    !!pacote.cofre && pacote.documentos.length === 1 && pacote.arquivos.length === 1);

  // celular novo: depósito limpo, nada dentro
  cofre.usarDeposito(cofre.depositoNaMemoria());
  cofre.trancar();
  ok("o aparelho novo está vazio", (await cofre.existeCofre()) === false);

  ok("cópia não abre com a senha errada",
    (await cofre.restaurar(pacote, "outra senha qualquer")) === false);
  ok("e não deixou lixo para trás", (await cofre.existeCofre()) === false);

  ok("restaurou com a senha", (await cofre.restaurar(pacote, SENHA)) === true);
  ok("abriu junto", cofre.estaAberto() === true);
  const depois = await cofre.listarDocumentos();
  ok("o documento veio", depois.length === 1 && depois[0].titulo === "Diploma");
  const arqDepois = await cofre.lerArquivo(depois[0].arquivos[0].id);
  ok("o arquivo veio inteiro",
    arqDepois.length === originais.length && originais.every((b, i) => arqDepois[i] === b));

  // e a outra porta também abre a cópia
  cofre.usarDeposito(cofre.depositoNaMemoria());
  cofre.trancar();
  ok("a cópia também abre pelo código impresso",
    (await cofre.restaurar(pacote, cod, true)) === true);
  ok("com os documentos", (await cofre.listarDocumentos()).length === 1);

  await esperaErro("recusa arquivo que não é cópia do Selo",
    () => cofre.restaurar({ marca: "outra coisa" }, SENHA));

  // ------------------------------------------------------------------ 6
  console.log("\n6. cópia mexida não passa por boa");
  const adulterado = JSON.parse(JSON.stringify(pacote));
  const alvo = adulterado.arquivos[0];
  const bytes = cofre.daBase64(alvo.corpo);
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;   // um bit trocado no meio
  alvo.corpo = cofre.praBase64(bytes);

  cofre.usarDeposito(cofre.depositoNaMemoria());
  cofre.trancar();
  ok("o cofre ainda abre (o estrago é no arquivo)",
    (await cofre.restaurar(adulterado, SENHA)) === true);
  const docAdulterado = (await cofre.listarDocumentos())[0];
  await esperaErro("mas o arquivo mexido se recusa a abrir",
    () => cofre.lerArquivo(docAdulterado.arquivos[0].id));

  // ------------------------------------------------------------------ 7
  console.log("\n7. trocar a senha sem tocar nos documentos");
  cofre.usarDeposito(cofre.depositoNaMemoria());
  const cod2 = await cofre.criarCofre(SENHA);
  const d2 = await cofre.guardarDocumento({ titulo: "Certidão de nascimento" });

  await cofre.trocarSenha("outra frase bem comprida");
  cofre.trancar();
  ok("a senha antiga não abre mais", (await cofre.abrirCofre(SENHA)) === false);
  ok("a nova abre", (await cofre.abrirCofre("outra frase bem comprida")) === true);
  ok("os documentos continuam lá",
    (await cofre.lerDocumento(d2.id)).titulo === "Certidão de nascimento");

  cofre.trancar();
  ok("o código impresso continua valendo depois da troca",
    (await cofre.abrirCofre(cod2, true)) === true);

  // ------------------------------------------------------------------ 8
  console.log("\n8. apagar leva os arquivos junto");
  const f1 = await cofre.guardarArquivo("frente.jpg", "image/jpeg", bytesDeMentira(1000, 1));
  const f2 = await cofre.guardarArquivo("verso.jpg", "image/jpeg", bytesDeMentira(1000, 2));
  const comDois = await cofre.guardarDocumento({ titulo: "RG", arquivos: [f1, f2] });
  ok("guardou frente e verso", (await cofre.lerDocumento(comDois.id)).arquivos.length === 2);

  ok("apagou", (await cofre.apagarDocumento(comDois.id)) === true);
  ok("o documento sumiu", (await cofre.lerDocumento(comDois.id)) === null);
  ok("a frente sumiu junto", (await cofre.lerArquivo(f1.id)) === null);
  ok("o verso também", (await cofre.lerArquivo(f2.id)) === null);
  ok("e não levou os outros", (await cofre.lerDocumento(d2.id)) !== null);

  // ------------------------------------------------------------------ 9
  console.log("\n9. a folha se perde: tirar outra");
  const cod3 = await cofre.trocarCodigo();
  ok("veio um código diferente", cod3 !== cod2, { cod2, cod3 });
  cofre.trancar();
  ok("o antigo foi aposentado", (await cofre.abrirCofre(cod2, true)) === false);
  ok("o novo abre", (await cofre.abrirCofre(cod3, true)) === true);
  ok("a senha continua valendo", (await cofre.abrirCofre("outra frase bem comprida")) === true);
  ok("e os documentos continuam lá", (await cofre.lerDocumento(d2.id)) !== null);

  console.log(falhas ? `\n${falhas} FALHA(S)\n` : "\ntudo passou\n");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error("\nquebrou:", e); process.exit(1); });
