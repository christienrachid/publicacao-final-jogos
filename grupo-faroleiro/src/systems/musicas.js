// Partituras das músicas do jogo, tocadas por src/systems/som.js. Só dados.
//
// Cada música tem um andamento (bpm), a grade de 16 passos por compasso
// (um passo = semicolcheia) e uma lista de acordes. Os canais são:
//
// - melodia: notas escritas, "E5:4" = mi 5 por 4 passos, ".:4" = pausa de 4
//   passos; "|" separa compassos e é só para leitura;
// - baixo e arpejo: um padrão que se repete pela música toda e segue o
//   acorde do momento. No baixo, os números são graus do acorde ("1"
//   fundamental, "3" terça do acorde, "5" quinta, "7" sétima, "8" oitava,
//   "b2", "2", "4", "b6", "6" intervalos fixos); "'" sobe uma oitava e ","
//   desce uma. No arpejo, o número é a posição na lista de notas do acorde
//   (0 = fundamental, 1 = próxima nota do acorde, e assim por diante,
//   subindo de oitava);
// - bateria: um padrão de toques ("k" bumbo, "s" caixa, "h" chimbal, "o"
//   chimbal aberto, "t" surdo, "m" tom, "c" prato, "r" aro, "w" onda do
//   mar; "kh" = os dois juntos).
//
// O padrão de baixo, arpejo e bateria repete no próprio tamanho, que pode
// ser de um compasso ou mais. Os acordes aceitam ":n" para durar n passos
// (o padrão é um compasso de 16). Os timbres ficam em som.js.

// bateria em compassos: junte com espaço
const compassos = (...lista) => lista.join(" ");

// ---------------------------------------------------------------------------
// Menu: pôr do sol no mar. Calma, ré maior com sétimas, eco no canto e o
// mar subindo e descendo a cada dois compassos.
const MENU = {
    bpm: 76,
    loop: true,
    eco: { passos: 3, retorno: 0.32, volume: 0.28 },
    acordes:
        "Dmaj7 Bm7 Gmaj7 A Dmaj7 F#m7 Gmaj7 Asus4:8 A:8 " +
        "Gmaj7 A F#m7 Bm7 Em7 A7 Dmaj7 D",
    canais: [
        {
            tipo: "melodia",
            timbre: "canto",
            eco: true,
            notas:
                "A4:4 D5:4 F#5:6 E5:2 | D5:4 B4:4 F#4:8 | G4:4 B4:4 D5:4 E5:4 | C#5:6 B4:2 A4:8 | " +
                "A4:4 D5:4 F#5:4 A5:4 | A5:6 F#5:2 C#5:8 | B4:4 D5:4 G5:4 F#5:2 E5:2 | E5:6 D5:2 C#5:8 | " +
                "B5:6 A5:2 G5:8 | A5:6 G5:2 E5:8 | F#5:4 A5:4 C#6:4 A5:4 | B5:8 F#5:8 | " +
                "G5:6 F#5:2 E5:4 B4:4 | C#5:4 E5:4 A5:4 G5:4 | F#5:16 | .:4 A4:4 D5:4 E5:4",
        },
        { tipo: "arpejo", timbre: "brilho", oitava: 4, padrao: "0:2 1:2 2:2 3:2 4:2 3:2 2:2 1:2" },
        { tipo: "baixo", timbre: "baixoMacio", oitava: 2, padrao: "1:6 5:2 8:8" },
        { tipo: "bateria", volume: 0.8, padrao: "w:32" },
    ],
};

// ---------------------------------------------------------------------------
// Fase 1: aventura na ilha. Mi menor, baixo pulando de oitava e bateria
// animada; a segunda metade sobe para dó e ré.
const BAT_FASE1 = "k:2 h:2 s:2 h:2 k:2 k:2 s:2 h:1 h:1";
const VIRADA_FASE1 = "k:2 h:2 s:2 h:2 k:2 s:1 s:1 m:1 m:1 t:1 t:1";
const FASE1 = {
    bpm: 128,
    loop: true,
    eco: { passos: 3, retorno: 0.2, volume: 0.16 },
    acordes: "Em C G D Em C Am B C D Bm Em C D B B",
    canais: [
        {
            tipo: "melodia",
            timbre: "heroi",
            eco: true,
            notas:
                "B4:2 E5:2 G5:2 B5:4 A5:2 G5:2 F#5:2 | G5:4 E5:4 C5:4 E5:4 | " +
                "D5:2 G5:2 B5:2 D6:4 C6:2 B5:2 A5:2 | A5:6 F#5:2 D5:8 | " +
                "B4:2 E5:2 G5:2 B5:4 A5:2 G5:2 B5:2 | C6:4 B5:2 A5:2 G5:4 E5:4 | " +
                "A5:2 C6:2 E6:4 D6:2 C6:2 B5:2 A5:2 | B5:6 A5:2 F#5:4 D#5:4 | " +
                "G5:4 E5:2 G5:2 C6:8 | A5:4 F#5:2 A5:2 D6:8 | " +
                "B5:2 A5:2 F#5:4 D5:2 F#5:2 B5:4 | G5:6 F#5:2 E5:8 | " +
                "E5:2 G5:2 C6:2 E6:4 D6:2 C6:2 B5:2 | A5:2 D6:2 F#6:4 E6:2 D6:2 C6:2 A5:2 | " +
                "B5:4 D#6:4 F#6:4 D#6:4 | B5:8 F#5:4 D#5:4",
        },
        { tipo: "arpejo", timbre: "arpejo", oitava: 4, padrao: "0:1 1:1 2:1 3:1 4:1 3:1 2:1 1:1" },
        { tipo: "baixo", timbre: "baixo", oitava: 2, padrao: "1:2 8:2 1:2 8:2 1:2 8:2 5:2 8:2" },
        {
            tipo: "bateria",
            padrao: compassos(
                "kc:2 h:2 s:2 h:2 k:2 k:2 s:2 h:1 h:1",
                BAT_FASE1,
                BAT_FASE1,
                VIRADA_FASE1,
                BAT_FASE1,
                BAT_FASE1,
                BAT_FASE1,
                VIRADA_FASE1,
            ),
        },
    ],
};

// ---------------------------------------------------------------------------
// Holandês Voador: tensa, ré menor com nota sensível e tambores de guerra.
const BAT_HOLANDES = "kt:3 h:1 t:2 t:2 s:3 h:1 t:2 m:2";
const VIRADA_HOLANDES = "kt:2 m:2 t:2 m:2 s:1 s:1 s:1 s:1 t:1 t:1 m:1 m:1";
const HOLANDES = {
    bpm: 140,
    loop: true,
    acordes: "Dm Dm Bb A Dm Gm A A Dm Dm Bb A Gm Gm A A",
    canais: [
        {
            tipo: "melodia",
            timbre: "fantasma",
            notas:
                "D5:6 E5:2 F5:4 A5:4 | G#5:4 A5:4 F5:4 D5:4 | F5:6 D5:2 Bb4:8 | C#5:4 E5:4 A5:8 | " +
                "D6:4 C6:2 A5:2 F5:4 D5:4 | G5:4 Bb5:4 D6:4 C#6:4 | E5:4 G5:4 Bb5:4 A5:4 | A5:12 .:4 | " +
                "A5:2 .:2 A5:2 .:2 F5:2 A5:2 D6:4 | C#6:4 D6:4 A5:8 | Bb5:2 .:2 Bb5:2 .:2 F5:2 Bb5:2 D6:4 | " +
                "C#6:4 E6:4 A5:8 | G5:2 A5:2 Bb5:4 D6:4 Bb5:4 | Bb5:4 A5:4 G5:4 D5:4 | " +
                "E5:2 F5:2 G5:2 A5:2 Bb5:4 C#6:4 | A5:8 .:8",
        },
        { tipo: "arpejo", timbre: "tremolo", oitava: 4, padrao: "0:1 1:1 2:1 1:1" },
        { tipo: "baixo", timbre: "baixo", oitava: 2, padrao: "1:2 1:1 1:1 8:2 1:1 1:1 b2:2 1:2 5,:2 b6,:2" },
        {
            tipo: "bateria",
            padrao: compassos(BAT_HOLANDES, BAT_HOLANDES, BAT_HOLANDES, VIRADA_HOLANDES),
        },
    ],
};

// ---------------------------------------------------------------------------
// Fase 2: sombria, lá menor lento, batida de coração e muito espaço.
const FASE2 = {
    bpm: 88,
    loop: true,
    eco: { passos: 3, retorno: 0.4, volume: 0.3 },
    acordes: "Am F Dm E Am F G E Dm Am E Am Dm F E7 E",
    canais: [
        {
            tipo: "melodia",
            timbre: "sombra",
            eco: true,
            notas:
                "E5:8 C5:4 A4:4 | F5:8 E5:4 C5:4 | D5:4 F5:4 A5:6 G5:2 | G#5:6 F5:2 E5:8 | " +
                "A5:8 G5:2 E5:2 C5:4 | C6:6 A5:2 F5:8 | D5:4 G5:4 B5:4 D6:4 | B5:6 G#5:2 E5:8 | " +
                ".:4 F5:4 A5:4 D6:4 | C6:8 B5:4 A5:4 | G#5:8 B5:4 E5:4 | A5:12 .:4 | " +
                "D6:6 C6:2 A5:8 | C6:6 A5:2 F5:8 | E5:4 G#5:4 B5:4 D6:4 | B5:8 .:8",
        },
        { tipo: "arpejo", timbre: "brilho", oitava: 3, padrao: "0:2 1:2 2:2 1:2" },
        { tipo: "baixo", timbre: "baixoMacio", oitava: 2, padrao: "1:12 5,:4" },
        { tipo: "bateria", volume: 0.8, padrao: "k:2 k:6 r:8" },
    ],
};

// ---------------------------------------------------------------------------
// Kraken: épica, ré menor rápido, melodia dobrada em oitavas e galope.
const BAT_KRAKEN = "k:2 h:1 h:1 s:2 h:1 k:1 k:2 h:1 h:1 s:2 h:1 h:1";
const VIRADA_KRAKEN = "k:1 k:1 s:1 s:1 k:1 k:1 s:1 s:1 m:1 m:1 m:1 m:1 t:1 t:1 t:1 t:1";
const KRAKEN_NOTAS =
    "D5:2 F5:2 A5:2 D6:6 C6:2 A5:2 | Bb5:4 F5:4 D5:4 F5:4 | E5:2 G5:2 C6:4 E6:4 D6:2 C6:2 | C#6:8 A5:4 E5:4 | " +
    "D6:4 A5:2 D6:2 F6:4 E6:2 D6:2 | D6:4 Bb5:2 D6:2 F6:6 D6:2 | G5:2 Bb5:2 D6:4 C6:2 Bb5:2 A5:2 G5:2 | A5:4 C#6:4 E6:8 | " +
    "F6:6 E6:2 C6:4 A5:4 | E6:6 D6:2 C6:4 G5:4 | D6:6 C6:2 Bb5:4 F5:4 | E6:8 C#6:4 A5:4 | " +
    "G5:4 Bb5:4 D6:4 C6:2 Bb5:2 | F5:4 Bb5:4 D6:4 F6:4 | E6:4 C#6:4 A5:4 E5:4 | A5:8 C#6:4 E6:4";
const KRAKEN = {
    bpm: 156,
    loop: true,
    acordes: "Dm Bb C A Dm Bb Gm A F C Bb A Gm Bb A A",
    canais: [
        { tipo: "melodia", timbre: "heroi", transpor: -12, notas: KRAKEN_NOTAS },
        { tipo: "melodia", timbre: "dobra", notas: KRAKEN_NOTAS },
        { tipo: "arpejo", timbre: "arpejo", oitava: 4, padrao: "0:1 1:1 2:1 3:1" },
        { tipo: "baixo", timbre: "baixo", oitava: 2, padrao: "1:1 1:1 8:2 1:1 1:1 8:2 1:1 1:1 8:2 5:2 8:2" },
        {
            tipo: "bateria",
            padrao: compassos(
                "kc:2 h:1 h:1 s:2 h:1 k:1 k:2 h:1 h:1 s:2 h:1 h:1",
                BAT_KRAKEN,
                BAT_KRAKEN,
                VIRADA_KRAKEN,
            ),
        },
    ],
};

// ---------------------------------------------------------------------------
// Vitória: fanfarra curta em ré maior, toca uma vez.
const VITORIA = {
    bpm: 120,
    loop: false,
    eco: { passos: 3, retorno: 0.3, volume: 0.2 },
    acordes: "D G A D",
    canais: [
        {
            tipo: "melodia",
            timbre: "heroi",
            eco: true,
            notas: "A4:2 D5:2 F#5:2 A5:6 F#5:2 A5:2 | B5:4 G5:4 D6:8 | C#6:4 B5:2 A5:2 G5:4 E5:4 | D6:16",
        },
        { tipo: "arpejo", timbre: "arpejo", oitava: 4, padrao: "0:1 1:1 2:1 3:1" },
        { tipo: "baixo", timbre: "baixo", oitava: 2, padrao: "1:4 5:4 8:4 5:4" },
        { tipo: "bateria", padrao: compassos("kc:4 s:4 k:4 s:4", "k:4 s:4 k:4 s:4", "k:4 s:4 k:2 s:1 s:1 m:1 m:1 t:2", "kc:16") },
    ],
};

// ---------------------------------------------------------------------------
// Derrota: vinheta curta descendo em ré menor, toca uma vez.
const DERROTA = {
    bpm: 84,
    loop: false,
    eco: { passos: 3, retorno: 0.35, volume: 0.3 },
    acordes: "Dm Gm A Dm",
    canais: [
        {
            tipo: "melodia",
            timbre: "sombra",
            eco: true,
            notas: "A5:4 G5:4 F5:4 E5:4 | D5:4 Bb4:4 G4:8 | C#5:4 E5:4 A4:8 | D5:16",
        },
        { tipo: "arpejo", timbre: "brilho", oitava: 3, padrao: "0:4 1:4 2:4 1:4" },
        { tipo: "baixo", timbre: "baixoMacio", oitava: 2, padrao: "1:16" },
        { tipo: "bateria", padrao: compassos("t:16", ".:16", ".:16", "t:16") },
    ],
};

export const MUSICAS = {
    menu: MENU,
    fase1: FASE1,
    holandes: HOLANDES,
    fase2: FASE2,
    kraken: KRAKEN,
    vitoria: VITORIA,
    derrota: DERROTA,
};
