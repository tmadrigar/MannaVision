<h1 align="center">MannaVision ✨</h1>

<p align="center">
  <strong>Interação gestual em tempo real: pinte no ar, controle o tempo e manipule fluidos apenas com as mãos — e transforme ideias em arte com IA.</strong>
</p>

<p align="center">
  <img alt="Versão" src="https://img.shields.io/badge/version-3.0.0-blue?style=for-the-badge">
  <img alt="Licença" src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge">
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-React%20|%20TypeScript%20|%20Vite-D554C8?style=for-the-badge">
  <img alt="Backend" src="https://img.shields.io/badge/IA-Python%20|%20Flask%20|%20Hugging%20Face-blueviolet?style=for-the-badge">
</p>

---

## 📖 Sobre o Projeto

MannaVision usa a webcam e o **MediaPipe Hands** (Google) para rastrear suas mãos em tempo real e transformá-las em instrumentos de interação. O projeto começou como uma tela de pintura gestual e hoje reúne **três experiências** num só hub:

| Modo | O que faz |
| :--- | :--- |
| 🎨 **MannaVision Paint** | Pinte no ar juntando polegar e indicador. Traços suaves em Neon, Fita, Caligrafia, Fagulhas e mais; caleidoscópio de até 12 eixos; tinta que evapora; desfazer/refazer; geração de arte com IA. |
| ⏱️ **Control Time** | Segure o tempo entre os dedos: abra e feche a pinça para avançar e retroceder na linha do tempo de fenômenos (flor desabrochando, sistema solar, zoom infinito, foguete, som & guitarra) ou de um vídeo seu. |
| 🌊 **Manipular o Fluido** | Mergulhe as mãos em um fluido simulado na GPU (Navier-Stokes em WebGL). Cada dedo empurra, agita e pinta a tinta; até 10 toques simultâneos com duas mãos. |

![Demonstração do MannaVision em Ação](assets/mannavision_demo.gif)

---

## 🚀 Funcionalidades

### 🎨 MannaVision Paint
- **Desenho por pinça**: junte polegar e indicador para pintar, afaste para soltar. Duas mãos pintam ao mesmo tempo.
- **Rastreamento robusto**: pinça normalizada pelo tamanho da mão (funciona perto ou longe da câmera), com histerese anti-tremor e sensibilidade ajustável.
- **8 pincéis**: Sólido, **Neon**, **Fita** (espessura pela velocidade), **Caligrafia** (pena chanfrada), Psicodélico, **Fagulhas** (partículas vivas), Spray e Tracejado — todos com traço suavizado por curvas.
- **Simetria**: espelho ou caleidoscópio de 4, 6, 8 ou 12 eixos.
- **Tinta evanescente**: o traço desaparece aos poucos, como pintura de luz.
- **Fundos**: webcam, lousa branca ou fundo escuro (neon fica espetacular).
- **Desfazer / Refazer** (botões ou `Ctrl+Z` / `Ctrl+Y`), borracha, paleta de cores, espessura.
- **IA generativa** (opcional): descreva uma imagem e receba uma obra gerada pela Hugging Face.
- **Exportação**: salve só o desenho (PNG transparente) ou uma "recordação" com webcam + desenho + logo.

### ⏱️ Control Time
- Progresso temporal controlado pela abertura da pinça (0% fechada → 100% aberta), bidirecional e sem latência.
- Experiências incluídas: Flor Fantasia, Lançamento Espacial, Sistema Solar, Som & Guitarra (o volume acompanha a pinça) e Zoom Infinito.
- Carregue **seu próprio vídeo** (.mp4/.webm) e navegue nele com a mão.
- HUD com métricas de gesto e calibrador de suavização/deadzone.

### 🌊 Manipular o Fluido
- Simulação de fluidos em WebGL baseada no [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) de Pavel Dobryakov (MIT).
- **Modos de toque**: Cinco Dedos, Indicador, Pinça (agarra o fluido) e Palma (varre como uma onda).
- **Cores**: arco-íris, cor do tema ou uma cor por mão.
- Ajustes de força, raio, vorticidade, dissipação, bloom, raios de luz e qualidade (512p a 1024p+).
- Atalhos: `Espaço` explosão de respingos, `C` limpar, `P` pausar.

### Geral
- Hub inicial com os 3 modos e 4 temas de interface (Roxo, Azul, Verde, Rosa).
- Seleção de câmera, resolução (640p / 800p / 1280p) e espelhamento.
- Tudo roda **localmente no navegador** — nenhuma imagem da sua câmera sai do computador (a IA generativa recebe apenas o texto do prompt).

---

## 🛠️ Tecnologias

| Categoria | Tecnologia | Uso |
| :--- | :--- | :--- |
| **Frontend** | React 18 + TypeScript | Interface e lógica dos modos |
| | Vite | Dev server e build |
| | Tailwind CSS | Estilização |
| **Visão computacional** | MediaPipe Hands | Rastreamento de 21 pontos por mão, em tempo real, no navegador |
| **Gráficos** | Canvas 2D | Motor de pincéis (`brushEngine.ts`), esqueleto da mão, efeitos |
| | WebGL | Simulação de fluidos (`fluidSimulation.ts`) |
| **IA generativa (opcional)** | Python + Flask | Servidor local que chama a API da Hugging Face |
| | Hugging Face Inference API | Stable Diffusion XL |

---

## ⚙️ Instalação e Execução

### Pré-requisitos
- **[Node.js](https://nodejs.org/)** versão 18 ou superior (LTS recomendada) — obrigatório.
- **Webcam** e um navegador moderno (Chrome ou Edge recomendados; precisa de WebGL para o modo Fluido).
- **[Python](https://www.python.org/downloads/)** 3.8+ — **apenas** se quiser a geração de imagens com IA.
- **[Git](https://git-scm.com/)** para clonar o repositório.

### 1. Clone o repositório
```bash
git clone https://github.com/tmadrigar/MannaVision.git
cd MannaVision
```

### 2. Execute

#### 🪟 Windows — dois cliques
Dê um duplo clique em **`iniciar.bat`** (ou rode no terminal). Ele:
1. verifica se o Node.js está instalado;
2. instala as dependências na primeira execução (`npm install`, inclui a cópia dos arquivos do MediaPipe);
3. inicia o servidor de IA se existir um `handraw-pipe/.env` (veja abaixo);
4. sobe o MannaVision e **abre o navegador automaticamente** em `http://localhost:5173`.

Para encerrar, feche a janela ou pressione `Ctrl+C`.

> Dica: crie um atalho de `iniciar.bat` na área de trabalho para ter o MannaVision a um clique.

#### 🍎 macOS / 🐧 Linux
```bash
chmod +x iniciar.sh   # só na primeira vez
./iniciar.sh
```

#### Manualmente (qualquer sistema)
```bash
cd handraw-pipe
npm install        # também copia o MediaPipe para public/mediapipe/hands
npm run dev:open   # abre http://localhost:5173 no navegador
```

### 3. (Opcional) Ativar a geração de imagens com IA
O botão **"Gerar Imagem com IA"** do Paint usa um pequeno servidor Python que chama a Hugging Face.

1. Crie uma conta gratuita em [huggingface.co](https://huggingface.co) e gere um **Access Token** em *Settings → Access Tokens* (permissão `write`).
2. Copie `handraw-pipe/.env.example` para `handraw-pipe/.env` e coloque seu token:
   ```env
   HUGGING_FACE_TOKEN=hf_seu_token_aqui
   ```
3. Execute `iniciar.bat` / `iniciar.sh` normalmente — ele detecta o `.env`, cria o ambiente virtual Python, instala `requirements.txt` e sobe o servidor em `http://127.0.0.1:5000` numa janela separada.

Manualmente:
```bash
cd handraw-pipe
python -m venv .venv
.venv\Scripts\activate          # Windows   |   source .venv/bin/activate  (macOS/Linux)
pip install -r requirements.txt
python app.py
```

> O arquivo `.env` está no `.gitignore` — seu token nunca vai para o repositório.

---

## 🧭 Como usar

1. No hub, escolha um dos três modos.
2. Permita o acesso à câmera quando o navegador pedir.
3. Posicione a mão aberta a ~40–80 cm da câmera, com boa iluminação. O esqueleto da mão aparece em ciano (segunda mão em magenta).
4. **Paint**: junte polegar e indicador para pintar. **Control Time**: abra/feche a pinça para avançar/voltar. **Fluido**: mova os dedos sobre a tela.
5. Use o botão **Hub Principal** para trocar de modo.

---

## 📂 Estrutura do projeto

```
MannaVision/
├── iniciar.bat / iniciar.sh        # lançadores (instalam e executam tudo)
├── handraw-pipe/                   # aplicação web
│   ├── src/
│   │   ├── App.tsx                 # roteamento entre hub e modos
│   │   ├── components/
│   │   │   ├── HomeHub.tsx         # tela inicial
│   │   │   ├── HandDrawingApp.tsx  # MannaVision Paint
│   │   │   ├── ControlTimeApp.tsx  # Control Time
│   │   │   └── FluidApp.tsx        # Manipular o Fluido
│   │   └── utils/
│   │       ├── brushEngine.ts      # pincéis, simetria, partículas
│   │       ├── fluidSimulation.ts  # simulação de fluidos em WebGL
│   │       ├── gestureInterpreter.ts # normalização/suavização da pinça
│   │       └── timeExperiences.ts  # catálogo de experiências temporais
│   ├── public/
│   │   ├── experiences/            # sequências de frames do Control Time
│   │   ├── audio/                  # trilhas
│   │   ├── fluid/                  # textura de dithering do bloom
│   │   └── mediapipe/              # gerado no npm install (não versionado)
│   ├── scripts/setup-mediapipe.mjs # copia o MediaPipe de node_modules
│   ├── app.py                      # servidor de IA (Flask)
│   ├── requirements.txt / .env.example
│   └── vite.config.ts              # inclui o workaround de bundling do MediaPipe
├── scripts/extract_frames.py       # gera sequências de frames a partir de vídeos
└── assets/                         # imagens do README
```

### Scripts úteis (`handraw-pipe/`)
| Comando | Descrição |
| :--- | :--- |
| `npm run dev` / `npm run dev:open` | Servidor de desenvolvimento (com/sem abrir o navegador) |
| `npm run build` | Checagem de tipos + build de produção em `dist/` |
| `npm run preview` | Serve o build de produção |
| `npm run typecheck` | Só a checagem de tipos |
| `npm run setup:mediapipe` | Recopia os arquivos do MediaPipe para `public/` |
| `npm start` | Frontend + servidor de IA no mesmo terminal (`concurrently`) |

---

## 🩺 Problemas comuns

| Sintoma | Causa provável / solução |
| :--- | :--- |
| "Não foi possível acessar a câmera" | Outra aplicação (ou outra aba) está usando a webcam. Feche-a e clique em **Tentar Novamente**. |
| A mão não é detectada | Melhore a iluminação, aproxime a mão (~50 cm) e mostre a palma para a câmera. Tente a resolução 800p. |
| Pinça dispara sozinha / não dispara | No Paint, ajuste **Sensibilidade da pinça**; no Control Time, use o **Calibrador**. |
| Modo Fluido diz "WebGL não é suportado" | Ative a aceleração de hardware do navegador ou atualize o driver de vídeo. |
| Botão de IA retorna erro | Verifique o `.env`, se o servidor Python está rodando (janela "Servidor de IA") e se o token tem permissão `write`. O modelo pode levar ~20 s para "acordar" na primeira chamada. |
| `npm install` falhou | Confirme Node ≥ 18 (`node -v`) e a conexão com a internet; apague `node_modules` e tente de novo. |

---

## 🙏 Créditos
- [MediaPipe Hands](https://developers.google.com/mediapipe) — Google.
- [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) — Pavel Dobryakov (MIT), base do modo Fluido.
- [Hugging Face](https://huggingface.co) — API de inferência para a geração de imagens.

## ✍️ Autor

**Tiago Madrigar** — [tmadrigar](https://github.com/tmadrigar)

Sinta-se à vontade para entrar em contato ou contribuir com o projeto!
