// src/utils/gestureInterpreter.ts

export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

export interface HandLandmarks {
  [index: number]: Point3D;
  length: number;
}

export interface GestureData {
  handDetected: boolean;
  rawPinchDistance: number;
  handScale: number;
  normalizedPinch: number;
  pinchProgress: number; // 0.0 (fechado) a 1.0 (aberto)
  thumbTip: Point3D | null;
  indexTip: Point3D | null;
  wrist: Point3D | null;
}

export interface GestureInterpreterConfig {
  minPinch: number; // Pinch normalizado mínimo (dedos juntos)
  maxPinch: number; // Pinch normalizado máximo (dedos afastados)
  deadzone: number; // Limiar de variação mínima para evitar jitter
  smoothingAlpha: number; // Fator de suavização exponencial (0.01 a 1.0)
}

export const DEFAULT_GESTURE_CONFIG: GestureInterpreterConfig = {
  minPinch: 0.18,
  maxPinch: 0.95,
  deadzone: 0.005,
  smoothingAlpha: 0.22,
};

export class GestureInterpreter {
  private config: GestureInterpreterConfig;
  private previousSmoothedProgress: number = 0;
  /** Último progresso válido (mantido para depuração/HUD) */
  public lastValidProgress: number = 0;

  constructor(config?: Partial<GestureInterpreterConfig>) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
  }

  public updateConfig(newConfig: Partial<GestureInterpreterConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): GestureInterpreterConfig {
    return { ...this.config };
  }

  /**
   * Distância euclidiana 2D/3D entre dois pontos
   */
  private distance(p1: Point3D, p2: Point3D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Limita um valor entre min e max
   */
  private clamp(val: number, min: number = 0, max: number = 1): number {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Processa os landmarks de uma mão e produz dados gestuais normalizados
   */
  public process(landmarks?: HandLandmarks | Point3D[]): GestureData {
    if (!landmarks || landmarks.length < 21 || !landmarks[0] || !landmarks[4] || !landmarks[8] || !landmarks[9]) {
      this.previousSmoothedProgress = 0;
      this.lastValidProgress = 0;
      return {
        handDetected: false,
        rawPinchDistance: 0,
        handScale: 1,
        normalizedPinch: 0,
        pinchProgress: 0, // Sempre que não detectar mão, retorna ao início (frame 0)
        thumbTip: null,
        indexTip: null,
        wrist: null,
      };
    }

    // MediaPipe Hand Landmarks:
    // 0: Wrist (pulso)
    // 4: Thumb tip (ponta do polegar)
    // 8: Index finger tip (ponta do indicador)
    // 9: Middle finger MCP (junta da base do dedo médio)
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleMCP = landmarks[9];

    // 1. Distância absoluta da pinça
    const rawPinchDistance = this.distance(thumbTip, indexTip);

    // 2. Escala anatômica da mão (distância entre pulso e junta média do dedo)
    // Isso normaliza o tamanho da mão independente da distância até a câmera
    const handScale = Math.max(0.01, this.distance(wrist, middleMCP));

    // 3. Pinça normalizada
    const normalizedPinch = rawPinchDistance / handScale;

    // 4. Mapeamento linear para 0.0 (pinça fechada) a 1.0 (pinça aberta)
    const rawProgress = this.clamp(
      (normalizedPinch - this.config.minPinch) / (this.config.maxPinch - this.config.minPinch),
      0,
      1
    );

    // 5. Aplicação de Deadzone
    let progressAfterDeadzone = this.previousSmoothedProgress;
    if (Math.abs(rawProgress - this.previousSmoothedProgress) >= this.config.deadzone) {
      progressAfterDeadzone = rawProgress;
    }

    // 6. Suavização (Exponential Smoothing)
    const smoothedProgress =
      this.previousSmoothedProgress +
      this.config.smoothingAlpha * (progressAfterDeadzone - this.previousSmoothedProgress);

    const finalProgress = this.clamp(smoothedProgress, 0, 1);
    this.previousSmoothedProgress = finalProgress;
    this.lastValidProgress = finalProgress;

    return {
      handDetected: true,
      rawPinchDistance,
      handScale,
      normalizedPinch,
      pinchProgress: finalProgress,
      thumbTip,
      indexTip,
      wrist,
    };
  }

  /**
   * Reseta o estado interno de suavização
   */
  public reset(initialProgress: number = 0) {
    this.previousSmoothedProgress = initialProgress;
    this.lastValidProgress = initialProgress;
  }
}
