# Como publicar "Delivered by Noon" no Editor online do PlayCanvas

Este guia explica como levar o jogo **Delivered by Noon** (ambientado em **Juiz de Fora — MG**) para um projeto no **PlayCanvas Editor** (`playcanvas.com`) usando engine **2.x**. O build oferece os bundles atuais (`dist-editor/flight-sim.mjs` e `dist-editor/flight-sim.js`) e módulos separados por sistema em `dist-editor/modules/`.
O Hatch inicial (`public/models/carro.glb`), o Coupé Tunado (`public/models/carro-tunado.glb`), o helicóptero leve (`public/models/helicoptero.glb`), o A-29 (`public/models/a29.glb`), a fachada da **UniAcademia** (`public/models/uniacademia.glb`, entrega final), os marcadores 3D de entrega, a iluminação da manhã (`06:00 → 12:00`), o minimapa de Juiz de Fora e o áudio dinâmico funcionam automaticamente no **Launch**.

## 1. Gerar os arquivos do Editor (localmente)

No diretório do projeto, gere os bundles ESM, clássico e os módulos separados:

```bash
npm run build:editor
```

Isso cria:
- `dist-editor/flight-sim.mjs` (script ESM `flightSim`, com CSS embutido, atributos via JSDoc `@attribute` e `playcanvas` externo);
- `dist-editor/flight-sim.js` (script clássico `simuladorVoo` via `pc.createScript` + `attributes.add`, compatível com projetos clássicos do Editor).
- `dist-editor/modules/` (ESM sem minificação nem hashes, preservando a estrutura de `src/`, com `playcanvas` externo).

O comando também executa `scripts/verificar-editor-modulos.mjs`: valida imports e reexports relativos com extensão `.mjs`, arquivos existentes e sintaxe; importa a entrada e cada módulo no Node com o PlayCanvas real e confere a classe `FlightSim`. JSON vira módulo com `export default` (por exemplo, `flight/jf-mundo.mjs` e `flight/fdm/aircraft-a29.mjs`); o CSS inline vira `flight.mjs`. Esse teste não inicia uma cena nem substitui a conferência de Launch no Editor.

## 2. Criar e configurar o projeto no Editor online

1. Acesse [playcanvas.com](https://playcanvas.com) e crie um **projeto vazio** (*Blank Project*).
2. Abra **Settings** (ícone de engrenagem no canto inferior esquerdo).
3. Na seção **Engine**, selecione a versão **2.x** mais recente disponível.
4. Em **Settings → Input → Keyboard**, confirme que o teclado está habilitado (se estiver desativado, o script exibe um aviso na tela e não inicia os controles).

## 3. Publicação automática (via REST API)

Você pode enviar os scripts e todos os modelos GLB (`mundo-*.glb`, veículos, personagem e `uniacademia.glb`) automaticamente para o projeto no PlayCanvas Editor:

1. Gere um **API Access Token** na sua conta em [playcanvas.com/account](https://playcanvas.com/account).
2. Crie (ou edite) o arquivo `.env` na raiz do projeto (ignorado pelo Git) com:
   ```env
   PLAYCANVAS_API_TOKEN=seu_token_aqui
   PLAYCANVAS_PROJECT_ID=1606932
   # Opcional: define um branch específico (padrão: branch principal do projeto)
   # PLAYCANVAS_BRANCH_ID=
   ```
3. Teste a conexão sem alterar nada no projeto remoto (somente leitura):
   ```bash
   npm run publicar:editor:teste
   ```
4. Compile e publique (cria ou atualiza os scripts e modelos com `preload` ligado):
   ```bash
   npm run publicar:editor
   ```

O publicador mantém os dois bundles legados e os modelos. Para os módulos, cria a pasta **Scripts do jogo** e suas subpastas, enviando cada `.mjs` como asset `script`, com `preload: true` na criação. Pastas e scripts são reutilizados por **nome + pasta**, inclusive quando existe outro `flight-sim.mjs` na raiz. Duplicatas na mesma pasta interrompem a publicação para evitar sobrescrever o asset errado. O dry-run lista essas pastas e todos os arquivos, usando apenas consultas GET; rode `build:editor` antes dele.

A atualização REST mantém o preload existente (o endpoint PUT aceita arquivo e branch, mas rejeita o campo `preload`). Se algum módulo separado existente estiver com Preload desligado, o publicador pede para ligá-lo no Editor antes de prosseguir. Ele não altera a cena nem escolhe automaticamente qual versão do script usar.

### Scripts separados e troca da cena

Depois da publicação pelo responsável, os Assets terão esta estrutura (nomes sem hashes):

```text
Assets/
├─ flight-sim.js              # clássico atual: simuladorVoo
├─ flight-sim.mjs             # bundle ESM legado: flightSim
└─ Scripts do jogo/
   ├─ editor/flight-sim.mjs   # entrada ESM separada: FlightSim / flightSim
   ├─ flight.mjs             # CSS inline
   ├─ _virtual/_rolldown/runtime.mjs
   └─ flight/
      ├─ game.mjs
      ├─ car.mjs
      ├─ mission.mjs
      ├─ hud.mjs
      ├─ jf-mundo.mjs        # dados JSON
      ├─ fdm/heli.mjs
      ├─ fdm/aircraft-a29.mjs
      ├─ ui/menus.mjs
      └─ ...                # demais sistemas importados pelo jogo
```

Os módulos utilitários são dependências; somente `editor/flight-sim.mjs` fornece o script de componente `FlightSim`. Não adicione `car.mjs`, `hud.mjs` etc. como componentes separados. A cena continua usando **simuladorVoo** até a troca manual:

1. Feche a aba Launch. Anote os oito atributos atuais da entidade **Jogo → Script** (ou crie um checkpoint).
2. Nos Assets, selecione o **`flight-sim.mjs` da raiz** e **desligue Preload**. Ele e a entrada separada registram o mesmo nome `flightSim`; carregar ambos torna a escolha dependente da ordem. Deixe os módulos de **Scripts do jogo** com Preload ligado.
3. Abra **Scripts do jogo/editor/flight-sim.mjs** e use **Parse** se necessário. Confirme o script `FlightSim` / `flightSim` e seus atributos.
4. Na entidade **Jogo → componente Script**, remova `simuladorVoo` e adicione **FlightSim (`flightSim`) da pasta Scripts do jogo/editor**. Copie os valores anotados. Mantenha somente uma versão ativa no componente.
5. Abra um novo **Launch** e confira menu, início da partida, controles, modelos, minimapa e som. Alterar assets por upload não faz esta troca de componente automaticamente.

**Voltar ao clássico:** feche Launch, remova `flightSim` de **Jogo → Script**, adicione novamente `simuladorVoo` do `flight-sim.js` da raiz, restaure os atributos e abra Launch. Os módulos podem permanecer nos Assets; eles não iniciam o jogo sem a instância do componente. Para voltar ao bundle ESM antigo, desligue Preload da entrada **Scripts do jogo/editor/flight-sim.mjs**, ligue o do `flight-sim.mjs` da raiz e use o `flightSim` antigo. Antes de publicar atualizações dos módulos separados novamente, restaure Preload da entrada separada e desligue o bundle ESM antigo.

Referências: [imports relativos em scripts ESM](https://developer.playcanvas.com/user-manual/scripting/esm-scripts/), [criação de assets pela API](https://developer.playcanvas.com/user-manual/api/asset-create/) e [criação de pastas no sincronizador oficial](https://github.com/playcanvas/playcanvas-sync/blob/main/src/watch-actions/action-created.js).

### Alternativa manual (upload pelo navegador)

1. No painel **Assets** (parte inferior), clique em **+** → **Upload** (ou arraste os arquivos diretamente para a pasta raiz de Assets).
2. Envie `dist-editor/flight-sim.js` (script clássico `simuladorVoo`) ou `dist-editor/flight-sim.mjs` (script ESM `flightSim`) e aguarde o processamento.
3. Envie os modelos 3D (`public/models/*.glb`) para a pasta **Assets**.
   > **Nota:** Se algum GLB não for enviado, o simulador usa automaticamente o modelo procedural de fallback.

## 4. Montar a cena visível no Viewport do Editor (Modo cena)

Para que o mundo, os veículos, a UniAcademia, a câmera e o sol apareçam **montados na Hierarchy e visíveis no Viewport** do PlayCanvas Editor:

1. **Publique os assets** no projeto do Editor (`npm run publicar:editor`).
2. **Abra a cena do projeto** no navegador: `https://playcanvas.com/editor/project/1606932` (aguarde carregar).
3. Pressione **F12** para abrir o DevTools e clique na aba **Console**.
4. Copie todo o conteúdo de `scripts/montar-cena-editor.js`, **cole no Console** e pressione **Enter**.
   - O snippet usa apenas a Editor API oficial (`editor`), é 100% local e pode ser executado novamente sem duplicar entidades.
   - Ele cria/atualiza `Jogo` (com o script `simuladorVoo`), `Mundo` (filhos de `mundo-*.glb`), `A29`, `Heli`, `Carro_Inicial`, `Carro_1..5`, `Carro_Tunado`, `Personagem`, `UniAcademia`, `CameraJogo` e `Sol`, desativa entidades padrão e habilita **Settings → Input → Keyboard**.
5. Confira na **Hierarchy** as entidades criadas (selecione `A29` ou `UniAcademia` e aperte **F** para focar no Viewport).
6. Clique em **Launch**: o simulador detecta automaticamente a cena montada sem duplicar entidades.

### Como reverter a cena montada

- **Logo após colar o snippet:** pressione **Ctrl + Z** no Editor ou restaure um checkpoint em **Version Control**.
- **Manualmente:** apague as entidades criadas na **Hierarchy** e reative `Camera` e `Light` pelo **Inspector**.

## 5. Atributos editáveis do script no Editor (Inspector)

Os dois formatos de script — **ESM** (`flightSim` em `src/editor/flight-sim.ts`, com anotações JSDoc `@attribute`, `@title`, `@range`, `@step`, `@precision` e `@enum`) e **clássico** (`simuladorVoo` em `src/editor/flight-sim-classic.ts`, com `SimuladorVoo.attributes.add`) — expõem exatamente os mesmos **8 atributos** no painel do componente **Script** do Editor, com atualização **ao vivo** na aba de Launch (via evento `attr`):

| Atributo | Título no Inspector | Tipo / Limites | Padrão | Efeito no jogo |
|---|---|---|---|---|
| `dayDurationMinutes` | **Duração do dia (min)** | Número (`2` a `60`, passo `1`) | `30` | Define quantos minutos reais dura o turno da manhã de `06:00` a `12:00`. Útil para acelerar o relógio em demonstrações. |
| `difficulty` | **Dificuldade** | Lista (`Fácil`, `Normal`, `Difícil`) | `Normal` | Ajusta o raio de aceitação das entregas e o tempo disponível (`Fácil`: +35% raio e +25% tempo; `Difícil`: −28% raio e −25% tempo). |
| `mouseSensitivity` | **Sensibilidade do mouse (A-29)** | Número (`0.05` a `0.40`, passo `0.01`) | `0.15` | Sensibilidade do mouse para a mira do A-29 e rotação de câmera. |
| `musicVolume` | **Volume da música** | Número (`0` a `1`, passo `0.05`) | `0.45` | Volume inicial da trilha sonora procedural (`0` = mudo, `1` = máximo). |
| `sfxVolume` | **Volume dos efeitos** | Número (`0` a `1`, passo `0.05`) | `0.80` | Volume inicial dos motores, pneus, alertas e efeitos de entrega. |
| `showMinimap` | **Mostrar minimapa** | Booleano (caixa de seleção) | `true` | Liga ou desliga o minimapa de Juiz de Fora no canto superior direito. |
| `showFps` | **Mostrar FPS** | Booleano (caixa de seleção) | `false` | Mostra um contador leve de quadros por segundo (`XX FPS · pior YY ms`) no canto inferior direito. |
| `presentationMode` | **Modo apresentação** | Booleano (caixa de seleção) | `false` | Ativa o selo **MODO APRESENTAÇÃO** no HUD, libera os atalhos **F1–F4** (estágios), **F5** (entrega final na UniAcademia) e **F6** (+1h no relógio) e desliga o registro de recorde. |

### Onde ficam os atributos no Editor (mapa visual da tela)

Ao abrir o projeto no PlayCanvas Editor, os controles aparecem no lado direito da tela seguindo este caminho:

```text
┌─ HIERARCHY (esquerda) ─┐   ┌─ VIEWPORT (centro) ─┐   ┌─ INSPECTOR (direita) ──────────────────────────┐
│ ▼ Root                 │   │                     │   │ Entity: Jogo  [✓ Enabled]                      │
│   ├─ Jogo  ◄── clique  │   │   Cena 3D de        │   │ ────────────────────────────────────────────── │
│   ├─ Mundo             │   │   Juiz de Fora      │   │ ▼ SCRIPT  [✓]                                  │
│   ├─ A29               │   │   (terreno, cidade, │   │   ▼ simuladorVoo (ou flightSim)  [↻ Parse]     │
│   ├─ Heli              │   │   UniAcademia...)   │   │     Duração do dia (min)       [ 30        ]   │
│   ├─ Carro_Inicial     │   │                     │   │     Dificuldade                [ Normal  ▾ ]   │
│   ├─ UniAcademia       │   │                     │   │     Sensibilidade do mouse     [ 0.15      ]   │
│   ├─ CameraJogo        │   │                     │   │     Volume da música           [ 0.45      ]   │
│   └─ Sol               │   │                     │   │     Volume dos efeitos         [ 0.80      ]   │
└────────────────────────┘   └─────────────────────┘   │     Mostrar minimapa           [✓]             │
                                                       │     Mostrar FPS                [ ]             │
                                                       │     Modo apresentação          [ ]             │
                                                       └────────────────────────────────────────────────┘
```

1. Na coluna **Hierarchy** (à esquerda), clique na entidade **`Jogo`**.
2. Na coluna **Inspector** (à direita), role até o componente **Script** → bloco **`simuladorVoo`** (ou **`flightSim`**).
3. Se você acabou de enviar uma versão nova do script, clique no ícone **Parse** (seta circular) no cabeçalho do script para o Editor ler os atributos atualizados.
4. Altere qualquer campo (por exemplo, marque **Mostrar FPS**, **Modo apresentação** ou reduza **Duração do dia (min)** para `10` durante a demonstração em sala): se a aba de **Launch** já estiver aberta, a mudança reflete na hora sem precisar reiniciar!
   - Com **Modo apresentação** marcado no Editor (ou iniciado pelo botão **Modo apresentação** no menu inicial), o jogo exibe o selo discreto no canto inferior esquerdo e libera **F1–F4** (estágios), **F5** (entrega final) e **F6** (+1h no relógio). Fora desse modo, `F1–F6` ficam totalmente inativos.

## 6. Executar (Launch)

1. Clique no botão **Launch** (canto superior direito do Editor) para abrir a aba de execução.
2. Clique na tela do jogo para dar foco ao teclado e comece a entregar.

## 7. Controles

| Entrada | Ação |
|---|---|
| **E** | Entrar / sair de um veículo próximo (Hatch, Coupé Tunado, helicóptero ou A-29) |
| **W / A / S / D** | Andar (a pé), dirigir (carros) ou pilotar (helicóptero e A-29) |
| **Shift** | **Nitro** no Coupé Tunado · acelerador / coletivo (+) em aeronaves |
| **Ctrl** | Reduzir acelerador / coletivo (−) em aeronaves |
| **Espaço** | Freio de mão (carros), pular (a pé) ou **soltar carga aérea** (A-29) |
| **Mouse** | Gira a câmera (a pé, carros e helicóptero) ou move a mira de voo (**somente A-29**) |
| **Clique esquerdo** | Trava o ponteiro para girar a câmera / mirar no A-29 (**Esc** solta e pausa) |
| **Esc** ou **P** | Pausa / abre ou fecha o menu de pausa (congela o relógio) |
| **M** | Alterna entre modo **Mouse** e **Teclado** (**somente A-29**) |
| **Q / E** | Leme / pedais em aeronaves |
| **F** | Liga / desliga a fumaça branca na cauda do A-29 |
| **C** ou **V** | Alternar câmeras disponíveis para o veículo atual |
| **R** | Reiniciar veículo atual |

## 8. Como atualizar o script depois

Sempre que alterar o código-fonte do simulador:

1. Rode `npm run build:editor` localmente para atualizar `dist-editor/flight-sim.mjs`, `dist-editor/flight-sim.js` e `dist-editor/modules/`, incluindo a verificação ESM.
2. Publique com `npm run publicar:editor` (ou faça upload manual sobre os assets existentes no painel **Assets**).
3. No Inspector de `Jogo`, clique em **Parse** no componente Script se tiver mudado atributos e recarregue a aba de **Launch**.
