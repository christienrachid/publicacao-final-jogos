# Golden Escape 🎮

Um jogo 2D plataforma emocionante desenvolvido com **Phaser 3** e JavaScript.

## 📖 Sobre o Jogo

**Golden Escape** é um jogo de plataforma no estilo clássico onde você controla um personagem que deve navegar por diversos níveis coletando moedas e evitando inimigos. O objetivo é alcançar o final de cada nível com a maior pontuação possível!

### Características:

- 🎮 **Níveis Desafiadores** - Aumente a dificuldade progressivamente
- 💰 **Sistema de Pontuação** - Colete moedas para aumentar sua pontuação
- 👾 **Inimigos Inteligentes** - Enfrente diferentes tipos de inimigos
- 🎵 **Efeitos Sonoros** - Música de fundo e efeitos de som imersivos
- 🏃 **Controles Fluidos** - Movimento e pulo responsivos
- 🎨 **Gráficos Pixel Art** - Visual retrô e nostálgico

## 🚀 Como Iniciar o Jogo

### Opção 1: Direto do Navegador (Mais Simples)
1. Localize o arquivo `index.html` na pasta do projeto
2. Clique duas vezes no arquivo ou arraste-o para o navegador
3. O jogo carregará automaticamente

### Opção 2: Com Live Server (Recomendado para Desenvolvimento)
1. Abra a pasta do projeto no VS Code
2. Instale a extensão "Live Server" (se ainda não tiver)
3. Clique com botão direito em `index.html`
4. Selecione **"Open with Live Server"**
5. O navegador abrirá automaticamente em `http://localhost:5500`

### Requisitos:
- ✅ Navegador web moderno (Chrome, Firefox, Edge, Safari)
- ✅ Conexão com internet (para primeira carga dos assets)
- ✅ Nenhuma instalação adicional necessária

## 🎮 Como Jogar

### Controles:
- **Setas ← →** - Mover para esquerda/direita
- **Seta ↑** ou **Espaço** - Pular
- **ENTER** - Iniciar o jogo / Próximo nível / Restart

### Objetivo:
1. Colete todas as moedas para aumentar sua pontuação
2. Evite inimigos e não caia do mapa
3. Passe para o próximo nível ao completar o atual
4. Vença o jogo completando todos os níveis!

## 🛠️ Estrutura do Projeto

```
Game2D-Phaser3/
├── index.html           # Arquivo principal do jogo
├── readme.md            # Este arquivo
├── img/                 # Imagens e sprites do jogo
│   ├── player.png       # Sprite do personagem
│   ├── coin.png         # Sprite das moedas
│   ├── enemy.png        # Sprite do inimigo tipo 1
│   ├── enemy2.png       # Sprite do inimigo tipo 2
│   ├── platform.png     # Sprite das plataformas
│   ├── ground.png       # Sprite do chão
│   ├── sky.png          # Sprite do céu
│   ├── clouds.png       # Sprite das nuvens
│   ├── start.jpeg       # Tela inicial
│   └── youWin.jpeg      # Tela de vitória
├── snd/                 # Arquivos de áudio
│   ├── music.ogg        # Música de fundo
│   ├── jump.ogg         # Som do pulo
│   └── getcoin.ogg      # Som de coleta de moedas
└── js/                  # Scripts JavaScript
    ├── main.js          # Configuração principal do jogo
    ├── phaser.min.js    # Biblioteca Phaser 3
    ├── Preload.js       # Cena de carregamento de assets
    ├── StartScene.js    # Tela inicial
    ├── Scene01.js       # Primeiro nível
    ├── Scene02.js       # Segundo nível
    └── EndScene.js      # Tela de vitória
```

## 🎬 Cenas do Jogo

### Preload
Carrega todos os assets (imagens, áudio, sprites) antes do jogo iniciar.

### StartScene
Tela inicial com instrução para começar o jogo.

### Scene01 (Primeiro Nível)
Primeiro desafio com:
- Plataformas estáticas
- Moedas para coletar
- Inimigos em movimento
- Sistema de pontuação

### Scene02 (Segundo Nível)
Segundo desafio mais difícil com:
- Layouts mais complexos
- Mais inimigos
- Desafios aumentados
- Incremento na pontuação

### EndScene
Tela de vitória exibida ao completar o jogo.

## 🚀 Como Executar

### Opção 1: Direto do Navegador
1. Abra o arquivo `index.html` em um navegador web moderno
2. O jogo carregará automaticamente

### Opção 2: Com Live Server (Recomendado)
1. Use a extensão Live Server do VS Code
2. Clique com botão direito em `index.html`
3. Selecione "Open with Live Server"

### Requisitos:
- Navegador web moderno (Chrome, Firefox, Edge, Safari)
- Não requer instalação adicional

## 🔧 Tecnologias Utilizadas

- **Phaser 3** - Framework de desenvolvimento de jogos 2D
- **JavaScript (ES6+)** - Linguagem de programação
- **HTML5** - Estrutura da página
- **Canvas** - Renderização dos gráficos

## 📊 Gameplay Mechanics

### Sistema de Pontuação:
- Cada moeda coletada = +10 pontos
- Bônus por completar níveis

### Sistema de Vidas:
- Evite os inimigos
- Uma colisão com inimigo resetará o nível

### Física:
- Gravidade realista
- Colisão com plataformas
- Bounce ao cair

## 🎨 Assets

Todo o conteúdo visual foi cuidadosamente selecionado para criar uma atmosfera retrô divertida:
- Sprites pixel art de alta qualidade
- Paleta de cores consistente
- Animações suaves

## 📝 Notas do Desenvolvedor

Este projeto foi desenvolvido como um exemplo didático de desenvolvimento de jogos com Phaser 3. O código é bem estruturado em cenas e pronto para ser estendido com novos recursos.

## 👨‍💻 Desenvolvedor

Desenvolvido com ❤️ usando Phaser 3

---

**Divirta-se jogando Golden Escape! 🎉**
