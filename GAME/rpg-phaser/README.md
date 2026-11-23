# Pixel Quest

**Pixel Quest** é um RPG 2D top-down desenvolvido em HTML como projeto da disciplina de Desenvolvimento de Jogos Web. O jogo acompanha Kael, Rian e Lira em uma aventura pelo Reino de Umbrael, envolvendo vingança, exploração, combate e o confronto com Gorga.

O projeto utiliza **Phaser 4**, **TypeScript** e **Vite**. Os cenários são mapas ortogonais 2D exportados pelo Tiled, e a física Arcade do Phaser é usada para movimentação e colisões.

## História

Kael sobrevive ao massacre promovido pelo Rei Tirano e é salvo por Rian e Lira durante uma tempestade na floresta. O grupo busca abrigo na Mansão de Elara e encontra pistas sobre o Cristal Lunar, uma relíquia capaz de atravessar as defesas da linhagem do rei.

O que parecia uma simples conversa com uma senhora hospitaleira revela-se uma armadilha: Elara é Gorga, uma medusa que ameaça transformar o grupo em estátuas. O Capítulo 1 termina com a derrota da chefe e a recuperação do Cristal Lunar.

## Personagens

### Kael — Guerreiro

- Sobrevivente do ataque que matou seu pai.
- Personagem principal e guerreiro do grupo.
- Especialista em combate físico e ataques de espada.
- Pode ser escolhido no menu inicial da party.

### Rian — Mago

- Irmão órfão de Lira.
- Especialista em ataques mágicos à distância.
- Pode ser escolhido no menu inicial da party.

### Lira — Fada

- Irmã órfã de Rian.
- Personagem de suporte com poderes mágicos.
- Pode ser escolhida no menu inicial da party.

O personagem escolhido é o protagonista ativo da sessão. Os outros personagens podem acompanhar o grupo em sua formação.

## Modos de jogo

- Exploração top-down por floresta e mansão.
- Movimentação em tempo real com física Arcade.
- Combate contra monstros e estátuas.
- Boss Gorga com múltiplos estados e fase final.
- Personagem ativo selecionável no início da aventura.
- Cutscenes e caixas de diálogo.
- Transições entre diferentes mapas e áreas.
- Sistema de colisão construído a partir de camadas do Tiled.
- Sistema de vida, barra de energia dos inimigos e projéteis.

## Controles

| Controle | Ação |
|---|---|
| `W` ou `↑` | Mover para cima |
| `S` ou `↓` | Mover para baixo |
| `A` ou `←` | Mover para a esquerda |
| `D` ou `→` | Mover para a direita |
| `Espaço` | Atacar |
| `E` | Interagir com portas e pontos do cenário |
| `Enter` ou `Espaço` | Avançar diálogos |
| `Esc` | Pausar ou continuar a partida |
| Mouse | Selecionar botões e opções |

Movimentos diagonais são normalizados para não ficar mais rápidos que movimentos em uma única direção.

## Instalação

### Requisitos

- Node.js 20 ou superior.
- npm.
- Navegador moderno com suporte a HTML5.

### Executar em modo de desenvolvimento

Entre na pasta do projeto:

```bash
cd rpg-phaser
npm install
```

Inicie o servidor sem o log externo do template:

```bash
npm run dev-nolog
```

Acesse:

```text
http://localhost:8080
```

Os scripts do template também estão disponíveis:

```bash
npm run dev
npm run build
npm run dev-nolog
npm run build-nolog
```

### Criar build de produção

```bash
npm run build-nolog
```

Os arquivos prontos para publicação serão gerados em `dist/`.

## Estrutura principal

```text
public/assets/                 Assets públicos do jogo
  forest/                      Cenários e cutscenes da floresta
  mansion/                     Cenários e cutscenes da mansão
  protagonistas/              Sprites dos personagens
  npcs/                        Sprites dos inimigos e da Gorga
  dialogos.png                 Painel visual dos diálogos
  cristal_lunar.png            Arte da relíquia

src/game/
  main.ts                      Configuração da cena do Phaser
  game.ts                      Cena principal, mapas e ciclo de jogo
  player.ts                    Personagem ativo, movimento e ataque
  companion.ts                 Acompanhantes da party
  controls.ts                  Entrada por teclado
  bullets.ts                   Projéteis
  slime.ts                     Slime e estátuas inimigas
  gorga.ts                     Inteligência e estados de Gorga
  dialogue.ts                  Diálogos e cutscenes
  title.ts                     Tela inicial e créditos
  party-menu.ts                Seleção da party

src/main.ts                    Bootstrap da aplicação Vite
index.html                     Página HTML que recebe o jogo
```

## Ferramentas utilizadas

- **Phaser 4:** engine de HTML5 para renderização, cenas, sprites, física Arcade e animações.
- **TypeScript:** linguagem principal da implementação.
- **Vite:** servidor de desenvolvimento e bundler de produção.
- **Tiled:** criação dos mapas ortogonais e das camadas de colisão.
- **Perchance:** geração de imagens e apoio visual para diálogos e cenários.
- **Photopea:** edição das imagens e remoção de fundos.
- **PixSpy:** localização de coordenadas em pixels para posicionar entradas e saídas entre áreas.
- **Liberated Pixel Cup:** geração e apoio na criação de spritesheets.
- **Google Gemini:** consultoria técnica, revisão da história e apoio à criação de cutscenes e diálogos.

## Fluxo do Capítulo 1

1. Selecionar Kael, Rian ou Lira no menu inicial.
2. Avançar pela cutscene do sonho de Kael.
3. Explorar a floresta e encontrar Rian e Lira.
4. Entrar na mansão para fugir da tempestade.
5. Conversar com Elara e investigar a mansão.
6. Encontrar o acesso ao porão.
7. Enfrentar Gorga em forma humana e em forma revelada.
8. Defender o Cristal Lunar e concluir o capítulo.

## Base técnica do template Phaser

Este projeto foi iniciado a partir do template oficial **Phaser + Vite + TypeScript**.

- Phaser 4.
- Vite 6.
- TypeScript 5.
- Servidor local padrão na porta `8080`.
- Build automático de assets armazenados em `public/`.
- Aplicação empacotada na pasta `dist/`.

O template inclui o arquivo `log.js`, usado pelos scripts `npm run dev` e `npm run build` para registrar métricas anônimas básicas no serviço do template. Para executar sem essa chamada, utilize `dev-nolog` e `build-nolog`.

## Publicação

Após executar `npm run build-nolog`, publique todo o conteúdo da pasta `dist/` em um servidor estático ou serviço de hospedagem de páginas.

Não abra o `index.html` diretamente pelo sistema de arquivos como única forma de teste; utilize o servidor Vite ou um servidor HTTP estático para preservar corretamente os caminhos dos assets.

## Créditos

Desenvolvido por **Santiago Rodrigues, Diego Ramos, Jezrael Garcia e Arthur Perantoni** para a disciplina de Desenvolvimento de Jogos Web.

Os assets visuais foram adaptados e editados para uso neste projeto acadêmico. As ferramentas utilizadas na geração e edição estão listadas na seção correspondente.
