# Selo

Seus documentos, cifrados no seu aparelho.

O nome diz as duas coisas que o app faz com um documento: ele **certifica** — os
números ficam ali, prontos para digitar num formulário — e **fecha**, porque
tudo é guardado sob chave.

## Por que existe

Não é para achar documento mais rápido. É porque documento **se perde**.

Certidão que sumiu três vezes. Diploma que foi embora e não tinha nenhuma foto
salva. E, entre uma coisa e outra, o garimpo de sempre: abrir quatro aplicativos
atrás do RG porque um formulário pediu, e ele está numa conversa de WhatsApp
consigo mesmo, ou numa pasta da galeria, ou em lugar nenhum.

O Selo é a resposta para as duas: guarda a foto e o PDF de cada documento, e
guarda os números que os formulários pedem digitados.

## A preocupação certa, e a resposta

A primeira reação a um app assim é a boa: *isso não é um mapeamento completo da
minha pessoa?*

É. Só que esse mapeamento **já existe hoje**, e em condição pior. As fotos dos
seus documentos já estão na galeria do celular, já subiram para a nuvem de fotos
e já estão em conversas de WhatsApp — sem senha nenhuma, à vista de qualquer
aplicativo a que você deu permissão de fotos.

A pergunta não é se você vai assumir o risco. Você já assumiu. É onde essas
fotos vão morar. E um cofre fechado é melhor que uma gaveta aberta.

## As duas portas

O cofre é cifrado no próprio aparelho, com AES-GCM de 256 bits. Quem cifra é o
WebCrypto do navegador — nada de criptografia caseira.

Só que isso cria um risco novo: esquecer a senha seria perder tudo. Num app
feito para quem perde coisas, ter como único ponto de falha *"lembre-se desta
frase"* seria irônico até o absurdo.

Por isso são **duas portas independentes** para a mesma chave:

- **A senha**, que você digita todo dia.
- **O código de recuperação**, sorteado uma vez, mostrado uma vez, para imprimir.

Qualquer uma abre. Você precisa perder as duas para perder o cofre.

E o código sozinho **não abre nada**: sem o arquivo do cofre, é um monte de
letras. Por isso ele pode ficar impresso na casa de outra pessoa, sem risco.

### O que isso protege, e o que não protege

**Protege:** celular perdido desbloqueado (sem a senha, os arquivos são ruído);
a cópia no Drive (o servidor guarda um borrão); e não existe servidor deste app
para invadirem, porque não existe servidor nenhum.

**Não protege:** senha fraca — ninguém quebra a matemática, quebram
`laelson123`; e celular já invadido, porque programa espião vê o que você vê
depois de destrancar. Isso vale igual para o banco e para o WhatsApp.

Uma frase de quatro ou cinco palavras que só faça sentido para você vale mais do
que qualquer coisa que o código faça.

## O selo, e por que ele se mexe

O ícone é um selo lacrado: dentes de selo oficial por fora — isto é documento —
e um buraco de fechadura no meio — e ele está trancado. As duas metades do nome
numa marca só.

Na tela da tranca ele **muda de estado**, e isso não é enfeite. Conferir a senha
leva de meio a um segundo, de propósito: a derivação da chave é lenta porque é
isso que torna caro tentar senha por senha. Sem sinal nenhum, esse tempo
pareceria o app travado.

As cores fazem um **semáforo**, e é por isso que funcionam sem legenda:

- **Vermelho parado** — trancado. É o repouso de um cofre, e dizê-lo em cor é
  mais honesto que um cadeado cinza. É também a marca igual à do ícone.
- **Laranja, girando** — conferindo. Os dentes rodam enquanto a chave é derivada.
- **Verde, e o cadeado abrindo** — deu certo. O arco gira no pé esquerdo, que é
  onde um cadeado de verdade gira.
- **Vermelho seco, cadeado fechado, tremendo** — a senha não serviu. O cadeado
  diz o que o tremor sozinho não dizia: continua trancado. Passado um segundo o
  selo volta ao repouso, com o campo limpo, pronto para a próxima tentativa.

O cadeado só aparece no veredito. Em repouso a tela mostra a mesma marca do
ícone da tela de início — assim as duas combinam.

Quem tem "menos movimento" ligado no aparelho recebe a cor e o cadeado, que é o
que informa; some só o movimento.

Os PNGs de 192 e 512 saem do `icone.svg` com `node scripts/icone.js` — quem
rasteriza é o Chrome que já está na máquina, sem instalar nada.

## A cópia é o produto

O problema é perda, então a cópia não é uma funcionalidade — é a razão de o app
existir. Ela sai como **um arquivo só, já cifrado**: pode ir para o Drive, para
o e-mail, para um pen drive. Sem a senha ou o código, é ruído.

Isso torna a redundância gratuita: espalhe em três lugares. Para perder os
documentos você teria de perder **todas as cópias** ou **as duas chaves**.

**Teste a cópia uma vez.** Abra o Selo numa janela anônima, restaure o arquivo e
veja seus documentos voltarem. Cópia que nunca foi testada não é cópia, é
esperança.

## Digitalizar

O app não reconstrói o escâner do celular, e é decisão: endireitar a perspectiva
exige uma biblioteca de visão computacional de vários megabytes, e o seu celular
**já faz isso, e faz bem** — no iPhone pelo app Notas, no Android pelo Drive ou
pelo Keep. Os dois devolvem um PDF endireitado, e ele entra por **Arquivo**.

Para a foto tirada dentro do app, o que dá para fazer barato está feito:
reduzir o lado maior para 2000 px e passar para preto e branco com contraste
puxado. Papel fica mais legível assim, e muito mais leve.

**CNH e CTPS não devem ser fotografados.** O que sai do gov.br é PDF com código
de validação, e é justamente isso que dá valor a eles. Entram intactos.

## As três situações

Um documento pode existir aqui **antes do arquivo**:

- **Tenho** — está guardado.
- **Falta digitalizar** — você tem o papel, ainda não fotografou.
- **Perdi, preciso recuperar** — e aqui o app guarda **onde pedir a segunda
  via**, para você não recomeçar do zero na próxima vez que for atrás.

## A linha vermelha

**Só os seus documentos, e os de quem mora com você.**

No dia em que documento de terceiro entrar, isto deixa de ser uma carteira e
vira base de dados pessoais de outras pessoas — com LGPD, com dever de guarda, e
virando alvo de verdade. Ninguém invade um celular atrás de um RG; invadem atrás
de trezentos.

É decisão, não limitação.

## Rodando

Não tem build nem dependência. Sirva a pasta e abra:

```
npx serve .
```

Precisa de `https` ou `localhost` — a cifra do navegador e o service worker só
existem em contexto seguro.

### Conferir o cofre

```
node scripts/teste.js
```

Não instala nada e não abre navegador: o `cofre.js` troca o IndexedDB por um
depósito de memória quando o teste pede.

É a parte onde um defeito não dá sintoma. Cofre que abre com a senha errada,
cópia que volta faltando byte, título de documento legível ao lado do arquivo
trancado — nada disso aparece na tela. **Mexeu no cofre, rode isto antes de
subir.**

## O que ainda não tem

- **Sincronia automática.** Hoje a cópia é manual. Numa segunda etapa vira envio
  cifrado antes de sair, para o servidor guardar um borrão.
- **Abrir por reconhecimento facial.** Cabe como uma terceira porta, ao lado da
  senha e do código — o desenho já comporta, falta implementar.
- **Ler o número da foto sozinho.** Se fosse por serviço externo, seria entregar
  o documento; no aparelho, é pesado. Só se fizer falta.
- **Endireitar a perspectiva.** O escâner do celular já resolve.
