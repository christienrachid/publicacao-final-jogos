import { minutosDe } from "../systems/relogio.js";

// Valores de equilíbrio e de aparência da Fase 1 (a ilha de lado). Tempos em
// segundos, distâncias em pixels do mundo, velocidades em px/s.
export const FASE1 = {
    // ---- jogador: movimento --------------------------------------------
    jogador: {
        // caixa de colisão (os pés ficam na base)
        largura: 10,
        altura: 20,
        // velocidade andando de frente
        velocidade: 112,
        // andando de costas (mirando para o outro lado): fração da velocidade
        fatorDeCostas: 0.75,
        // aceleração e freio no chão e no ar (px/s²)
        aceleracaoChao: 1100,
        freioChao: 1400,
        aceleracaoAr: 700,
        freioAr: 420,
        // gravidade subindo e caindo (cair mais pesado dá um pulo mais firme)
        gravidade: 900,
        gravidadeCaindo: 1300,
        // velocidade do pulo (sobe ~50 px segurando o botão)
        pulo: 300,
        // soltar o botão subindo multiplica a velocidade de subida por isto
        corteDoPulo: 0.45,
        quedaMaxima: 430,
        // tempo depois de sair da beirada em que o pulo ainda vale
        coyote: 0.1,
        // pulo apertado um pouco antes de tocar o chão também vale
        bufferDoPulo: 0.1,
        // segurando ↓ num andaime: tempo atravessando as tábuas
        descerDoAndaime: 0.22,
        // poeira: a cada quantos px andados, e queda mínima para poeira no pouso
        passoPoeira: 22,
        quedaComPoeira: 180,
    },

    // ---- jogador: vida ----------------------------------------------------
    vida: {
        coracoes: 5,
        // invencível e piscando depois de levar dano
        invencivel: 1,
        piscar: 0.08,
        // empurrão do dano
        empurraoX: 150,
        empurraoY: 170,
        // quadro de dano na tela
        tempoDeDano: 0.3,
        // morte definitiva: animação, tela escurecendo e, passado
        // tempoAteDerrota, a tela de derrota
        tempoDaMorte: 0.9,
        escurecer: 0.6,
        tempoAteDerrota: 1.8,
        // com 1 coração: a borda da tela pulsa (pulso em s por ciclo, alfa
        // máximo, largura da moldura em px) e o batimento toca a cada
        // batimento s
        alertaBaixa: { pulso: 1.6, alfaMax: 0.35, batimento: 0.8, moldura: 24 },
    },

    // ---- lanterna ---------------------------------------------------------
    lanterna: {
        // cone (graus) e alcance
        abertura: 30,
        alcance: 130,
        // alcance contra chefes (alvo.chefe) ou com lanterna.modoChefe ligado
        alcanceChefe: 260,
        // segundos de uso contínuo com a bateria cheia
        bateria: 12,
        // dano por segundo nos alvos dentro do cone
        danoPorSegundo: 10,
        // recarga segurando E perto da porta da casa
        tempoDeRecarga: 2,
        distanciaDaPorta: 18,
        // cor e intensidade do brilho do feixe
        cor: "#ffe7a8",
        intensidade: 0.55,
        // tremido do feixe (só desenho)
        tremor: 0.04,
    },

    // ---- câmera -----------------------------------------------------------
    camera: {
        zoom: 2,
        // área no meio da tela em que o jogador anda sem mexer a câmera
        // (pixels do mundo)
        zonaMortaLargura: 36,
        zonaMortaAltura: 28,
        // suavização (maior = chega mais rápido)
        suavizar: 7,
        // a câmera mira um pouco acima dos pés
        alturaDoOlhar: 22,
        // em qualquer zoom, a vista mostra no máximo isto (px do mundo)
        // abaixo da linha do mar (marY): quase nada do subterrâneo
        abaixoDoMar: 40,
    },

    // ---- tempo, céu e escuridão -------------------------------------------
    tempo: {
        // escuridão do mundo: 0 até `inicio`, cresce até `maxima` em `fim`
        escuridaoInicio: minutosDe(18),
        escuridaoFim: minutosDe(21),
        escuridaoMaxima: 0.82,
        // postes e a janela da casa acendem
        luzesAcendem: minutosDe(19),
        // o sol desce e some no horizonte
        solComeca: minutosDe(18),
        solSome: minutosDe(19),
        // a lua nasce à esquerda e cruza o céu até se pôr à direita
        luaNasce: minutosDe(19),
        luaSePoe: minutosDe(1),
        // estrelas aparecem entre estes dois horários
        estrelasComecam: minutosDe(19, 15),
        estrelasCheias: minutosDe(20, 30),
    },

    ceu: {
        // horizonte (px do mundo) = base + fator × centro da vista (y): quase
        // preso ao mundo, com um pouco de paralaxe vertical
        horizonteBase: 83,
        horizonteFator: 0.857,
        // paralaxe horizontal das nuvens e das ilhas ao fundo (0 = preso à
        // tela, 1 = preso ao mundo)
        paralaxeNuvens: 0.12,
        paralaxeIlhas: 0.3,
        // nuvens andando com o vento (px/s)
        ventoNuvens: 3,
        // sol: altura acima do horizonte às 18h e posição na tela (0 a 1)
        solAltura: 70,
        solX: 0.72,
        // lua: altura máxima do arco acima do horizonte
        luaAltura: 230,
        // estrelas
        estrelas: 70,
        // reflexo da lua no mar
        reflexoComprimento: 46,
    },

    // ---- luzes do cenário ---------------------------------------------------
    luzes: {
        poste: { raio: 74, cor: "#ffcf8a", intensidade: 0.5 },
        janela: { raio: 44, cor: "#ffcf8a", intensidade: 0.45 },
        // luz fraca em volta do faroleiro, para ele não sumir no escuro
        aura: { raio: 26, cor: "#ffe7c0", intensidade: 0.12 },
        // tremor do raio desenhado (px)
        tremor: 1.5,
        // quanto a luz entra no chão que ela atinge (px)
        entradaNoChao: 6,
        // janela acesa dentro de casa-<tema>.png
        janelaX: 15,
        janelaY: 29,
        // a lâmpada do poste dentro de poste-<tema>.png
        lampadaX: 8,
        lampadaY: 6,
    },
};

// ---- peças da torre (tarefa 7) ---------------------------------------------
// Às 18h30, 19h30, 20h30 e 21h surge uma peça na praia, alternando as pontas
// (era 19h, 20h, 21h e 22h; com o Holandês às 22h a última não cabia).
export const PECAS = {
    // horas (cheias ou h:30) em que surge uma peça e o ícone de cada uma
    // (itens-<tema>.png: 0 tábua, 1 pedra, 2 ferro, 3 corda)
    horas: [minutosDe(18, 30), minutosDe(19, 30), minutosDe(20, 30), minutosDe(21)],
    icones: [0, 1, 2, 3],
    // pontos do mapa, na ordem de alternância
    pontos: ["PecaEsquerda", "PecaDireita"],
    // minutos de jogo até o mar levar a peça (a das 21h afunda às 21h50,
    // antes do Holandês)
    duracao: 50,
    // afundando: segundos e px descendo
    afundar: 1.4,
    afundarPx: 14,
    // flutuando: altura acima do chão, amplitude e velocidade da onda
    altura: 12,
    flutuar: 3,
    ritmo: 2.2,
    // caixa para pegar (px)
    caixa: 14,
    // feixe vertical: altura, largura e opacidade
    feixeAltura: 220,
    feixeLargura: 10,
    feixeOpacidade: 0.22,
    // luz em volta da peça
    luz: { raio: 34, cor: "#ffe7a8", intensidade: 0.35 },
    // indicador na borda da tela: margem (px da tela)
    indicadorMargem: 14,
};

// ---- cena do conserto da torre ----------------------------------------------
// Tempos em ms desde o começo da cena (~3,5 s no total).
export const CENA = {
    // câmera indo até a torre e voltando
    ida: 700,
    volta: 700,
    zoom: 1,
    // marteladas (o estágio troca na última)
    marteladas: [1000, 1350, 1700],
    // começo da volta da câmera
    voltar: 2700,
    // faixas pretas: altura (px da tela) e tempo entrando/saindo
    faixaAltura: 34,
    faixaEntrada: 300,
    // texto "Torre 2/4": aparece na última martelada e dura isto
    textoDuracao: 1000,
    // tremor de cada martelada: intensidade e ms
    tremor: 1.5,
    tremorMs: 160,
    // faíscas por martelada (a última solta o dobro)
    faiscas: 8,
    // luz na torre durante a cena (para ela aparecer no escuro)
    luz: { raio: 110, cor: "#ffe7c0", intensidade: 0.35 },
    // bônus de peça além da quarta: corações curados
    curaDoBonus: 2,
};

// ---- monstros -----------------------------------------------------------------
// Vida em "dano de luz": a lanterna dá FASE1.lanterna.danoPorSegundo (10)
// por segundo, então vida 8 = 0,8 s de luz. Os mini-chefes têm
// MINI_CHEFE.vida vezes a vida do comum.
export const MONSTROS = {
    caranguejo: {
        // era 12
        vida: 8,
        // caixa de colisão (os pés na base)
        largura: 20,
        altura: 13,
        // andando, perseguindo e o pulo para subir degraus
        velocidade: 38,
        perseguir: 62,
        pulo: 330,
        gravidade: 900,
        // persegue o jogador mais perto que isto (px)
        distanciaDeCaca: 150,
        // ataque com a pinça: distância, duração, momento do golpe e espera
        distanciaDoAtaque: 20,
        ataque: 0.45,
        golpe: 0.2,
        esperaDoAtaque: 0.9,
        alcanceDaPinca: 10,
        dano: 1,
        // saindo do mar: segundos e quanto sobe
        surgir: 1.2,
        fps: 8,
    },
    alma: {
        // era 8
        vida: 5,
        largura: 14,
        altura: 14,
        // voo: velocidade, altura acima do jogador e a onda
        velocidade: 55,
        alturaDoVoo: 60,
        onda: 14,
        ritmoDaOnda: 3,
        // mergulho: começa a esta distância (px), velocidade e espera
        distanciaDoMergulho: 90,
        mergulho: 170,
        esperaDoMergulho: 1.6,
        // recuo na luz (px/s)
        recuo: 90,
        dano: 1,
        // aparecendo (s)
        surgir: 0.6,
        fps: 7,
    },
    // pirata fantasma do Holandês (etapas 2 e 3): desce do navio por uma
    // prancha de luz, anda na areia com a física e ataca com o sabre
    pirata: {
        // era 10
        vida: 7,
        largura: 10,
        altura: 24,
        velocidade: 42,
        perseguir: 60,
        // pulo para subir degraus (a praia da direita tem um de 48 px)
        pulo: 345,
        gravidade: 900,
        // persegue o jogador mais perto que isto (px)
        distanciaDeCaca: 260,
        // sabre: distância, duração, momento do golpe, espera e alcance
        distanciaDoAtaque: 14,
        ataque: 0.5,
        golpe: 0.25,
        esperaDoAtaque: 1,
        alcanceDoSabre: 14,
        dano: 1,
        // descendo a prancha (s)
        descer: 1.1,
        fps: 7,
    },
    // zumbi (src/fase1/monstros/Zumbi.js): só nasce das lápides (LAPIDE),
    // persegue o jogador pelo chão e pula os degraus como o caranguejo
    zumbi: {
        // era 17
        vida: 14,
        // fração da velocidade do jogador (FASE1.jogador.velocidade); era
        // 0.45, agora metade
        velocidade: 0.225,
        dano: 1,
        // caixa de colisão (os pés na base)
        largura: 12,
        altura: 20,
        pulo: 330,
        gravidade: 900,
        // saindo da terra ao pé da lápide (s), sem ferir
        surgir: 0.6,
        // ms por quadro andando e parado
        msAndar: 120,
        msParado: 520,
    },
    // vampiro (src/fase1/monstros/Vampiro.js): das 21h em diante, um por vez;
    // persegue o jogador pelo chão e, perto dele, para com os olhos brilhando
    // e dá um dash reto. Qualquer toque de luz mata.
    vampiro: {
        // 1: qualquer toque de luz mata (Vampiro.levarLuz)
        vida: 1,
        // fração da velocidade do jogador (FASE1.jogador.velocidade); era
        // 0.7, agora 25% mais rápido
        velocidade: 0.875,
        // dano do dash; encostar fora do dash tira danoDeContato
        dano: 2,
        danoDeContato: 1,
        // começa o aviso a esta distância do jogador (px, centro a centro)
        alcanceDoDash: 90,
        // parado com os olhos brilhando antes do dash (s)
        aviso: 0.4,
        // dash: velocidade em vezes a do jogador, duração (s); ignora a
        // gravidade. Era 3 por 0,3 s: 20% mais lento e um pouco mais longo,
        // com o mesmo alcance (~100 px) e mais tempo para pular de lado
        dash: { velocidade: 2.4, duracao: 0.38 },
        // parado depois do dash (s)
        pausa: 1.2,
        // nascimento: a partir de `desde`, a cada `intervalo` s, até `maximo` vivos
        desde: minutosDe(21),
        intervalo: [40, 60],
        maximo: 1,
        avisoTexto: "Um vampiro espreita!",
        // caixa de colisão (os pés na base)
        largura: 10,
        altura: 22,
        pulo: 345,
        gravidade: 900,
        // aparecendo (s), sem ferir
        surgir: 0.5,
        // opacidade dos olhos por cima da escuridão fora do aviso (no aviso: 1)
        olhosNoEscuro: 0.5,
        // ms por quadro andando
        msAndar: 110,
    },
    // quadro branco de dano piscando (s) e tempo da morte (s)
    piscar: 0.08,
    morte: 0.5,
    // caiu no mar ou saiu do mapa: some
    margemDoMapa: 64,
};

// Mini-chefes às 19h30 (caranguejo) e 21h30 (alma): o mesmo sprite em
// escala 2, contorno brilhante, barra de vida e um baú ao morrer.
export const MINI_CHEFE = {
    porMeiaHora: {
        [minutosDe(19, 30)]: "caranguejo",
        [minutosDe(21, 30)]: "alma",
    },
    escala: 2,
    vida: 6,
    velocidade: 0.8,
    dano: 1,
    // alcance da luz contra ele (o corpo é maior)
    alcanceExtra: 16,
    // barra de vida acima do corpo
    barraLargura: 36,
    barraAltura: 4,
    barraAcima: 8,
    // halo e contorno
    haloRaio: 26,
    contornoLargura: 1,
    avisos: {
        caranguejo: "Um caranguejo gigante surgiu!",
        alma: "Uma alma gigante surgiu!",
    },
};

// Baú que o mini-chefe derruba: cai com física e abre ao encostar.
// Coração que os monstros comuns soltam (Diretor.aoMorrer e itens/Coracao.js).
export const CORACAO = {
    // chance de soltar um coração ao morrer pela luz
    chance: 0.18,
    // garantia: depois de tantas mortes seguidas sem coração, o próximo solta
    garantia: 6,
    // com o jogador com pouca vida a chance sobe: + isto por coração faltando
    chancePorCoracaoFaltando: 0.05,
    lado: 10,
    gravidade: 900,
    pulo: 140,
    // segundos até sumir e, no fim, quanto tempo pisca
    duracao: 14,
    piscar: 3,
};

export const BAU = {
    largura: 14,
    altura: 12,
    gravidade: 900,
    // pulinho ao cair do chefe
    pulo: 160,
    // ms entre abrir e a peça sair (a peça sobe do baú)
    espera: 700,
    subida: 18,
    // depois de aberto, some em (s)
    sumir: 6,
    // cartas que o baú dá a escolher (src/fase1/cartasDoBau.js), cada uma
    // até `maximo` vezes na partida: Bateria maior soma `passo` s à bateria
    // máxima (12 → 16 → 20) e enche; Luz forte soma `fator` ao dano por
    // segundo da lanterna (10 → 14 → 18; era 0,3)
    cartas: {
        bateria: { passo: 4, maximo: 2 },
        dano: { fator: 0.4, maximo: 2 },
    },
};

// Lápides (src/fase1/monstros/Lapide.js): a partir de `desde`, a cada
// `intervalo` s (sorteado) uma lápide brota num ponto "lapide" do mapa fora da
// vista, até `maximo` vivas. A cada `zumbiACada` s solta um zumbi, até
// `zumbisPorLapide` vivos dela; no limite, o próximo só sai `zumbiACada` s
// depois de um deles morrer. Vida em dano de luz (1 = qualquer toque de luz
// a racha). Não fere por contato nem bloqueia o caminho.
export const LAPIDE = {
    // era 20
    vida: 1,
    intervalo: [80, 100],
    maximo: 2,
    desde: minutosDe(20),
    zumbiACada: 8,
    zumbisPorLapide: 2,
    largura: 16,
    altura: 22,
    aviso: "Uma lápide brotou da areia!",
    // brotando do chão (s) e quadro rachado antes de virar fumaça (s)
    surgir: 0.8,
    rachar: 0.3,
    // tremor (px) enquanto leva luz
    tremor: 1,
};

// linha "lapide" da tabela do diretor (das 20h em diante)
const ONDA_DE_LAPIDES = { intervalo: LAPIDE.intervalo, maximo: LAPIDE.maximo };

// linha "vampiro" da tabela do diretor (das 21h em diante)
const ONDA_DE_VAMPIROS = { intervalo: MONSTROS.vampiro.intervalo, maximo: MONSTROS.vampiro.maximo };

// Diretor dos monstros comuns: a partir de `desde` (minutos da noite), a cada
// `intervalo` s (sorteado entre os dois valores) nasce um monstro, até
// `maximo` vivos daquele tipo. null = o tipo não aparece. As lápides
// (LAPIDE) contam só entre elas, fora do teto maximoTotal; o vampiro
// (MONSTROS.vampiro) também fica fora desse teto.
// Das 21h em diante, com o vampiro, caranguejos e almas têm 1 vivo a menos e
// intervalo 10% maior (arredondado em 1 casa) que na versão sem ele.
export const DIRETOR = {
    tabela: [
        { desde: minutosDe(18, 15), caranguejo: { intervalo: [8, 11], maximo: 2 }, alma: null, lapide: null, vampiro: null },
        { desde: minutosDe(19), caranguejo: { intervalo: [6.5, 9], maximo: 3 }, alma: null, lapide: null, vampiro: null },
        { desde: LAPIDE.desde, caranguejo: { intervalo: [5.5, 7.5], maximo: 4 }, alma: { intervalo: [8, 11], maximo: 2 }, lapide: ONDA_DE_LAPIDES, vampiro: null },
        { desde: MONSTROS.vampiro.desde, caranguejo: { intervalo: [5, 7.2], maximo: 4 }, alma: { intervalo: [7.2, 9.9], maximo: 2 }, lapide: ONDA_DE_LAPIDES, vampiro: ONDA_DE_VAMPIROS },
        { desde: minutosDe(21, 30), caranguejo: { intervalo: [3.9, 5.5], maximo: 5 }, alma: { intervalo: [5.5, 7.7], maximo: 3 }, lapide: ONDA_DE_LAPIDES, vampiro: ONDA_DE_VAMPIROS },
    ],
    // teto de monstros vivos somando todos
    maximoTotal: 9,
    // primeiro monstro de um tipo: espera (s) depois de liberar o tipo
    primeiraEspera: 2,
    // almas nascem fora da vista: px além da borda
    foraDaVista: 24,
};

// Avisos no meio da tela (s).
export const AVISO = { duracao: 2.6, entrada: 0.25, saida: 0.6 };

// ---- o Holandês Voador (tarefa 9) ---------------------------------------------
// Chefe das 22h às 23h. Posições "do quadro"
// são pixels dentro de um quadro de navio-<tema>.png (192×160). O "morro" é
// o topo da ilha com a casa e a torre: x do ponto "Torre" do mapa e y do
// chão ali (Holandes.morro()); as distâncias "do morro" contam a partir dele.
export const HOLANDES = {
    // navio-<tema>.png: 3 quadros (inteiro, avariado, muito avariado)
    quadroLargura: 192,
    quadroAltura: 160,
    // linha d'água do quadro: a quilha fica logo acima dela; no ar, o
    // desenho para nela (a água pintada abaixo não aparece)
    linhaDagua: 140,
    // primeira linha do quadro com desenho (ponta dos mastros)
    topoDoQuadro: 10,
    // as lanternas verdes no alto dos mastros (pontos fracos)
    lanternas: [
        { x: 48, y: 30 },
        { x: 100, y: 14 },
        { x: 150, y: 34 },
    ],
    // vida de cada lanterna em dano de luz (10 por segundo: 15 s de luz; era
    // 45, depois 90)
    vidaDaLanterna: 150,
    // ao apagar uma lanterna a bateria enche (como o baú do mini-chefe)
    encherBateriaAoApagar: true,
    // opacidade do navio fantasma depois de chegar
    opacidade: 0.9,

    // ---- altura sobre o morro ---------------------------------------------------
    // Quilha em relação ao topo da torre (px; negativo = abaixo dele). O
    // design pedia 60 acima, mas aí a lanterna mais alta ficaria a ~316 px
    // do chão do morro, fora do alcance de chefe (260). Com -16 a quilha
    // passa rente ao alto da torre e a lanterna mais alta fica a 240 px do
    // chão do morro no ponto mais alto do balanço.
    alturaSobreATorre: -16,
    // altura da torre inteira (px; a imagem da torre, cenario.js)
    alturaDaTorre: 128,
    // sombra fraca no chão sob o navio: meia largura (fração da largura do
    // quadro), meia altura (px), lado dos quadradinhos (px) e opacidade
    sombra: { largura: 0.38, altura: 4, lado: 2, alfa: 0.25 },

    // ---- entrada ------------------------------------------------------------
    // câmera indo para a área do morro (ms)
    camera: 1400,
    // segundos do horizonte até o alto do morro
    chegada: 5,
    // escala do navio no horizonte (cresce até 1 chegando)
    escalaNoHorizonte: 0.3,
    // o navio sai do horizonte este tanto (px) antes da ponta esquerda do
    // vaivém e sobe em arco até ela (longe da torre: nada some atrás dela)
    chegadaDeLado: 60,
    // espera depois de chegar até a primeira rajada (s)
    esperaInicial: 1.6,

    // ---- câmera (zoom 1) ------------------------------------------------------
    // Área fixa centrada no morro (x do ponto Torre), do tamanho da tela no
    // zoom 1, com o topo `acimaDoMorro` px acima do chão do morro: o navio
    // inteiro no alto e o topo do morro com as encostas embaixo. A área sobe
    // além do alto do mapa (a câmera deixa, ver camera.js). Holandes.area
    // guarda a área em px do mundo.
    area: { largura: 640, altura: 360, acimaDoMorro: 300 },
    // Fora da área (praias, pé das encostas) a vista segue o jogador: ela só
    // sai da área para manter o jogador a estes px das bordas (lados, alto e
    // baixo da tela).
    cameraMargem: { lados: 40, cima: 40, baixo: 28 },
    suavizarCamera: 5,
    // seta na borda da tela apontando para o navio fora da vista: aparece
    // quando sobra menos que `setaVisivel` px do navio na tela; margem (px
    // da tela) e pulso (por segundo)
    setaVisivel: 24,
    setaMargem: 10,
    setaPulso: 5,

    // ---- navegação ------------------------------------------------------------
    // vaivém sobre o morro: x = morro + amplitude × sen(2π × ciclo × t)
    // (amplitude em px, ciclo em idas e voltas por segundo); para com a
    // prancha aberta. O design pedia 0,3 ciclo/s, mas isso dá um pico de
    // 226 px/s (o dobro do jogador); 0,15 fica no "devagar" que ele descreve.
    vaivem: { amplitude: 120, ciclo: 0.15 },
    // balanço no ar: px de sobe e desce, ritmo e inclinação (rad)
    balanco: 2,
    ritmoDoBalanco: 1.6,
    inclinacao: 0.012,

    // ---- balas de canhão ------------------------------------------------------
    // por etapa (1 a 3): balas por rajada e espera entre rajadas (s)
    rajadas: [
        { balas: 3, intervalo: [4.2, 5.4] },
        { balas: 3, intervalo: [5, 6.4] },
        { balas: 5, intervalo: [4.6, 5.8] },
    ],
    // o X pisca no chão este tempo antes da bala cair (s)
    aviso: 1,
    // voo da bala (s; a bala sai do canhão aviso - voo depois do X)
    voo: 0.8,
    // entre um X e o próximo da mesma rajada (s)
    entreBalas: 0.28,
    // distância entre os X da rajada (px), com um sorteio de ±espalharSorteio
    espalhar: 44,
    espalharSorteio: 10,
    // os X só caem entre estes x (px, contados do x do morro); os piratas
    // também ficam entre eles (Holandes.alvoMinimoX e alvoMaximoX em px do
    // mundo)
    alvoMinimoX: -300,
    alvoMaximoX: 300,
    // altura do arco acima da linha reta (px)
    alturaDoArco: 70,
    // raio do dano da explosão (px, do ponto de impacto ao meio do jogador)
    raioDaExplosao: 22,
    danoDaBala: 1,
    tremorDaExplosao: 2.5,
    tremorDaExplosaoMs: 180,
    // canhões no casco (do quadro): a bala sai de um deles
    canhoes: [
        { x: 40, y: 112 },
        { x: 82, y: 114 },
        { x: 124, y: 114 },
    ],
    // rastro: posições guardadas
    rastro: 8,

    // ---- piratas (etapas 2 e 3) ------------------------------------------------
    piratas: {
        // piratas por onda (sorteio inclusivo) e vivos no máximo
        porOnda: [2, 3],
        maximo: 3,
        // espera entre ondas (s), contada quando a onda anterior acabou de descer
        intervalo: 11,
        // primeira onda depois de subir de etapa (s)
        primeira: 1.5,
        // entre um pirata e o próximo na prancha (s)
        entreDescidas: 0.6,
    },
    // prancha de luz: sai do convés (do quadro) até o topo do morro
    // (Holandes.morro())
    prancha: {
        convesX: 20,
        convesY: 98,
        // abrindo e fechando (s)
        abrir: 0.45,
        fechar: 0.45,
        largura: 3,
    },

    // ---- névoa ------------------------------------------------------------------
    nevoa: {
        // flocos de névoa: quantidade e quanto do mundo cobrem para cada lado
        // do x do morro (px)
        flocos: 34,
        meiaLargura: 360,
        // raio (px) e altura acima do chão
        raio: [14, 30],
        altura: [0, 20],
        alturaDensa: [0, 46],
        // opacidade de cada floco (normal e densa, na etapa 3)
        opacidade: 0.07,
        opacidadeDensa: 0.14,
        // velocidade de deriva (px/s)
        deriva: [4, 10],
        // segundos para engrossar ou sumir
        transicao: 2.5,
    },
    // na etapa 3 a névoa gasta a bateria este tanto mais rápido
    gastoNaNevoa: 2,

    // ---- dano nas lanternas -------------------------------------------------------
    // brilho pulsando: raio (px) e ritmo
    brilhoRaio: 11,
    brilhoPulso: 5,
    // faíscas enquanto leva luz (s entre punhados)
    faiscasNaLuz: 0.12,
    // lanterna apagada: tremor e partículas de fogo-fátuo
    tremorAoApagar: 4,
    tremorAoApagarMs: 450,
    fogoFatuo: 26,

    // ---- afundar e a lente ----------------------------------------------------------
    // O navio inclina, perde altura e cai no mar ao fundo: a escala cai até
    // `escalaAfundando` (mais longe) e ele desce até `abaixoDoHorizonte` px
    // abaixo do horizonte do céu, cortado na linha do horizonte. Ele se
    // afasta para o lado em que está, até `derivaAfundando` px do x do morro,
    // para não cair na frente da torre.
    afundar: 4.5,
    inclinarAfundando: 0.22,
    escalaAfundando: 0.5,
    abaixoDoHorizonte: 75,
    derivaAfundando: 160,
    // explosões e bolhas enquanto afunda (s entre cada)
    explosaoAfundando: 0.8,
    bolhas: 0.05,
    // a lente é lançada ao chão perto da torre: voo (s), altura do arco e o
    // x em relação à torre (px; negativo = à esquerda, do lado da casa)
    lente: { icone: 5, voo: 1.3, alturaDoArco: 90, distanciaDaTorre: -40, espera: 1.2 },

    // ---- barra de vida no alto (px da tela) ----------------------------------------
    barraLargura: 240,
    barraAltura: 8,
    barraY: 26,

    avisos: {
        entrada: "O Holandês Voador!",
        lanternas: "Mire nas lanternas verdes!",
        etapa2: "Piratas fantasmas!",
        etapa3: "A névoa engrossa!",
        afundar: "O Holandês afunda!",
        lente: "Pegue a lente do farol!",
    },
    // segundos entre o aviso de entrada e o das lanternas
    avisoDasLanternas: 3,
};

// Minimapa do HUD (src/fase1/Minimapa.js): `escala` px de tela por tile,
// `margem` até a borda, `alfaFundo` do fundo escuro, `ponto` e `pontoChefe`
// são o lado (px) do ponto comum e do mini-chefe.
export const MINIMAPA = { escala: 2, margem: 8, alfaFundo: 0.6, ponto: 2, pontoChefe: 3 };