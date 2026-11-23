// Valores de equilíbrio e de cena da Fase 2 (o farol visto de cima, 0h às
// 6h). Tempos em segundos, distâncias em
// pixels do mundo e ângulos em graus, salvo quando o nome diz outra coisa.

// Centro do farol na imagem farol-ilha-<tema>.png e os olhos do Kraken
// dentro do quadro de kraken-<tema>.png. Cópia das constantes de
// tools/gerar-farol-arte.mjs (o jogo não pode importar os geradores, que
// usam node:zlib); se o gerador mudar, mude aqui também.
export const FAROL = { x: 320, y: 300 };
export const OLHOS_DO_KRAKEN = [
    { x: 96, y: 70 },
    { x: 160, y: 70 },
];

// mundo da fase: a imagem farol-ilha inteira
export const MUNDO = { largura: 640, altura: 480 };

// câmera fixa: topo da vista normal e da vista do Kraken (a vista tem 360 de altura)
export const CAMERA = {
    yNormal: 120,
    yKraken: 0,
};

// Forma da ilha, a mesma do gerador (elipse com ondulação e ruído): serve
// para achar a areia (piranhas), a água (ondas) e a grama (vaga-lumes).
export const ILHA = { cx: FAROL.x, cy: FAROL.y, rx: 208, ry: 126 };

// Noite: opacidade da escuridão longe de qualquer luz e as luzes que a
// recortam (o facho e o halo fraco do farol).
export const NOITE = {
    escuridao: 0.55,
    // raios do halo do farol, do anel de fora para o de dentro
    halo: [86, 58, 34],
    // o facho em guia clareia os dois anéis de fora; disparando, os três
    // (alcance e abertura de cada anel, em fração do cone do facho)
    aneisDoFacho: [
        { alcance: 1.0, abertura: 1.25 },
        { alcance: 0.85, abertura: 0.95 },
        { alcance: 0.7, abertura: 0.7 },
    ],
};

// Facho do farol.
export const FACHO = {
    // velocidade máxima de giro, em graus por segundo
    velocidadeMaxima: 270,
    // rapidez com que o giro freia perto do mouse (1/s): maior = mais seco
    suavidade: 11,
    // ângulo inicial (−90 = para cima)
    anguloInicial: -90,
    // cone do disparo
    abertura: 25,
    alcance: 280,
    // duração do disparo e espera até o próximo: base + por engrenagem
    duracaoBase: 0.2,
    duracaoPorNivel: 0.1,
    esperaBase: 1.0,
    esperaPorNivel: 0.15,
    // dano de um disparo em cada monstro que ele toca (uma vez por disparo)
    danoBase: 1,
    danoPorNivel: 0.25,
    // o facho começa um pouco fora do centro (na borda da lanterna)
    raioDaBoca: 10,
    // o quadro aceso do farol fica mais este tempo depois do disparo
    acesoDepois: 0.08,
    // arco de recarga em volta do farol: raio, pontos e lado do ponto
    arcoRaio: 38,
    arcoPontos: 36,
    arcoPonto: 2,
};

// nível máximo da lanterna (engrenagens)
export const NIVEL_MAXIMO = 4;

// Torre: vida inicial = base + por peça da Fase 1 (60 + 10·peças).
export const TORRE = {
    vidaBase: 60,
    vidaPorPeca: 10,
    // raio do corpo do farol visto de cima: monstros que chegam aqui atacam
    raio: 24,
    // distância do centro em que serpentes e mini-chefes param para morder
    raioDeAtaque: 34,
    // tremor da câmera e flash vermelho ao levar dano
    tremorIntensidade: 2,
    tremorMs: 180,
    flashOpacidade: 0.32,
    flashDuracao: 0.35,
};

// Monstros comuns. velocidade em px/s; raio do corpo para o facho;
// dano na torre; vida em disparos de nível 0.
export const MONSTROS = {
    morcego: {
        vida: 1,
        velocidade: 72,
        raio: 9,
        // era 2,4 (e antes 4)
        dano: 5,
        // zigue-zague: amplitude (px) e frequência (rad/s) do desvio de lado
        zigueAmplitude: 16,
        zigueFrequencia: 4.2,
        // sombra no chão: deslocamento e opacidade
        sombraX: 5,
        sombraY: 15,
        sombraOpacidade: 0.45,
        // quadros por segundo das asas
        fps: 12,
    },
    piranha: {
        vida: 1,
        velocidade: 48,
        raio: 8,
        // era 1,8 (e antes 3)
        dano: 4,
        // tamanho do grupo por hora (0h a 4h): [mínimo, máximo]
        grupo: [
            [3, 3],
            [3, 4],
            [3, 4],
            [4, 5],
            [4, 5],
        ],
        // nasce longe da areia (px), dentro da vista
        distanciaDoMar: [70, 120],
        // espalhamento do grupo: ângulo (graus) e distância (px)
        espalhamentoAngulo: 14,
        espalhamentoDistancia: 26,
        // respingo do surgimento, antes de nadar
        surgir: 0.45,
        // salto da areia até o farol: duração (s) e altura do arco (px)
        saltoDuracao: 0.85,
        saltoAltura: 34,
        // quanto o peixe cresce no alto do salto (escala extra)
        saltoEscala: 0.45,
        // circula pela costa antes de saltar: `raioExtra` px para fora da areia,
        // `velocidade` em rad/s e `duracao` [mínimo, máximo] em s; o sentido é sorteado
        circular: { raioExtra: 10, velocidade: 1.0, duracao: [2, 4] },
        // aviso parado na areia antes do salto: duração (s), raio do anel de
        // alerta (px) e quanto ele cresce no pico do pulso (px); o corpo oscila de 1 a 1,15
        aviso: { duracao: 0.6, raio: 14, pulso: 10 },
        // ondulação do nado: amplitude (px) e frequência (rad/s)
        nadoAmplitude: 3,
        nadoFrequencia: 9,
        fps: 10,
    },
    serpente: {
        // era 3
        vida: 2,
        // velocidade ao longo do círculo (px/s)
        velocidade: 44,
        raio: 11,
        // era 3 (e antes 5)
        dano: 6,
        // a cada quantos segundos morde a torre quando chega
        mordida: 1.6,
        // escala inicial da elipse da ilha onde nasce e quanto ela fecha por segundo
        escalaInicial: 1.4,
        fechamento: 0.075,
        // recuo ao levar um disparo (escala da elipse)
        recuo: 0.05,
        fps: 7,
    },
};

// Mini-chefes: um a cada `intervalo` segundos de jogo (era um por hora de
// jogo, 1h a 4h), na ordem de `tipos`, até o Kraken acordar; escala do
// desenho, vida (vezes a do comum), velocidade (fração da do comum), dano
// (vezes) e a cada quantos segundos morde a torre quando chega.
export const MINI_CHEFE = {
    intervalo: 30,
    tipos: ["morcego", "piranha", "serpente", "morcego"],
    escala: 2,
    vida: 8,
    velocidade: 0.55,
    // vezes o dano do comum: com o dano atual dos comuns (5, 4 e 6), cada
    // mordida do mini-chefe tira cerca de 8,3 (morcego), 6,7 (piranha) e 10 (serpente)
    dano: 5 / 3,
    mordida: 1.8,
    // vida da torre que volta ao matar um mini-chefe (fração da vida máxima)
    cura: 0.25,
    // os comuns aparecem mais devagar enquanto há mini-chefe (multiplica o intervalo)
    intervaloComChefe: 1.5,
    // barra de vida acima dele
    barraLargura: 40,
    barraAltura: 4,
    barraAcima: 30,
    // halo e contorno brilhantes
    haloRaio: 30,
    contornoLargura: 1,
};

// Engrenagem que o mini-chefe solta: voa até o farol num arco.
export const ENGRENAGEM = {
    duracao: 1.1,
    alturaDoArco: 46,
    giro: 7,
};

// Energia do farol: cada monstro morto pelo facho solta faíscas de luz que
// voam até o farol e enchem a barra; cheia, o jogo para e o jogador escolhe
// uma melhoria (src/fase2/melhorias.js). A barra do nível n (0 = a primeira)
// pede `abates * crescimento^n` abates de monstro comum, contando a média
// de faíscas de um abate.
export const ENERGIA = {
    // faíscas de um monstro comum [mínimo, máximo] e de um mini-chefe
    faiscas: [1, 3],
    faiscasDoChefe: 6,
    abates: 8,
    crescimento: 1.25,
    // voo da faísca: espalha para fora por `espalhar` s e cai no farol em
    // `voo` s (sorteado entre os dois), num arco de `arco` px
    espalhar: 0.18,
    voo: [0.5, 0.8],
    arco: 26,
    // espera entre dois sons de faísca chegando (s)
    somMinimo: 0.06,
    // painel de escolha: espera antes de aceitar tecla ou clique (s)
    esperaDoPainel: 0.35,
};

// Valores das melhorias do farol (nomes e textos em src/fase2/melhorias.js).
export const MELHORIA = {
    // Reparo: fração da vida máxima curada
    reparo: 0.3,
    // Muralha: vida máxima a mais e cura
    muralhaVida: 20,
    muralhaCura: 20,
    // Lente larga: graus de abertura a mais por nível (era 10)
    lente: 6,
    // Mecanismo: a espera da recarga vezes (1 − mecanismo) por nível
    mecanismo: 0.15,
    // Pavio longo: segundos de disparo a mais por nível
    pavio: 0.1,
    // Facho duplo: fração do dano do facho do lado oposto (era 0,6)
    duplo: 1,
    // Luz que queima: segundos lentos e a fração da velocidade
    // (era 0.5 = 50% de lentidão) 
    queima: 1.5,
    lentidao: 0.7,
};

// Diretor de ondas: a cada `intervalo` (sorteado entre os dois valores, em
// segundos) nasce um monstro sorteado pelos pesos (a piranha vem em grupo),
// até `maximo` monstros vivos. Uma linha por hora, da 0h à 4h.
// A 0h é calma; da 2h em diante as ondas apertam, porque a lanterna e as
// melhorias do farol já deixam o facho bem mais forte. Depois do playtest,
// 30% mais monstros: intervalos dividios por 1,3 e máximos 30% maiores.
export const ONDAS = [
    { intervalo: [1.5, 1.96], pesos: { morcego: 3, piranha: 1, serpente: 0 }, maximo: 13 },
    { intervalo: [1.22, 1.67], pesos: { morcego: 3, piranha: 2, serpente: 1 }, maximo: 16 },
    { intervalo: [0.98, 1.32], pesos: { morcego: 3, piranha: 2, serpente: 1 }, maximo: 21 },
    { intervalo: [0.75, 1.04], pesos: { morcego: 3, piranha: 3, serpente: 2 }, maximo: 26 },
    { intervalo: [0.55, 0.78], pesos: { morcego: 4, piranha: 3, serpente: 3 }, maximo: 33 },
];
// espera antes do primeiro monstro da fase
export const PRIMEIRA_ONDA = 1.5;

// Depois que o jogador escolheu `quantas` melhorias no total (soma dos níveis
// em partida.melhorias), o diretor de ondas aperta: o intervalo de cada linha
// de ONDAS é multiplicado por `intervalo` (0,75 = ondas 25% mais rápidas) e o
// máximo de monstros vivos por `maximo` (arredondado para cima). Só vale
// enquanto o diretor está ativo (às 5h o Kraken o desliga).
export const DEPOIS_DAS_MELHORIAS = { quantas: 4, intervalo: 0.75, maximo: 1.3 };

// Mar vivo e vaga-lumes (só desenho).
export const MAR = {
    // cristas de espuma junto à areia
    cristas: 110,
    cristaDistancia: [3, 16],
    cristaLargura: [2, 5],
    // brilhos na água aberta
    brilhos: 70,
    // passo do contorno da costa, em graus
    passoDaCosta: 2,
    vagalumes: 12,
};

// Avisos no meio da tela (s).
export const AVISO = { duracao: 2.4, entrada: 0.25, saida: 0.5 };

// limite de dt por quadro (ms), para uma aba que volta não teletransportar ninguém
export const DT_MAXIMO = 50;

// Kraken, o chefe das 5h às 6h (código em src/fase2/kraken/). Ângulos em graus; os vetores de três valores são por
// fúria: 0 com a vida cheia, 1 abaixo de 75% e 2 abaixo de 50%.
export const KRAKEN = {
    // canto do quadro de kraken-<tema>.png (256×160) no mundo; os olhos são
    // OLHOS_DO_KRAKEN somados a este canto
    x: 192,
    y: 0,
    quadroLargura: 256,
    quadroAltura: 160,
    // linha d'água dentro do quadro: o corpo sobe e afunda cortado aqui
    linhaDagua: 128,
    // vida em dano do facho (era 40, agora 30% a mais)
    vida: 52,
    // limiares de fúria (fração da vida; eram 2/3 e 1/3): a primeira vem aos
    // 75% e a segunda aos 50%
    furia: [0.75, 0.5],
    // entrada: subida da câmera (ms), o corpo subindo da água (s) e a espera
    // antes do primeiro ciclo (s)
    camera: 1500,
    emergir: 2.0,
    tremorDaEntrada: 3,
    pausaInicial: 1.0,
    // respingos na linha d'água enquanto sobe (s entre um e outro)
    respingo: 0.09,
    // tempo de cada quadro parado (0 e 1, alternando)
    quadroParado: 0.45,
    // olhos: quanto ficam abertos (s), raio de cada olho para o facho e a
    // pausa entre o fim de um ataque e os olhos (e entre os olhos e o ataque)
    olhosAbertos: 3.0,
    raioDoOlho: 12,
    pausa: 0.8,
    // ao levar dano: quadro 3 piscando (s), faíscas em cada olho e tremor
    flashDano: 0.3,
    faiscasDano: 7,
    tremorDano: 1.5,
    tremorDanoMs: 140,
    // fim: o corpo afunda em `afundar` s, com explosões a cada `explosao` s,
    // e a vitória vem `esperaVitoria` s depois
    afundar: 2.6,
    explosao: 0.55,
    faiscasMorte: 10,
    esperaVitoria: 0.9,
    // barra de vida no alto, em pixels da tela
    barraLargura: 260,
    barraAltura: 8,
    barraY: 26,
    // brilho dos olhos abertos: raio e velocidade do pulso (rad/s)
    brilhoRaio: 15,
    brilhoPulso: 8,

    // Anéis: 3, 4 ou 5 anéis (por fúria, `quantidade`) com uma abertura cada,
    // em volta do farol, girando e se fechando; só os primeiros `quantidade`
    // raios são usados. Ao chegar ao `raioDeChegada`, o facho precisa apontar
    // para a abertura (meia abertura + folga), senão a torre leva `dano`.
    aneis: {
        quantidade: [3, 4, 5],
        raios: [150, 190, 230, 270, 310],
        espessura: 6,
        // distância entre os quadradinhos que desenham o anel (px)
        passo: 4,
        abertura: 50,
        folga: 6,
        raioDeChegada: 46,
        // surgimento (s) e o aviso antes de chegar (s)
        surgir: 0.5,
        aviso: 1.4,
        velocidade: [26, 30, 35, 38, 42],
        giro: [12, 18, 26, 30, 34],
        dano: 8,
        // a abertura chega em uma direção visível: fora da cunha de baixo,
        // que a vista do Kraken corta (de 45° a 135°)
        chegada: [135, 405],
        // diferença mínima entre as direções de chegada de dois anéis seguidos
        diferenca: 70,
        tremor: 4,
        tremorMs: 260,
        // duração do anel se desfazendo ou quebrando (s)
        fim: 0.45,
    },

    // Cardume: ondas de piranhas em leque vindas de um lado.
    cardume: {
        ondas: [3, 4, 5],
        // piranhas por onda (era 3, 4 e 4: 2,5 vezes mais); o total por ataque
        // passa a ser 24, 40 e 50
        porOnda: [8, 10, 10],
        intervalo: [1.2, 1.0, 0.85],
        // ângulo entre duas ondas do leque
        leque: 32,
        // direções do meio do leque (o mar visível na vista do Kraken)
        direcoes: [180, 0, -150, -30],
        // o ataque acaba quando o cardume todo morre ou depois deste tempo (s)
        duracaoMaxima: 9,
    },

    // Tentáculos (minigame): `quantidade` tentáculos deitados em volta do
    // farol, cada um uma linha reta. Com o botão apertado dentro do
    // círculo de partida, o jogador segue a linha até a ponta e o tentáculo
    // queima. Sair da faixa (`folga` px da linha), recuar mais de
    // `recuoMaximo` px ou soltar o botão zera o traço. Em `tempo` s, cada
    // tentáculo que sobrou bate na torre (`dano`). Nenhum monstro nasce
    // enquanto os tentáculos estão ativos.
    tentaculos: {
        // era 3, 4 e 5; no máximo 3, para dar para se defender da horda
        quantidade: [2, 3, 3],
        // duração do ataque (s); era 14, 12 e 10, agora 5 s a mais
        tempo: [19, 17, 15],
        // cristas e amplitude (px) da senoide sobre a linha, sorteadas entre
        // os dois; amplitude 0 deixa o tentáculo reto (era [10, 16])
        curvas: [2, 3],
        amplitude: [0, 0],
        // comprimento da linha (px; era 150 a 200)
        comprimento: [240, 300],
        // distância do meio do tentáculo ao centro do farol
        raioMinimo: 80,
        raioMaximo: 220,
        // meia largura da faixa em volta da curva e o recuo permitido (px)
        folga: 14,
        recuoMaximo: 6,
        // raio do círculo de partida, espessura do corpo e distância entre
        // as setinhas do sentido (px)
        partidaRaio: 11,
        espessura: 8,
        seta: 24,
        // surgimento e queima (s)
        surgir: 0.5,
        queimar: 0.4,
        dano: 5,
        // sorteios por tentáculo até caber; depois aceita o último
        tentativas: 30,
    },
};
