# Roteiro de Apresentação — Delivered by Noon

- **Disciplina / Projeto:** Trabalho de faculdade (PlayCanvas 2.x + TypeScript + Blender)
- **Datas previstas em sala:** 24 e 25/11/2026
- **Duração alvo:** **10 a 12 minutos** (apresentação + demonstração ao vivo) + espaço para perguntas
- **Integrantes (4):** João Victor da Costa, Gabriel Monteiro, Rafael Lima Henriques, Lucas Tostes
- **Foco de avaliação:** Critério 3 (**correta aplicação do PlayCanvas**, 5 pts) e Critério 6 (**clareza, domínio técnico, demo prática e respostas à banca**, 10 pts)

---

## 1. Divisão das falas e da demonstração (11 min)

Cada integrante apresenta **uma parte técnica curta** e conduz **uma etapa prática** ao vivo, garantindo domínio distribuído entre os 4.

| Tempo | Integrante | Parte Técnica (explicação) | Parte Prática (demo ao vivo) |
|---|---|---|---|
| **0:00 – 2:45** *(2m45)* | **João Victor da Costa** | Abertura, conceito de *Delivered by Noon*, arquitetura modular (`game.ts` + `types.ts`) e **como aproveitamos o PlayCanvas Editor** (Hierarchy, assets GLB, cena montada e atributos ao vivo). | Mostra a cena aberta no **PlayCanvas Editor** (entidades `Jogo`, `Mundo`, `UniAcademia`), altera **Mostrar FPS** e **Duração do dia** no Inspector e clica em **Launch** mostrando menu inicial e tela de história. |
| **2:45 – 5:30** *(2m45)* | **Gabriel Monteiro** | **Mapa real de Juiz de Fora** (OpenStreetMap ODbL + AWS Terrain Tiles, escala 0,49), otimizações de FPS (*batching*, spatial hash, iluminação diurna limpa) e **física dos carros** (`carphysics2d` MIT, FWD vs RWD, nitro). | Dirige o **Hatch** no Centro, faz uma entrega guiado pelas colunas de luz e pelo minimapa de Juiz de Fora, mostra sair/entrar no veículo com **`E`** e acelera o **Coupé Tunado** com **nitro (`Shift`)** e drift. |
| **5:30 – 8:15** *(2m45)* | **Rafael Lima Henriques** | **Física aérea**: helicóptero MD 500 (`FGRotor` do JSBSim, LGPL-2.1, pairado estável) e avião **A-29 Super Tucano** (6-DOF JSBSim + instrutor de mira por mouse), além do sistema de câmeras e cabine 2D. | Decola com o **Helicóptero** no heliponto, pousa em uma cobertura/Cristo do Imperador; depois decola o **A-29** na pista da Serrinha (SBJF), alterna câmera de cabine (`C`), solta fumaça (`F`) e faz um lançamento aéreo (`Espaço`). |
| **8:15 – 11:00** *(2m45)* | **Lucas Tostes** | **Modelagem 3D no Blender** (veículos e fachada histórica da UniAcademia), **HUD/minimapa/luz da manhã**, **áudio procedural** em Web Audio API (Engine Sim MIT) e **qualidade** (testes em Vitest + pipeline de publicação). | Sobrevoa e faz a **entrega final na UniAcademia** (destaque dourado com partículas), mostra a **tela de vitória**, abre rapidamente a tela de **Créditos** (mostrando licenças JSBSim, MIT e OpenStreetMap ODbL) e encerra passando para perguntas. |

---

## 2. Roteiro passo a passo da demonstração ao vivo (usando o Modo Apresentação)

Uma partida normal dura **30 minutos reais**; na banca (~10 minutos), use o **Modo apresentação** (botão no menu inicial ou atributo **Modo apresentação** no Inspector do PlayCanvas Editor). Ele exibe o selo discreto **`MODO APRESENTAÇÃO`** no canto inferior esquerdo, desliga o registro de recorde e ativa **F1–F6** somente durante a demo:

| Tecla | Ação (só no Modo apresentação) | Momento no roteiro |
|---|---|---|
| **F1** | Estágio 1 — Hatch no Centro (`06:00`, início da manhã) | Gabriel abre a demo dirigindo no Centro |
| **F2** | Estágio 2 — Coupé Tunado (`07:30`, manhã clara) | Gabriel mostra nitro (`Shift`) e drift (`Espaço`) |
| **F3** | Estágio 3 — Helicóptero (`09:00`, sol alto) | Rafael mostra pairado e pouso em cobertura / Cristo |
| **F4** | Estágio 4 — A-29 na Serrinha (`10:30`, reta final da manhã) | Rafael decola, mostra mira por mouse, cabine (`C`) e fumaça (`F`) |
| **F5** | **Entrega final** — A-29 no ar perto da UniAcademia (`11:15`, quase almoço) | Lucas solta a última caixa (`Espaço`) sobre a UniAcademia e mostra a vitória |
| **F6** | **Avança +1h no relógio** | Qualquer integrante pode apertar para mostrar o sol da manhã subindo até 12:00 e a urgência das 11:00 |

Ordem recomendada (mantenha o **PlayCanvas Editor** já aberto em uma aba e o jogo pronto em **Launch**):

1. **No PlayCanvas Editor (45 s — João Victor):**
   - Mostrar a **Hierarchy** com `Jogo`, `Mundo`, `A29`, `Heli`, `Carro_Inicial`, `Carro_Tunado` e `UniAcademia`.
   - Dar foco na `UniAcademia` (selecionar e apertar **`F`**) para a turma reconhecer o prédio histórico de Juiz de Fora direto no Viewport.
   - Selecionar **`Jogo`** → mostrar o componente **Script (`simuladorVoo`)** no **Inspector** com os 8 atributos editáveis; marcar **`Mostrar FPS`**, **`Modo apresentação`** e ajustar **`Dificuldade = Fácil`** e **`Duração do dia = 10`**.
2. **Menu, tela de carregamento e Modo apresentação (30 s — João Victor):**
   - No **Launch**, destacar a tela de carregamento real dos GLBs/texturas; no menu inicial, clicar em **`Modo apresentação`** (escolher `Carro`, dia de `10 min`) e iniciar.
3. **Estágio 1 — Hatch no Centro + troca de veículo (1m30 — Gabriel):**
   - Dirigir pelas ruas reais do Centro observando o **minimapa de Juiz de Fora** (Rio Paraibuna, marcos e UniAcademia em dourado) e as colunas de luz.
   - Concluir uma entrega, parar, apertar **`E`** para sair a pé (mostrar o personagem) e entrar novamente com **`E`**; apertar **`F6`** uma vez se quiser mostrar o céu mudando.
4. **Estágio 2 — Coupé Tunado com Nitro (1 min — Gabriel):**
   - Apertar **`F2`** para pular direto ao estágio do Coupé Tunado (`07:30`, manhã clara), ativar **`Shift`** (barra de nitro + chamas no escape + ronco V8 com estouros) e fazer uma curva puxando o freio de mão (**`Espaço`**).
5. **Estágio 3 — Helicóptero no heliponto e morros (1m15 — Rafael):**
   - Apertar **`F3`** para ir ao estágio do Helicóptero (`09:00`), subir do heliponto no Centro, mostrar o pairado estável sobre Juiz de Fora e pousar numa cobertura ou junto ao Cristo do Imperador.
6. **Estágio 4 — A-29 decolando da Serrinha (1m30 — Rafael):**
   - Apertar **`F4`** para ir ao estágio do A-29 (`10:30`), acelerar na pista da Serrinha (SBJF), decolar, mostrar a mira por mouse (e alternar **`M`** para teclado), abrir câmera de cabine (**`C`**) com horizonte artificial, ligar a fumaça (**`F`**) e lançar uma carga aérea (**`Espaço`**).
7. **Entrega final na UniAcademia e Vitória (1 min — Lucas):**
   - Apertar **`F5`** (ou marcar *"Ir direto para a entrega final"* no menu do Modo apresentação) para posicionar o A-29 perto da **UniAcademia** (`11:15`, reta final antes do almoço + feixe dourado duplo com partículas), apertar **`Espaço`** para concluir a 16ª entrega, mostrar a **tela de vitória (`MISSÃO CUMPRIDA!`)** e abrir rapidamente **Créditos** (licenças JSBSim, MIT, OpenStreetMap ODbL e AWS Terrain Tiles).

### Plano B (se algo falhar na hora)

| Imprevisto | Plano B imediato |
|---|---|
| **Wi-Fi da sala cair ou Editor ficar lento** | Rodar a cópia local já preparada no notebook com `npm run dev` (`http://localhost:5173`) e entrar pelo botão **`Modo apresentação`** — funciona 100% offline com exatamente o mesmo código. |
| **Falta de tempo ou acidente no meio de um estágio** | Apertar **`F1–F4`** para pular instantaneamente para o estágio seguinte ou **`F5`** para ir direto à entrega final na UniAcademia sem perder o ritmo da apresentação. |
| **Querer mostrar a manhã avançando e a urgência das 11:00** | Apertar **`F6`** repetidamente (+1h por clique) para passar de `06:00` até `11:00+` com o sol subindo e a vinheta/tique de urgência ativando. |
| **Travamento de navegador / áudio mudo** | Ter o **vídeo gravado em 1080p (~2 min)** pronto em tela cheia cobrindo Editor, os 4 veículos, entrega final na UniAcademia e tela de vitória. |
| **Controle difícil durante nervosismo** | Deixar **`Dificuldade = Fácil`** (+35% raio das entregas) e **`Duração do dia = 10 min`** selecionados antes de começar. |

---

## 3. Como o PlayCanvas foi aproveitado (Critério 3 — 5 pontos)

Destaque explicitamente estes **5 recursos nativos do PlayCanvas** durante a fala:

1. **Editor online + cena na Hierarchy:** mundo de Juiz de Fora, veículos e UniAcademia organizados como entidades reais na cena, inspecionáveis e navegáveis no Viewport (não apenas um canvas vazio).
2. **Pipeline de assets 3D (GLB):** modelos exportados do Blender importados como assets nativos do PlayCanvas (`template`/`render` ou `model`), com nós internos animados (`Prop`, `Rotor`, `TailRotor`, `Roda_*`).
3. **Atributos de Script no Inspector (ESM e Clássico):** 8 parâmetros expostos com título, descrição, limites e enum (`@attribute` em `flight-sim.mjs` e `attributes.add` em `flight-sim.js`), incluindo **Mostrar FPS** e **Modo apresentação**, reagindo **ao vivo** ao evento `attr` sem reiniciar o jogo.
4. **Ciclo de vida e componentes da Engine 2.x:** uso de `camera` (tone mapping ACES, FOV dinâmico), `light` direcional com sol da manhã subindo de `06:00` a `12:00`, névoa linear diurna, `StandardMaterial` e `destroy()` limpo no `disable`/`destroy` do script.
5. **Publicação automatizada via REST API oficial:** `npm run build:editor` + `npm run publicar:editor` enviam scripts e modelos diretamente para o branch do projeto no PlayCanvas.

---

## 4. 12 perguntas prováveis do professor (com respostas curtas)

1. **Como o grupo dividiu o trabalho e qual foi o papel de cada um?**
   > "Trabalhamos com módulos bem separados por contrato (`types.ts`): arquitetura e Editor, mapa de Juiz de Fora e física terrestre, física aérea e câmeras, modelagem no Blender, HUD/áudio e testes. Todo mundo revisou a documentação e consegue explicar e demonstrar o jogo todo."

2. **Vocês usaram o PlayCanvas Editor de verdade ou só colocaram um script num projeto vazio?**
   > "Usamos o Editor de verdade: a cena tem as entidades do mundo, veículos, câmera, sol e UniAcademia montadas na Hierarchy e visíveis no Viewport, todos os modelos GLB importados como assets e 7 atributos editáveis no componente Script que alteram o jogo ao vivo."

3. **Como garantiram bom desempenho (FPS) com uma cidade inteira de Juiz de Fora no navegador?**
   > "Quatro otimizações principais: *batching* de geometria por material (pouquíssimos *draw calls*), postes usando material emissivo em vez de luzes dinâmicas, malha de relevo de 30 m com *spatial hash* na colisão e minimapa pré-renderizado uma única vez em canvas auxiliar."

4. **A física do avião, do helicóptero e dos carros foi feita do zero ou baseada em bibliotecas?**
   > "Adaptamos núcleos abertos consolidados para TypeScript com licenças respeitadas: `carphysics2d` (MIT) para os carros, e um subconjunto educacional do JSBSim (LGPL-2.1) para o avião A-29 e o rotor do helicóptero MD 500 — com uma camada arcade em cima para ficar gostoso de jogar."

5. **Qual a diferença prática entre a física real e a assistência arcade no jogo?**
   > "A base física garante inércia, deriva dos pneus, sustentação, estol e torque realistas; a assistência arcade entra como um 'instrutor' que traduz o mouse/teclado em comandos suaves e evita que o jogador perca o controle por pequenos erros."

6. **Como os dados reais de Juiz de Fora foram trazidos para o jogo? E as licenças?**
   > "Extraímos ruas, rio, parques, UFJF, estádio e pista da Serrinha do OpenStreetMap (licença ODbL) e o relevo real do AWS Terrain Tiles usando um script offline (`importar-jf.mjs`) em escala 0,49. Todas as atribuições e licenças estão nos Créditos dentro do jogo e no README."

7. **Por que escala 0,49 e não 1:1 para a cidade?**
   > "Em escala 1:1 atravessar Juiz de Fora de carro levaria tempo demais para um jogo de entregas; em 0,49 preservamos a geografia reconhecível (Centro, Morro do Imperador, UFJF, Serrinha, UniAcademia) deixando o ritmo dinâmico para um turno completo."

8. **Como vocês fizeram os modelos 3D e evitaram problemas de peso ou direitos autorais?**
   > "Modelamos todos os veículos, o personagem e a UniAcademia no Blender, mantendo cada carro abaixo de ~200 kB e a UniAcademia perto de 500 kB (~10 mil triângulos), sem usar logotipos, marcas comerciais ou modelos baixados de terceiros."

9. **Como funciona o som se não há arquivos MP3 pesados no projeto?**
   > "Usamos síntese procedural com Web Audio API (`sound.ts`): motores, nitro, rotor, vento, efeitos de interface e música dinâmica são gerados matematicamente em tempo real conforme a velocidade e o horário do relógio."

10. **Qual foi a maior dificuldade técnica que o grupo enfrentou e como resolveram?**
    > "Integrar física confiável sobre relevo real de morros sem o carro ou a câmera atravessarem o chão/estruturas. Resolvemos usando a mesma grade triangular de 30 m na física e na malha visual, além de `surfaceAt` com limite de teto para a câmera não subir para o telhado quando o jogador entra sob um hangar."

11. **Como vocês testaram o jogo para garantir que uma alteração não quebre o resto?**
    > "Criamos 100 testes automatizados em Vitest cobrindo física do A-29, pairado do helicóptero, aceleração/drift/nitro dos carros, geometria e bairros de Juiz de Fora, progressão da missão e troca de veículos — rodamos `typecheck`, `test`, `build` e `build:editor` a cada mudança."

12. **O que vocês melhorariam se tivessem mais um mês no projeto?**
    > "Adicionar tráfego de NPCs nas avenidas principais, mais prédios históricos de Juiz de Fora modelados no Blender (como o Cine-Theatro Central e o Museu Mariano Procópio), placar online de recordes e suporte a controle gamepad."

---

## 5. Checklist do dia da apresentação

### Na véspera (23/11)
- [ ] Rodar `npm run typecheck && npm test && npm run build && npm run build:editor` sem erros.
- [ ] Publicar a versão mais recente no PlayCanvas Editor (`npm run publicar:editor`) e conferir o **Launch** no navegador.
- [ ] Gravar o **vídeo de Plano B** (~2 min, 1080p) mostrando Editor, atributos, os 4 veículos, entrega final na UniAcademia e tela de vitória; salvar localmente no notebook e num pen drive.
- [ ] Ensaiar o roteiro completo cronometrando **10 a 11 minutos** com os 4 integrantes.
- [ ] Conferir se o notebook tem carregador, adaptador HDMI/USB-C e `npm run dev` funcionando offline.

### 30 minutos antes da apresentação
- [ ] Abrir duas abas no Chrome: (1) **PlayCanvas Editor** já na cena com `Jogo` selecionado; (2) **Launch** pronto (ou `localhost:5173` offline já aquecido).
- [ ] Testar o projetor (resolução 1080p/720p) e o áudio da sala (deixar volume moderado para não estourar os alto-falantes).
- [ ] Fechar notificações do sistema (Modo Não Perturbe) e abas desnecessárias.
- [ ] Configurar no Inspector: **`Mostrar FPS = ligado`**, **`Dificuldade = Fácil`**, **`Duração do dia = 30`** (ou `10` para mostrar o sol da manhã subindo e a urgência das 11:00 mais rápido).

### Na hora da banca
- [ ] Falar devagar olhando para o professor e a turma; quem está no teclado só joga enquanto o colega explica (ou cada um pilota sua própria etapa).
- [ ] Mostrar os atributos do Inspector ao vivo **antes** ou **durante** o Launch para pontuar forte no Critério 3.
- [ ] Fechar na tela de **Vitória** + **Créditos** e agradecer abrindo para perguntas.
