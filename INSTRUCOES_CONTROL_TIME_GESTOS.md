# Especificação de Implementação
## Novo modo: Controle do Tempo por Gestos

### Objetivo

Adicionar ao projeto existente um novo modo de interação chamado provisoriamente **CONTROL TIME** ou **CONTROLE DO TEMPO**.

O projeto já possui hand tracking funcional e um modo em que o gesto de pinça entre polegar e indicador é utilizado para desenhar na tela. Esse modo atual deve ser preservado.

O novo modo deve utilizar a mesma base de rastreamento das mãos para permitir que o usuário controle diretamente a progressão temporal de um vídeo ou animação com a distância entre o polegar e o indicador.

A experiência desejada é a de "segurar o tempo entre os dedos".

Exemplos de conteúdos:

- flor fechada → flor aberta
- cogumelo pequeno → cogumelo desenvolvido
- planta pequena → planta adulta
- foguete parado → lançamento
- explosão inicial → explosão completa
- formação de nuvens
- movimento de planetas
- processos científicos, naturais ou tecnológicos

O usuário deve conseguir avançar e retroceder livremente no tempo apenas abrindo e fechando os dedos.

---

# 1. Princípio de funcionamento

O conteúdo deve ser tratado como uma linha temporal normalizada de `0.0` a `1.0`.

Exemplo:

```text
0.0                                      1.0
│                                         │
▼                                         ▼
flor fechada                        flor totalmente aberta
```

A distância da pinça também deve ser normalizada:

```text
pinça fechada                        pinça aberta
│                                         │
▼                                         ▼
0.0                                      1.0
```

A relação desejada é:

```text
pinchProgress → timeProgress
```

Exemplos:

```text
pinchProgress = 0.00 → início do conteúdo
pinchProgress = 0.25 → 25% da timeline
pinchProgress = 0.50 → 50% da timeline
pinchProgress = 0.75 → 75% da timeline
pinchProgress = 1.00 → final do conteúdo
```

Matematicamente:

```text
progress =
    (pinchDistance - minPinchDistance)
    /
    (maxPinchDistance - minPinchDistance)
```

Depois:

```text
progress = clamp(progress, 0, 1)
```

Para vídeo:

```text
targetTime = progress * videoDuration
```

Para sequência de frames:

```text
frameIndex = round(progress * (totalFrames - 1))
```

---

# 2. Regra principal de interação

O gesto deve controlar a **posição temporal**, não a velocidade de reprodução.

Correto:

```text
distância entre os dedos = posição da timeline
```

Não implementar como:

```text
velocidade de abertura dos dedos = velocidade do vídeo
```

Isso significa que, se a mão permanecer na mesma posição, o conteúdo também deve permanecer aproximadamente no mesmo estado.

Exemplo:

```text
mão em 37% de abertura
→ conteúdo permanece em aproximadamente 37% da timeline
```

Se o usuário fizer:

```text
20% → 80%
```

o conteúdo deve avançar até aproximadamente 80%.

Se fizer:

```text
80% → 30%
```

o conteúdo deve voltar imediatamente para aproximadamente 30%.

O sistema deve aceitar mudanças de direção repetidas:

```text
0 → 100 → 0 → 50 → 20 → 80 → 10
```

sem travamento, flicker ou comportamento imprevisível.

---

# 3. Não utilizar apenas distância em pixels

A distância entre polegar e indicador não deve ser usada de forma absoluta em pixels.

Isso varia conforme:

- distância da mão até a câmera
- resolução da webcam
- tamanho da mão
- perspectiva
- posição da mão

Utilizar distância normalizada.

Caso o sistema atual use landmarks equivalentes ao MediaPipe:

```text
thumb tip = landmark 4
index tip = landmark 8
```

Calcular:

```text
pinchDistance = distance(thumbTip, indexTip)
```

Depois normalizar usando uma medida estável da mão, por exemplo:

```text
handScale = distance(wrist, middleFingerMCP)
```

ou outra referência anatômica adequada.

Então:

```text
normalizedPinch = pinchDistance / handScale
```

O objetivo é reduzir a influência da distância da mão até a câmera.

---

# 4. Arquitetura desejada

A arquitetura deve ser modular.

Fluxo conceitual:

```text
WEBCAM
   │
   ▼
HAND TRACKING
   │
   ▼
landmarks da mão
   │
   ├── thumb tip
   └── index tip
   │
   ▼
GESTURE INTERPRETER
   │
   ▼
normalizedPinch
   │
   ▼
pinchProgress 0..1
   │
   ▼
TIME CONTROLLER
   │
   ▼
timeProgress 0..1
   │
   ▼
EXPERIENCE
   │
   ▼
vídeo / frames / animação / 3D
```

Separar responsabilidades em módulos sempre que possível:

```text
HandTracker
GestureInterpreter
TimeController
MediaController
ExperienceManager
Renderer
UI
```

Não concentrar toda a lógica no loop principal da câmera.

---

# 5. Gesture Interpreter

O sistema de tracking não deve saber o que é vídeo, flor, cogumelo ou foguete.

Ele deve produzir dados genéricos.

Exemplo conceitual:

```javascript
{
  handDetected: true,
  thumb: { x, y, z },
  index: { x, y, z },

  pinchDistance: 0.0,
  normalizedPinch: 0.0,
  pinchProgress: 0.0
}
```

O modo atual de desenho interpreta esses dados de uma forma.

O novo modo CONTROL TIME interpreta:

```text
pinchProgress → timeProgress
```

Isso permitirá reutilizar o mesmo motor gestual posteriormente para:

- zoom
- rotação
- volume
- escala
- profundidade
- simulações
- animações 3D
- parâmetros físicos
- experiências educacionais

---

# 6. Suavização do gesto

Landmarks de câmera apresentam pequenas oscilações.

Sem filtro, pode ocorrer algo assim:

```text
frame 170
frame 174
frame 168
frame 173
frame 169
```

mesmo com a mão praticamente parada.

Adicionar smoothing.

Primeira opção:

```text
smoothed =
previous + alpha * (current - previous)
```

Valor inicial de teste:

```text
alpha = 0.15
```

Esse valor é apenas um ponto inicial.

Preferencialmente, estruturar o filtro de forma modular para permitir futura utilização de **One Euro Filter**, que é adequado para interfaces gestuais porque combina:

- estabilidade quando a mão está parada
- resposta rápida quando a mão se move

---

# 7. Dead zone

Adicionar uma pequena dead zone para impedir que variações mínimas alterem constantemente a timeline.

Exemplo:

```text
if abs(newProgress - previousProgress) < threshold:
    manter previousProgress
```

Valores iniciais para teste:

```text
0.003
0.005
0.01
```

O valor final deve ser ajustado empiricamente.

---

# 8. targetProgress e displayProgress

Separar:

```text
targetProgress
```

de:

```text
displayProgress
```

O hand tracking atualiza o target.

O renderizador interpola visualmente:

```javascript
displayProgress +=
    (targetProgress - displayProgress) * smoothing;
```

Isso permite manter o tracking em uma frequência e o rendering em outra.

Exemplo:

```text
hand tracking = 30 FPS
renderização = 60 FPS
```

Não exigir uma relação de 1:1 entre tracking e rendering.

---

# 9. Estado temporal central

Criar uma variável central:

```text
timeProgress
```

Sempre limitada ao intervalo:

```text
0.0 <= timeProgress <= 1.0
```

Todo conteúdo deve responder a essa variável.

Não acoplar o gesto diretamente ao elemento de vídeo.

Arquitetura:

```text
GESTO
  ↓
PROGRESS 0..1
  ↓
EXPERIÊNCIA
```

Isso permitirá futuramente usar o mesmo mecanismo com:

- vídeos
- sequências de imagens
- modelos 3D
- timelines GSAP
- animações Three.js
- animações exportadas do Blender
- partículas
- simulações científicas
- experiências educacionais interativas

---

# 10. Controle do vídeo

Na primeira prova de conceito, usar um vídeo convencional.

Implementação conceitual:

```javascript
video.currentTime =
    displayProgress * video.duration;
```

O vídeo não deve reproduzir automaticamente enquanto estiver sendo controlado pelo gesto.

O usuário controla a posição temporal diretamente.

Deve funcionar igualmente bem:

```text
0 → 1
```

e:

```text
1 → 0
```

O usuário poderá mudar a direção várias vezes por segundo.

---

# 11. Importante: não converter tudo em milhares de PNGs sem necessidade

Não converter automaticamente todos os vídeos em sequências enormes de imagens.

Exemplo:

```text
30 segundos × 60 FPS = 1.800 frames
10 segundos × 60 FPS = 600 frames
```

Mesmo assim, milhares de arquivos separados aumentam:

- armazenamento
- uso de memória
- tempo de carregamento
- complexidade
- largura de banda

Implementar inicialmente vídeo convencional.

Depois medir desempenho.

---

# 12. Estratégias de mídia

## Estratégia A: vídeo convencional

Primeira implementação:

```javascript
video.currentTime = progress * video.duration;
```

Vantagem:

- simples
- rápida de implementar
- fácil de testar

Risco:

- alguns MP4 podem responder mal a scrubbing rápido por causa da estrutura de keyframes

---

## Estratégia B: vídeo otimizado para scrubbing

Para presets oficiais, preparar arquivos adequados para navegação bidirecional.

Considerar:

- resolução adequada
- frame rate adequado
- keyframes frequentes
- GOP curto
- compressão moderada
- codec compatível com a stack atual

Essa deve ser a opção preferida para produção se o vídeo convencional engasgar.

---

## Estratégia C: sequência de frames

Somente para experiências curtas que precisem de resposta praticamente instantânea.

Não utilizar PNG indiscriminadamente.

Avaliar formatos comprimidos e preload inteligente.

---

# 13. Pré-carregamento

Ao selecionar uma experiência:

```text
selecionar experiência
↓
mostrar loading
↓
carregar metadados
↓
pré-carregar mídia
↓
confirmar readiness
↓
iniciar experiência
```

Não iniciar o controle gestual antes de a mídia estar pronta.

Para experiências pequenas, considerar preload completo.

---

# 14. Estado inicial

Quando uma experiência começar:

```text
timeProgress = 0
```

Exemplos:

```text
flor fechada
cogumelo pequeno
foguete parado
planta pequena
```

---

# 15. Ausência da mão

Se nenhuma mão for detectada:

**não alterar a timeline automaticamente.**

Manter o último estado:

```text
lastProgress
```

Não retornar para zero.

Não iniciar reprodução automática.

Quando a mão reaparecer, o sistema deverá reassumir o controle.

---

# 16. Evitar saltos ao recuperar tracking

Existe um possível problema.

Exemplo:

```text
conteúdo está em 80%
usuário retira a mão
usuário volta com pinça em 10%
```

Se o controle for reassumido imediatamente:

```text
80% → 10%
```

pode ocorrer um salto brusco.

Na primeira versão, o controle absoluto pode ser mantido.

Porém, estruturar o sistema para permitir futuramente uma estratégia de **gesture clutch**.

Possibilidades futuras:

- exigir alguns frames de tracking estável antes de reassumir
- sincronizar o ponto inicial de gesto com o estado atual
- criar um modo relativo de manipulação da timeline

Não implementar complexidade desnecessária na primeira prova de conceito.

---

# 17. Calibração

Não assumir valores universais rígidos para pinça fechada e aberta.

Criar configuração:

```text
MIN_PINCH
MAX_PINCH
```

Na primeira versão, esses valores podem ser predefinidos com base em distância normalizada.

Preparar arquitetura para calibração futura:

```text
Feche a pinça
↓
capturar MIN

Abra os dedos confortavelmente
↓
capturar MAX
```

---

# 18. Novo seletor de modos

O projeto já possui um modo funcional de desenho.

Adicionar uma seleção de modos:

```text
CHOOSE MODE

✏ DRAW

⏳ CONTROL TIME
```

Regras:

### DRAW MODE

Manter exatamente o comportamento existente.

### CONTROL TIME

A pinça passa a controlar a timeline.

Não desenhar nesse modo.

Nunca deixar os dois interpretadores de gesto atuando simultaneamente.

---

# 19. Máquina de estados

Criar estados claros.

Sugestão:

```text
HOME
MODE_SELECTION
DRAW_MODE
TIME_GALLERY
TIME_LOADING
TIME_EXPERIENCE
ERROR
```

Evitar lógica espalhada como:

```javascript
if(draw && !video && hand && ...)
```

---

# 20. Galeria de experiências

Ao selecionar CONTROL TIME, apresentar uma galeria.

Exemplo:

```text
┌──────────────────────────────────────┐

          CONTROL TIME

     Escolha uma experiência

   🌺            🍄            🚀
 Flower       Mushroom        Rocket

   🌱            💥            🌍
 Plant        Explosion      Planet

└──────────────────────────────────────┘
```

Cada experiência deve possuir:

```text
id
name
thumbnail
type
source
```

Opcionalmente:

```text
description
minProgress
maxProgress
preload
calibration
smoothing
```

---

# 21. Manifesto central de experiências

Não espalhar caminhos e configurações pelo código.

Criar uma estrutura central.

Exemplo:

```javascript
const experiences = [
  {
    id: "flower",
    name: "Flower",
    thumbnail: "...",
    type: "video",
    source: "...",
    minProgress: 0,
    maxProgress: 1
  },
  {
    id: "mushroom",
    name: "Mushroom",
    thumbnail: "...",
    type: "video",
    source: "..."
  },
  {
    id: "rocket",
    name: "Rocket Launch",
    thumbnail: "...",
    type: "video",
    source: "..."
  }
];
```

A IA deve adaptar isso à stack e arquitetura reais do projeto.

---

# 22. Organização dos assets

Sugestão conceitual:

```text
/assets/time-experiences/

flower/
    preview.jpg
    video.mp4

mushroom/
    preview.jpg
    video.mp4

rocket/
    preview.jpg
    video.mp4

plant/
    preview.jpg
    video.mp4
```

Porém, antes de criar novos diretórios, analisar a estrutura existente e seguir o padrão atual do projeto.

---

# 23. Primeiros presets

Preparar inicialmente três experiências:

```text
FLOWER
flor abrindo

MUSHROOM
cogumelo crescendo

ROCKET
foguete sendo lançado
```

Depois adicionar:

```text
PLANT
EXPLOSION
PLANET
CLOUDS
DRONE
ENGINE
CELL
WATER CYCLE
```

---

# 24. Debug mode

Criar:

```text
DEBUG_MODE = true / false
```

Quando ativo, mostrar:

```text
thumb landmark
index landmark
linha entre polegar e indicador
pinch distance
normalized pinch
pinchProgress
targetProgress
displayProgress
timeProgress
timestamp atual
frame estimado
FPS
tracking status
```

Exemplo visual:

```text
Pinch: 0.63
Time: 63%
Frame: 378 / 600
FPS: 58
Tracking: ACTIVE
```

Na versão final, permitir ocultar tudo.

---

# 25. Interface final

A experiência final deve ser visualmente limpa.

Exemplo:

```text
                    conteúdo

                      🌺




       ○───────────────○

              63%
```

A barra inferior é opcional.

Pode ser utilizada inicialmente como feedback visual.

---

# 26. Critérios obrigatórios de teste

Para cada experiência, testar:

```text
pinça fechada = primeiro estado
pinça aberta = último estado
abrir lentamente = avanço lento
fechar lentamente = retrocesso lento
abrir rapidamente = avanço rápido
fechar rapidamente = retorno rápido
parar a mão = estado visual estabiliza
retirar a mão = último estado permanece
recuperar tracking = controle retorna
```

O teste principal deve verificar:

```text
0 → 100 → 0 → 50 → 20 → 80 → 10
```

A implementação só deve ser considerada satisfatória quando o conteúdo acompanhar essa sequência de maneira previsível e fluida.

---

# 27. Prioridades de qualidade

Priorizar:

1. baixa latência
2. reversão imediata
3. movimento suave
4. estabilidade quando a mão está parada
5. ausência de jumps
6. ausência de autoplay
7. correspondência clara entre gesto e estado visual
8. preservação do modo de desenho já existente

A experiência deve transmitir a sensação de manipulação direta do tempo.

---

# 28. Ordem obrigatória de implementação

Trabalhar incrementalmente.

```text
1. Analisar todo o projeto existente.

2. Identificar:
   - stack
   - biblioteca de hand tracking
   - renderer
   - arquitetura
   - gerenciamento de estado
   - modo atual de desenho

3. Localizar exatamente onde a pinça atual é calculada.

4. Não modificar inicialmente o comportamento do DRAW MODE.

5. Refatorar somente o necessário para expor pinchProgress.

6. Criar CONTROL TIME isoladamente.

7. Implementar uma única experiência com um único vídeo.

8. Validar scrubbing bidirecional.

9. Adicionar smoothing.

10. Adicionar dead zone.

11. Adicionar debug mode.

12. Medir latência e desempenho.

13. Criar sistema de presets.

14. Criar galeria.

15. Adicionar múltiplos vídeos.

16. Otimizar mídia para scrubbing se necessário.

17. Somente depois melhorar interface e efeitos visuais.
```

---

# 29. Não trocar a stack sem necessidade

Se o projeto já utiliza tecnologias como:

```text
MediaPipe
OpenCV
cvzone
JavaScript
TypeScript
React
Python
Three.js
WebGL
```

manter a tecnologia atual sempre que ela puder atender ao novo modo.

Não reescrever partes funcionais sem justificativa técnica.

Antes de trocar biblioteca ou arquitetura, explicar:

- problema atual
- limitação encontrada
- alternativa proposta
- impacto da mudança
- risco de regressão

---

# 30. Primeira prova de conceito

A primeira versão deve ser simples.

Utilizar:

```text
1 vídeo
1 mão
polegar + indicador
pinchProgress
timeProgress
scrubbing bidirecional
```

Não priorizar inicialmente:

- partículas
- 3D
- efeitos especiais
- menus sofisticados
- transições complexas
- IA generativa
- múltiplas mãos
- gestos extras

Primeiro provar:

```text
PINÇA ↔ TEMPO
```

Depois expandir.

---

# 31. Evolução futura

A arquitetura deve permitir transformar o recurso em um motor genérico de experiências temporais gestuais.

Possíveis aplicações:

- crescimento de plantas
- formação de cogumelos
- lançamento de foguetes
- explosões
- formação de planetas
- ciclo da água
- movimento de nuvens
- funcionamento de motores
- montagem e desmontagem de drones
- germinação
- evolução estelar
- divisão celular
- funcionamento do coração
- propagação de ondas
- partículas
- circuitos
- redes neurais
- simulações quânticas
- fenômenos físicos
- experimentos educacionais

Princípio central:

```text
GESTO
   ↓
PROGRESS 0..1
   ↓
EXPERIÊNCIA
```

---

# 32. Evolução opcional: modo "agarrar o tempo"

Não implementar como requisito da primeira versão.

Preparar arquitetura para uma futura interação relativa.

Ideia:

```text
usuário faz pinça
↓
"agarra" a timeline
↓
move a mão ou altera abertura
↓
tempo avança ou retrocede relativamente
↓
solta a pinça
↓
timeline permanece
```

Isso permitiria controlar conteúdos longos sem depender de um intervalo fixo de abertura dos dedos.

O modo absoluto continua sendo a versão principal inicial.

---

# 33. Prompt operacional para a IA de programação

Copiar as instruções abaixo e utilizá-las como guia de execução dentro do projeto real.

```text
Analise integralmente este projeto antes de alterar qualquer arquivo.

O projeto já possui hand tracking e um modo funcional no qual o gesto de pinça entre polegar e indicador é utilizado para desenhar.

Quero preservar integralmente esse modo e adicionar um segundo modo chamado CONTROL TIME.

No novo modo, a distância entre o polegar e o indicador deverá controlar diretamente a posição temporal de uma experiência visual.

Pinça fechada deve representar progress aproximadamente 0.

Pinça completamente aberta deve representar progress aproximadamente 1.

Valores intermediários devem representar estados intermediários.

O gesto não deve controlar a velocidade de reprodução. Ele deve controlar diretamente a posição da timeline.

Se progress = 0.37, o conteúdo deve permanecer aproximadamente em 37% de seu desenvolvimento.

Se a mão voltar de 0.80 para 0.30, a experiência deve imediatamente retroceder visualmente de 80% para 30%.

O usuário deverá poder avançar e retroceder quantas vezes quiser.

Utilize os landmarks do hand tracking já existente.

Se houver landmarks equivalentes aos padrões do MediaPipe, a ponta do polegar corresponde normalmente ao landmark 4 e a ponta do indicador ao landmark 8.

Não utilize apenas a distância em pixels.

Normalize a distância da pinça em relação ao tamanho aparente da mão para reduzir a influência da distância até a câmera.

Crie uma variável genérica pinchProgress limitada ao intervalo 0..1.

Aplique smoothing para reduzir jitter.

Preferencialmente crie o filtro de forma modular.

Pode começar com exponential smoothing e posteriormente permitir One Euro Filter.

Crie também uma pequena dead zone configurável.

Depois crie timeProgress.

A arquitetura deve ser desacoplada:

Hand Tracking
↓
Gesture Interpreter
↓
pinchProgress
↓
Time Controller
↓
Experience

O sistema de tracking não deverá conhecer vídeos ou experiências específicas.

Crie um seletor de modos.

DRAW MODE deve manter exatamente o comportamento atual.

CONTROL TIME deve utilizar a pinça para controlar a timeline e não deverá desenhar.

Nunca deixe DRAW MODE e CONTROL TIME interpretando simultaneamente o mesmo gesto.

Dentro de CONTROL TIME crie futuramente uma galeria de experiências.

Cada experiência deverá ter pelo menos:

id
name
thumbnail
type
source

Inicialmente implemente apenas uma experiência de vídeo para validar a arquitetura.

Não converta o vídeo em milhares de PNGs sem necessidade.

Comece utilizando o vídeo como timeline e mapeando progress para sua posição temporal.

Avalie a arquitetura atual e escolha a melhor implementação de scrubbing disponível para a stack.

Se o uso direto de currentTime produzir latência ou dificuldade para reprodução bidirecional rápida, documente o problema antes de trocar a estratégia.

Nesse caso, considere:

- vídeo otimizado para scrubbing
- keyframes mais frequentes
- GOP curto
- WebCodecs, se fizer sentido na stack
- sequência de frames otimizada apenas se realmente necessária

A prioridade máxima é baixa latência.

A experiência precisa produzir a sensação de que o usuário está segurando o tempo entre os dedos.

Crie targetProgress e displayProgress para permitir interpolação suave.

Quando nenhuma mão for detectada, mantenha o último estado da timeline.

Não retorne automaticamente ao início.

Não inicie autoplay.

Adicione DEBUG_MODE exibindo temporariamente:

pinch distance
normalized pinch
pinchProgress
targetProgress
displayProgress
timeProgress
timestamp ou frame
FPS
tracking status

Implemente primeiro uma prova de conceito funcional.

Não redesenhe a aplicação antes de provar que o mecanismo PINCH ↔ TIMELINE funciona.

Depois da prova de conceito, crie sistema de presets e galeria para experiências como:

Flower
Mushroom
Rocket
Plant

Antes de escrever código, apresente obrigatoriamente:

1. arquitetura atual identificada
2. stack encontrada
3. arquivos envolvidos
4. local onde a pinça atual é calculada
5. estratégia proposta
6. arquivos que pretende criar
7. arquivos que pretende modificar
8. riscos de regressão
9. possíveis riscos de desempenho
10. estratégia inicial de vídeo e scrubbing

Somente depois comece a implementação.

Durante a implementação:

- preserve todas as funcionalidades atuais
- evite alterações desnecessárias
- não troque bibliotecas funcionais sem justificativa
- trabalhe incrementalmente
- teste cada etapa
- mantenha o código modular
- documente decisões técnicas relevantes
```

---

# 34. Definição de pronto

O novo modo estará funcional quando:

- o modo atual de desenho continuar funcionando normalmente
- existir um modo separado CONTROL TIME
- uma experiência de vídeo puder ser selecionada
- a mão for detectada
- a distância normalizada entre polegar e indicador produzir `pinchProgress`
- `pinchProgress` controlar diretamente `timeProgress`
- o conteúdo puder avançar e retroceder
- a imagem permanecer estável quando a mão parar
- o último estado for mantido quando a mão desaparecer
- não houver autoplay involuntário
- a interação apresentar baixa latência
- o usuário conseguir manipular o tempo de forma intuitiva

Teste final esperado:

```text
0 → 100 → 0 → 50 → 20 → 80 → 10
```

Se essa sequência puder ser reproduzida de forma fluida apenas com a pinça, a prova de conceito estará aprovada.
