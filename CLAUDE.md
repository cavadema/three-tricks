# Three Tricks — guia do projeto

Jogo de skate 3D no navegador, em **Three.js**. Formato "Best Trick": **uma manobra por tentativa, 3 tentativas por pico, vale a melhor nota**. Está no ar em **https://three-tricks.vercel.app** (deploy automático a cada push na branch `main`).

O usuário fala **português do Brasil**. Toda a interface é em português; só os nomes de manobras seguem o jargão do skate (Kickflip, Boardslide, Fakie, etc.).

## Como rodar e testar

Site estático, **sem build**. Sirva a pasta e abra no navegador:

```bash
python3 -m http.server 8000   # http://localhost:8000
```

Abrir `index.html` por `file://` **não funciona** (o navegador bloqueia o carregamento dos `.glb` e do `.hdr`). A API do ranking (`api/scores.js`) só roda na Vercel; sem ela o jogo funciona e o botão de ranking fica escondido.

Prefira testar **no navegador, você mesmo olhando** — é mais barato em tokens do que pedir para o assistente renderizar/screenshotar. Para checar a lógica sem abrir o 3D, dá para extrair o `<script>` e rodar as funções puras no Node.

## Arquitetura

```
index.html             o jogo inteiro: HTML + CSS + toda a lógica num <script>
vendor/three.bundle.js Three.js r149 + GLTFLoader, RGBELoader, EffectComposer,
                       RenderPass, UnrealBloomPass, ShaderPass (empacotado com esbuild)
assets/                skater-michelle.glb, skater-beto.glb, sky.hdr, concrete*.jpg, wood*.jpg
api/scores.js          função serverless da Vercel: ranking (Upstash Redis via REST)
vercel.json            cleanUrls + cache de /assets e /vendor
```

Tudo do jogo está em `index.html`, dividido por comentários `/* ---------- Seção ---------- */`:
Física arcade, Manobras, Fases, Three.js, Pós-processamento, Materiais, Cenário, Skatista,
Mini ramp, Ranking online, Pose e câmera, Loop, Entrada.

Para depurar: abra com `?debug` na URL e use `window.__g` (expõe `sk`, `state`, `openPre`, `startAttempt`, etc.).

## Regras de design (não quebrar)

- **Física arcade e determinística.** O skatista é movido **por código**, nunca por rigidbody. Nada de motor de física movendo o personagem.
- **Câmera lenta** (0,7×) no ar/grind/stall; **replay** automático após cada tentativa.
- **Animação do corpo por IK**, transferida para os ossos do personagem (os modelos usam o esqueleto padrão da Mixamo). Na remada, o pé de trás alcança o chão por IK de 2 juntas.
- Repetir a mesma manobra no mesmo pico vale ×0,8. Manobra/base de **fakie** vale ×1,15.

## Picos (array `LEVELS` no index.html)

| id | Nome | Mult. | Tipo | Resumo |
|---|---|---|---|---|
| rampa | Rampa | ×1,1 | aérea | Flips, giros 180/360, grab |
| caixote | Caixote | ×1,0 | grind | Grinds + flip in/out |
| reto | Corrimão reto | ×1,3 | grind | Grinds + flip in/out + 180 out |
| descida | Corrimão com descida | ×1,6 | grind | idem, gravidade acelera o grind |

**Mini ramp não é um pico do circuito.** É o **modo livre** (`MINI` no index.html, `session: true`): fica num card próprio no menu, fora da lista de picos e da "Soma das melhores notas". Formato **sessão de 60 s**, não "1 manobra / 3 tentativas":
- O relógio começa no primeiro "Dropar". Depois de cada manobra a sessão continua; se o tempo acabar no meio de uma, ela ainda conta.
- **Combo:** cada manobra limpa seguida soma +0,25 (×1 → ×3, `comboMult`). Cair zera o combo, reseta o skatista na borda e exige dropar de novo (o tempo segue correndo).
- Repetição vale ×0,8 por uso da mesma manobra, mínimo ×0,5 (`repeatMult`). Sem replay no modo livre.
- Nota da sessão = soma de (nota da manobra × combo). Melhor nota guardada em `best.sessao`.

**Nota = Base × Execução × Multiplicador da fase × Repetição × Fakie.** Os números completos
(gravidade 14, pop 5,2, VMAX 8,5, tabelas FLIP/GR_BOX/GR_RAIL/LIPS, instabilidade por fase, etc.)
estão no topo do `<script>`. É a fonte de verdade — mude lá.

## Compartilhar replay (vídeo)

Na tela de resultado dos picos há o botão **Compartilhar replay** (seção `Compartilhar replay` do index.html). Toca o replay e grava num canvas 2D (frame do 3D + faixa com manobra, nota e `three-tricks.vercel.app`) com `MediaRecorder`, **sem servidor**. Dois toques de propósito: o 1º grava; o 2º ("Enviar vídeo" / "Salvar vídeo") chama `navigator.share({files})` ou baixa o arquivo, porque o share exige um gesto do usuário e a gravação dura segundos. Formato: MP4 se o navegador gravar (Safari/Chrome recentes), senão WebM. Durante a gravação o toque não pula o replay. Não existe no modo livre da mini ramp (sem replay lá). O menu nativo de compartilhar do iOS/Android só dá para validar em aparelho real.

## Controles

- **Celular:** botões na tela; deslizar o dedo no ar (← → ↓ flips, ↑ gira 180); na mini ramp, segurar ◀ ▶ para bombear.
- **Teclado:** ↑/W rema (no ar gira 180); Espaço pula e segura o grab; ← → ↓ flips; 1–4 escolhem o grind/manobra de borda; ↓ ou B troca a base; ← → na mini ramp bombeiam; Esc/P pausa.
- Na interface usa-se **"Pular"**; o termo "pop" aparece só nas avaliações ("Pop perfeito") e numa dica.

## Ranking online (`api/scores.js`)

- **Upstash Redis** (plano Free) conectado ao projeto na Vercel. Lê `KV_REST_API_URL`/`KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_*`). Sem essas variáveis, retorna 503 e o jogo esconde o botão de ranking.
- Guarda a melhor nota e a manobra por jogador, **por pico e geral** (o geral soma só os 4 picos do circuito; a mini ramp tem ranking próprio, id `sessao`, teto 60000), **semanal** (zera segunda, horário de Brasília) e **de todos os tempos**.
- Apelido escolhido na 1ª vez + id anônimo, guardados no `localStorage`.
- Proteções: rejeita nota acima do máximo de cada pico (`PICOS`), limita 12 envios por IP / 10 min. **Não é à prova de trapaça** (jogo roda no cliente); suficiente para lançamento.

## Estado atual (17/10/2026)

Pronto: 4 picos no circuito + mini ramp como modo livre de 60 s, botão de compartilhar replay em vídeo nos picos (ainda não publicado), 2 skatistas (Michelle, Beto), fakie, giros 180/360, flip in/out nos grinds, mini ramp com bombada pelas setas, replay, menu de pausa e navegação, ranking online conectado e verificado.

## Ideias de próximos passos

- Novos picos: escada/gap (pular por cima), vert (aéreos grandes, 540/900), bowl/piscina (exige o skatista andar em curva, fora da linha reta atual).
- Mais personagens/animações da **Mixamo** (baixar com a conta própria — o assistente não acessa o site; o usuário baixa e envia o `.glb`/`.fbx`).
- Feedback de ranking mais rico, compartilhar manobra, sons.

## Assets e licenças

Michelle e Beto vieram dos exemplos do Three.js (Mixamo / Ready Player Me); céu e madeira idem; concreto gerado por código. **Para uso comercial**, troque os personagens por versões baixadas na conta própria da Mixamo/Ready Player Me e confira a licença de cada asset. Veja o `README.md`.
