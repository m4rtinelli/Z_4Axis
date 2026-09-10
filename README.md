# Z3 — um Z de quatro pontas

Um Z moldado com o mouse. Quatro âncoras, três barras, dois números.

## Rodar

```
node serve.mjs
```

Depois abra http://localhost:5275 (o servidor existe porque o app usa módulos
ES nativos — abrir o `index.html` direto do disco faz o navegador recusar
todos os imports).

## A ideia

### A letra são quatro pontos

A cadeia corre `A → B → C → D` e os segmentos
não são guardados em lugar nenhum: eles são lidos de pares consecutivos das
mesmas quatro âncoras. Por isso o Z **não tem estado em que se desconecte** —
não existe barra solta para soltar.

As duas barras que se encontram numa âncora carregam essa âncora na própria
face, então a união delas sempre se sobrepõe ali. O quadrado da âncora só
arruma o bico de fora — ele não é o que segura a letra junto. É por isso que
o controle **Âncoras** pode ir a zero e a letra continua uma peça só.

### As duas peças dividem a prancheta

O retângulo tira uma faixa sangrada de um dos lados e a letra fica com
exatamente o que sobra. Não existe um terceiro número segurando os dois
separados, então nenhum pode ser redimensionado sem o outro responder por
isso — é o que faz a divisão parecer espaço compartilhado em vez de dois
objetos que por acaso estão perto.

O divisor entre eles é arrastável e cai na mesma grade de 1/8. Ele não é
guardado no estado: é derivado da borda do retângulo, então não tem como
discordar do retângulo do qual é a borda.

### A caixa da letra estica

`ux` e `uy` são independentes, então o Z preenche a forma que recebe — alto e
íngreme, ou baixo e raso. É esse o ponto de se adaptar ao retângulo, em vez de
apenas abrir espaço para ele.

O peso da barra **não** estica com os eixos: as horizontais e a diagonal
continuam com uma espessura só. Escale o peso pelo eixo e um Z achatado sai
com diagonal gorda e barras finas, o que se lê como bug mesmo quando a
aritmética por trás é consistente.

### Espessura se mede contra a letra, não contra a página

Essa é a decisão que fez o achatamento funcionar. Medindo contra a prancheta,
a letra morre conforme o retângulo cresce: a caixa fica baixa, a barra não, e
por volta de um terço da página os contraformas fecham e o Z se lê como um
bloco preto. Adaptar tem que significar continuar legível, ou não é adaptação
— é só ser expulso.

As duas grandezas dependem uma da outra, porque a caixa é a região menos a
sobra, e a sobra é meia barra (ou meio quadrado de âncora, quando esses são
maiores). Escrevendo isso e resolvendo:

```
w = t · caixa        caixa = região − k·w        k = max(1, âncoras)
w = t · (região − k·w)   →   w = t·região / (1 + t·k)
```

Forma fechada — sem iteração e sem circularidade. E no eixo curto a
identidade é exata: `w / caixa === t`, em toda proporção que o divisor
consegue produzir.

### O retângulo é uma máscara, não um enquadramento

A imagem é medida contra a **prancheta**, nunca contra o retângulo. Essa
única escolha é a feature inteira: a imagem fica presa à página, então
quando o divisor se move, a parte visível dela não desloca, não estica e não
reescala — simplesmente mais ou menos dela é revelada. Ajuste a imagem ao
retângulo e arrastar o divisor daria zoom na fotografia, que é a única coisa
que uma máscara não pode fazer.

Ela cobre a prancheta em vez de caber dentro dela, então nunca há vão entre
a imagem e a borda da janela que a observa. O custo é que a imagem é cortada
pela página, que é para isso que serve um placeholder num layout.

### Mover a imagem: em unidades da própria folga

A posição é guardada em unidades da **folga** da imagem — quanto ela
transborda a página em cada eixo. `-1` é encostada numa borda, `+1` na
outra, `0` centrada. Não em pixels e não em fração da prancheta, porque o
quanto há para mover depende do aspecto da imagem: um deslocamento
normalizado sobrevive a uma troca de imagem, a uma mudança de tamanho da
prancheta e a um redimensionamento da janela, e se re-limita de graça.

O pan é preso a essa folga, então a imagem nunca pode ser arrastada para
fora da página deixando um vão — ela cobre, ou não se move. Um eixo sem
transbordo tem folga zero e simplesmente não responde, que é a resposta
honesta: não há nada escondido ali para revelar. Medido: uma imagem 16:9
numa página quadrada tem folga horizontal e **zero** vertical, e uma imagem
quadrada não se move em eixo nenhum.

Um controle que silenciosamente não faz nada é o que faz uma ferramenta
parecer quebrada, então a linha sob o botão diz em quais eixos há folga — ou
que a imagem cabe exata, sem folga para mover.

**E o pan não cai na grade.** A grade de 1/8 existe para decisões de
layout — onde uma âncora fica, onde a página se divide. Enquadrar uma
fotografia não é uma dessas, e numa prancheta de 534px um oitavo é um salto
de 67px, o que tornaria "ajustar um pouquinho" a única coisa impossível.

O arraste é relativo, não absoluto: a imagem se move **pela** distância que
o cursor andou desde que foi agarrada. Um mapeamento absoluto teleportaria o
recorte para onde você por acaso clicou dentro de uma região que muitas
vezes é maior que a folga inteira.

### A imagem tem um lugar, não dois slots

Uma imagem com escolha de lugar — **no retângulo** ou **no fundo** — em vez
de dois slots independentes. A folha de referência só mostra um dos dois: ou
uma fotografia preenchendo o cartão com a letra desenhada por cima, ou um
bloco sólido ao lado da letra. Um segundo slot dobraria o estado para
descrever uma combinação que ninguém pediu.

No fundo ela fica atrás de tudo e é recortada pela página — precisa ser: a
imagem **cobre** a prancheta, então transborda num eixo por construção, e sem
o recorte esse transbordo pintaria por cima da bancada.

E só uma imagem **posta no retângulo** disputa a região. Com a imagem no
fundo, a região volta para cor plana — que é exatamente o que permite um
bloco, ou um conjunto de módulos, pousar sobre uma fotografia. Por isso a
exclusividade com módulos valia antes e vale só para o caso do retângulo.

### O alinhamento do texto é consequência, não controle

O texto gruda na mesma grade de oitavos que as âncoras, mas medida contra a
**prancheta**, não contra a caixa da letra: a caixa da letra encolhe quando o
retângulo cresce, e uma legenda presa ao canto da página não pode se mexer
porque a página foi dividida de outro jeito.

O alinhamento é **lido da posição**. Uma legenda grudada na borda direita e
alinhada à esquerda sai da página, então alinhamento não é escolha livre — é
consequência de onde você põe a coisa. Ler da posição remove dois controles e
remove a falha ao mesmo tempo: texto perto de uma borda vira para dentro,
texto perto do meio centraliza no próprio ponto. Os limiares são os da própria
grade: um quarto de cada lado, que são dois dos oito passos.

Medido: com o texto em `x=0` a caixa ocupa 0→40 de uma página de 659px; em
`x=1` ocupa 618→659. **O texto nunca vaza da página**, e isso é o alinhamento
derivado fazendo o trabalho, não um clamp extra.

A posição inicial (`7/8, 1`) foi medida, não chutada. Na espessura padrão a
barra inferior da letra cobre y de 0.68 a 0.93 na largura toda, então todo
oitavo de 6/8 a 7/8 poria tinta escura sobre tinta escura e a feature
pareceria quebrada no instante em que fosse ligada.

### As fontes do sistema: a permissão compra a lista, não a renderização

Enumerar as fontes instaladas exige a Local Font Access API, que exige gesto
do usuário e concessão de permissão — por isso é um botão, e não algo que
acontece ao carregar. **Renderizar** com uma família local nunca precisou da
permissão: nomear uma família instalada numa string de fonte do canvas sempre
funcionou. A API só compra a **lista**.

Por isso uma recusa degrada para um conjunto de famílias comuns em vez de
para nada. Um menu de fontes que se esvazia é pior que um mais curto do que
poderia ser.

Medido: a mesma string em seis famílias dá seis larguras distintas (Impact
153px, sistema 189px, Arial 206px, Comic Sans 213px), e uma família
inexistente cai exatamente na largura do sistema — o fallback do `fontSpec`
funcionando.

### A subdivisão é derivada de uma semente, não guardada

`Math.random()` seria o jeito óbvio de cortar o retângulo ao acaso, e
tornaria a feature impossível: o layout é recalculado a cada frame, então um
gerador sem semente reembaralharia a composição sessenta vezes por segundo
enquanto você arrasta o divisor.

Guardar uma semente faz a subdivisão ser uma **função pura** de
`(semente, quantidade, região)`. Nada do corte é armazenado — nem um
retângulo — e ainda assim ele é estável entre redesenhos, idêntico para a
mesma semente, e livre para se re-resolver quando a região muda de forma. O
botão que corta de novo não gera geometria; ele escolhe um número.

Duas regras fazem o trabalho, e as duas são sobre o resultado ser usável, não
sobre a aleatoriedade ser interessante:

1. **Sempre dividir a maior célula.** Divida uma ao acaso e as contagens se
   acumulam num canto — você pede oito módulos e recebe um retângulo grande
   ao lado de sete migalhas.

2. **Sempre cortar atravessando o lado mais longo.** É isso que faz a grade
   se re-resolver quando a região é remodelada, em vez de apenas esticar: o
   eixo de cada corte é decidido pelo aspecto **atual** em pixels da célula.
   Medido, os módulos ficam entre 1.03 e 1.98 de proporção — sem slivers,
   até numa faixa de 1/8 da página.

A consequência da regra 2 merece nome: uma célula cujo aspecto cruza 1:1 no
meio do arraste inverte a direção do próprio corte, e o layout dá um salto
visível. Esse é o preço de adaptar em vez de escalar, e é o comportamento
pedido — uma grade que se regenera conforme o espaço muda.

O espaço entre módulos é meio vão de cada lado, não um vão inteiro entre
vizinhos: vizinhos internos acabam a um vão de distância e a composição
guarda meia margem da borda da própria região. Essa margem é o que permite
os cantos arredondados lerem — arredondar um canto que fica exatamente na
borda da página parece um erro. Com o espaço em 0 os módulos se encostam e o
retângulo volta a ser inteiro.

### Cor, e o que ela quebrou

Três cores: **papel**, **letra**, **retângulo**. A letra e o retângulo
começam na mesma tinta de propósito — o estado inicial é uma tinta e um
sistema, e separá-las tem que ser algo que você escolheu, não algo que
herdou.

O controle é `input[type=color]`, que abre o seletor do próprio sistema
operacional, em vez de uma roda feita à mão. O seletor nativo já tem o
conta-gotas, as cores recentes e o campo hex, e cada um desses seria uma
semana de trabalho para reproduzir pior. O evento `input` dispara com o
seletor aberto, então a prancheta pré-visualiza a cor enquanto ela é
escolhida, não quando o diálogo fecha.

**O que essa feature quebrou:** as alças são pontos brancos com um anel
fraco, e isso só funcionava porque a tinta era escura. Com cor controlável,
uma letra clara deixaria as alças invisíveis.

A correção é derivar o anel da **luminância** da cor sob a alça. O teste
ingênuo — média dos canais — chama um amarelo saturado de escuro e um azul
saturado de claro, que é o inverso, e põe pontos brancos sobre tinta pálida
onde eles desaparecem. Corrigir gama primeiro e pesar o canal verde é o que
faz "isso é escuro?" concordar com o olho. Medido: amarelo `#ffff00` dá
0.928 (claro), azul `#0000ff` dá 0.072 (escuro).

O ponto continua branco sempre; só o anel muda de peso. Trocar o próprio
ponto para escuro sobre tinta pálida faria as alças pararem de parecer uma
família, e um controle que muda de identidade junto com a arte é um controle
que você tem que reaprender a cada cor. Medido numa varredura pela alça: com
letra clara o anel derruba o canal R de 255 para 138, um contorno nítido; com
letra escura o anel fica em 68, porque ali o ponto branco já resolve o
contraste sozinho.

## A aba Telas

Uma folha de aplicações geradas. Duas abas de **um** documento, não dois
apps: as telas desenham as âncoras, a espessura e as cores que você definiu
na aba Marca. É essa a razão de serem abas — você molda a marca, depois olha
ela aplicada.

### Uma treliça, dois trabalhos

Os pontos são a textura **e** são o encaixe: a mesma grade de células que é
desenhada como campo de pontos é a grade em que todo bloco cai. Isso não é
uma coincidência a ser arranjada, é o ponto — uma grade decorativa que nada
obedece é papel de parede, e uma grade invisível que tudo obedece é uma regra
que você tem que aceitar por fé. Desenhar a coisa que o layout realmente usa
é o que faz a composição se ler como sistema.

A treliça usa duas medidas de célula em vez de uma célula quadrada, porque
ela precisa **tilar a página exata** — os pontos têm que alcançar as quatro
bordas por igual e um bloco encaixado na última coluna tem que cair na borda
da página, não a um erro de arredondamento dela. Em 3:4 as duas medidas
diferem em menos de um por cento (0.990), então leem como quadradas.

### Intenção em frações, realização na treliça

O gerador escolhe tamanhos e posições como frações da página — "o painel tem
cerca de um terço da largura, mais ou menos centrado" — e só então arredonda
para células. Assim mudar a densidade dos pontos não embaralha a composição:
quantiza a mesma intenção de forma mais grossa ou mais fina, que é o que uma
grade funcional deve parecer quando você muda a resolução dela.

Nada é guardado. Uma tela é função pura da semente e da treliça, igual à
subdivisão dos módulos, então a folha sobrevive a um resize, a um redesenho e
a uma mudança de densidade sem manter um retângulo em lugar nenhum.

A semente de cada tela vem da semente única e do índice, misturados pela
constante da razão áurea. Semear com `semente + i` daria uma folha cujas duas
primeiras telas são quase idênticas, porque uma mudança pequena na semente de
um mulberry32 é uma mudança pequena nas primeiras saídas dele.

### A legenda reserva células, e o campo de pontos respeita

Tipografia deitada sobre um campo de pontos é ilegível. As duas saídas óbvias
são ruins: suprimir a legenda quando os pontos aparecem faz duas features que
não podem ser usadas juntas, e desenhar uma tarja atrás dela é remendo.

Então as legendas são **medidas antes de qualquer coisa ser desenhada**, e o
campo de pontos deixa vazias as células que elas ocupam. É a grade funcional
trabalhando numa segunda frente, e agora visível. Medido, na linha da treliça
onde fica a legenda:

```
sem legenda: •••••••••••••••••••••
com legenda: •••••••••···•••••••••
```

Três pontos contíguos, exatamente centrados. Na página inteira, 586 → 568
pontos com as duas legendas.

### Gerador com edição: o override mora em frações

A aba deixou de ser só gerador. Você clica numa tela para selecioná-la,
arrasta o painel ou um retângulo para movê-lo na grade de pontos, e usa a
alça do canto para mudar o tamanho.

**O que você move é guardado em frações da página, não em índices de célula.**
Célula 6 de uma grade de 24 e célula 6 de uma de 40 são lugares diferentes,
então guardar índices faria todo bloco posicionado escorregar no instante em
que você tocasse o slider de densidade. Medido, com um painel posicionado à
mão e a densidade variando entre 16, 24, 32 e 40 colunas:

| grade | células | fração x |
|---|---|---|
| 16×21 | 4,5 | 0.250 |
| 24×32 | 6,7 | 0.250 |
| 32×43 | 8,9 | 0.250 |
| 40×53 | 10,12 | 0.250 |

As células mudam por completo, a fração fica exata. Com índices, a célula 6
de 24 (0.25) viraria célula 6 de 40 (0.15) — o bloco andaria um décimo da
página para a esquerda.

Uma tela sem entrada de edição é puramente gerada. É isso que faz **Gerar**
continuar funcionando nas telas que você não tocou sem jogar fora as que você
tocou — verificado: a semente muda, o painel posicionado e os retângulos
ficam. Duplo clique devolve o painel ao gerador e remove um retângulo, que é
o que duplo clique significa no resto do app. E uma entrada que fica vazia é
apagada, então "esta tela foi mexida?" continua sendo pergunta que se responde
olhando.

**Redimensionar limita o tamanho, não desliza a origem.** O clamp geral
encolhe antes de deslizar, que é certo ao *posicionar* um bloco — mas num
redimensionamento ele deslizava a origem, e arrastar a alça contra a margem
direita andava o bloco inteiro para a esquerda. Limitar o tamanho ali mesmo
faz o bloco **parar de crescer** na borda, que é o que uma alça de canto deve
fazer. Verificado arrastando 40 células além da borda: canto fixo, e
`cx+cw = 21` de 21 colunas úteis.

**Adicionar desloca a partir do último bloco, não da quantidade.** Parecia
equivalente e não é: remova um do meio e a contagem deixa de dizer quais
lugares estão ocupados, então o próximo bloco cai exatamente sobre um
existente — invisível, e exatamente a falha que o deslocamento existe para
evitar. Vi isso acontecer no readout (`▭ 5,8` duas vezes) antes de corrigir.
A posição do último bloco é sempre um lugar ocupado, então um passo a partir
dela é sempre um lugar novo.

### O Z é vazado no painel

O painel é a tinta, a marca é o buraco nele — desenhada na cor do **papel**.
Isso não precisa de controle nenhum e é o que a referência mostra. Desenhá-la
na cor da letra faria o estado padrão — uma tinta só para a letra e para o
bloco — ser um Z preto num painel preto, ou seja, nada.

O quadro de imagem, quando aparece, **cresce a partir do painel** em vez de
ser colocado independente, então o bloco sempre pousa *sobre* a fotografia
como na referência, em vez de ao lado dela de um jeito que precisaria de um
segundo conjunto de restrições para os dois não colidirem.

E a espessura da barra dentro do painel usa a **mesma** função fechada que o
Z principal (`barWeight`), extraída para isso. Duas cópias de uma regra tão
estrutural são duas regras esperando para discordar.

### A interface recua

O sistema é o da Apple, e a parte dele que importa aqui não é o azul: é que
o chrome recua. Superfícies neutras, separadores de meio pixel, frase em
caixa normal num corpo legível, e cor gasta **só** onde algo está
selecionado ou é interativo. A arte é a única coisa na tela com licença para
ser barulhenta.

O documento é um card branco com sombra suave sobre a bancada cinza — sombra
em vez de contorno, porque ela faz o mesmo trabalho (dizer onde a página
termina quando tinta preta sangra até a borda) sem desenhar uma linha que
passaria a existir dentro do espaço da arte. A grade de fundo ficou; ela só
parou de gritar.

### As alças são de propósito quietas

Uma alça tem dois trabalhos que puxam um contra o outro: ser achável, e sair
da frente da coisa que ela edita. A saída é separar o que se **vê** do que
se pode **acertar** — um ponto de 4px dentro de um alvo de 15px. O ponto
pode então ser pequeno o bastante para desaparecer ao lado da arte, enquanto
o alvo continua tão fácil de pegar quanto um botão, e a marca nunca disputa
atenção com os próprios controles.

Os rótulos saíram dos pontos pela mesma razão: o readout da barra de cima já
diz qual ponto é qual, e dizer duas vezes punha uma letra em cima da letra.

## Controles

| | |
|---|---|
| **Espessura** | largura da barra, como fração da caixa da letra (3%–100%) |
| **Âncoras** | quadrado da âncora, como múltiplo da barra (0–3×) |
| **Retângulo** | liga a segunda peça, e **Lado** escolhe de qual lado ela sai |
| **Imagem** | carrega uma imagem — ou arraste o arquivo para dentro da janela. **Lugar** escolhe entre recortada no retângulo ou atrás de tudo no fundo; arraste-a para reposicionar |
| **Texto** | liga a legenda, com conteúdo, **Fonte** (as do sistema, sob permissão), e **Corpo**; arraste-a para posicionar na grade |
| **Módulos** | corta o retângulo em vários, com **Quantidade**, **Espaço**, **Cantos** e **Cortar de novo** |
| **Cores** | papel, letra, retângulo e texto — abre o seletor do sistema. Na aba Telas as quatro estão em uso: papel = página, letra = pontos, retângulo = painel, texto = legendas |
| **Grade modular** | âncoras e divisor caem em múltiplos de 1/8 |
| **Mostrar alças** | esconde as alças nas duas abas (elas nunca entram num export) |
| **Folha** (Telas) | **Telas** (1–6), **Grade de pontos** (8–48) e **Gerar** |
| **Blocos** (Telas) | **Adicionar retângulo** na tela selecionada; arraste para mover, alça do canto para o tamanho, duplo clique para remover |
| **Legendas** (Telas) | o texto de **Topo** e de **Base** que o gerador posiciona |

**Módulos e imagem são exclusivos.** Um conjunto de módulos não pode ser ao
mesmo tempo uma janela para uma fotografia. Ligar módulos não descarta a
imagem — ela fica guardada e o controle é escurecido com o motivo à vista.
O que não se aplica é escurecido, nunca removido: um painel que muda de
altura quando você vira um interruptor se lê como a ferramenta perdendo o
lugar, e um controle que desaparece leva a explicação com ele.

O **tamanho** do retângulo não está no painel de propósito. É a única coisa
que o divisor diz melhor do que qualquer slider, porque arrastá-lo é o ato de
dividir a página — um número girando num painel é um relato disso, não a
coisa em si.

Arraste as âncoras **A B C D**, o divisor, e a imagem dentro do retângulo.
`Alt` solta da grade, `Tab` cicla as alças (o divisor e a imagem entram no
ciclo quando existem), setas movem por 1/64, `Shift`+setas andam na grade,
duplo clique devolve uma alça ao lugar — e recentra a imagem.

A prioridade de clique é **âncora, divisor, texto, imagem**: menor alvo ganha.
Uma âncora é um ponto, o divisor é uma linha, o texto é uma caixa pequena, a
imagem é uma região inteira — então onde dois se sobrepõem o mais preciso é o
que foi visado. Ponha a imagem primeiro e você nunca conseguiria pegar o
divisor que fica na borda dela, nem a legenda deitada em cima.

**Voltar ao Z** devolve só as âncoras — o divisor tem o duplo clique dele.
Cada alça se reseta sozinha; o botão reseta a letra.

## Arquivos

```
src/rng.js        gerador com semente — o corte precisa ser reproduzível
src/screens.js    a aba Telas: treliça, composição, folha, desenho
src/model.js      âncoras, store, geometria (divisão, subdivisão, máscara, barras)
src/render.js     um frame: prancheta, região, barras, quadrados, alças
src/interact.js   o mouse e o teclado
src/ui.js         o painel
src/main.js       fiação e o loop de redesenho
```

`render.js` separa a **marca** das **alças** de propósito: tudo acima da seção
de alças é o que um export conteria, tudo dentro dela é andaime. Manter a
divisão agora é o que faz o export ser uma adição pequena depois, em vez de
uma reescrita.

A borda da prancheta é chrome, não arte — desenhada meio pixel **fora** do
preenchimento e nunca sobre ele. Ela se paga no momento em que o retângulo
cresce: tinta preta sangrando até a borda num palco escuro é indistinguível
do palco, e sem essa linha a página parece encolher enquanto você arrasta,
em vez de preencher.

Não há clock de animação. O canvas é redesenhado quando o estado ou o ponteiro
muda, e em nenhum outro momento.
#   Z _ 4 A x i s  
 