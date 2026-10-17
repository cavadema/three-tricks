# Three Tricks

Jogo de skate no navegador feito com [Three.js](https://threejs.org). Uma manobra por tentativa, três tentativas por pico, vale a melhor nota, como no formato *Best Trick* de campeonato.

## Picos

| Pico | Multiplicador | O que tem |
|---|---|---|
| Rampa | ×1,1 | Flips, giros de 180/360 e grab no ar |
| Caixote | ×1,0 | Grinds e slides, com flip na entrada e na saída |
| Corrimão reto | ×1,3 | Grinds, flip in, flip out e 180 out |
| Corrimão com descida | ×1,6 | O mesmo, com a gravidade acelerando o grind |
| Mini ramp | ×1,2 | Bombada nas paredes, manobras de borda e aéreos |

## Controles

**Celular:** botões na tela, deslizar o dedo no ar para os flips (← → ↓) e para cima para girar 180.

**Teclado:**

| Tecla | Ação |
|---|---|
| ↑ ou W | Remar (no ar: girar 180) |
| Espaço | Pular; segurar no ar faz o grab |
| ← → ↓ | Flips no ar |
| 1 a 4 | Escolher o grind ou a manobra de borda |
| ↓ ou B no chão | Trocar a base (fakie) |
| ◀ ▶ na mini ramp | Segurar para bombear |
| Esc ou P | Pausar |

## Rodar localmente

É um site estático, sem etapa de build. Sirva a pasta com qualquer servidor HTTP:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Abrir o `index.html` direto do disco não funciona, porque o navegador bloqueia o carregamento dos modelos 3D por `file://`.

## Estrutura

```
index.html            o jogo inteiro (HTML, CSS e lógica)
vendor/three.bundle.js Three.js r149 com GLTFLoader, RGBELoader e pós-processamento
assets/               personagens, céu HDR e texturas
vercel.json           cache dos arquivos estáticos na Vercel
```

## Créditos e licenças dos assets

- **Three.js** (MIT): https://github.com/mrdoob/three.js
- **Michelle** (`assets/skater-michelle.glb`): personagem da [Mixamo](https://www.mixamo.com), cópia usada nos exemplos do Three.js.
- **Beto** (`assets/skater-beto.glb`): avatar [Ready Player Me](https://readyplayer.me) dos exemplos do Three.js, com roupa e malha adaptadas.
- **Céu** (`assets/sky.hdr`): HDRI "Venice Sunset" da [Poly Haven](https://polyhaven.com) (CC0), via exemplos do Three.js.
- **Madeira** (`assets/wood*.jpg`): texturas dos exemplos do Three.js.
- **Concreto** (`assets/concrete*.jpg`): gerado por código para este projeto.

Antes de um lançamento comercial, substitua os personagens por versões baixadas com a sua própria conta da Mixamo / Ready Player Me e confirme a licença de cada asset.
