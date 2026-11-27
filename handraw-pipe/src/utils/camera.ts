// src/utils/camera.ts
//
// Escolha da câmera inicial, compartilhada por todos os modos.
// Padrão: a câmera EXTERNA (ex.: Logitech c922). A câmera interna do notebook
// (ex.: "ACER HD User Facing") só é usada se for a única ligada ou se o
// usuário escolhê-la manualmente no seletor de câmera de algum modo.

const CAMERA_KEY = 'mannavision_camera_id';
const MANUAL_KEY = 'mannavision_camera_manual';

// Nomes típicos de câmeras embutidas em notebooks/monitores
const INTERNAL_CAMERA_RE = /user facing|integrated|integrada|built[- ]?in|internal|interna|facetime|front/i;
// Câmeras virtuais (OBS, OBSBOT etc.): sem o programa delas aberto, podem travar ou mostrar só uma imagem fixa
const VIRTUAL_CAMERA_RE = /virtual|obs\b|obsbot|snap camera|manycam|droidcam|xsplit|nvidia broadcast|camo\b/i;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível: segue sem lembrar */
  }
}

async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
  } catch {
    return [];
  }
}

/** Registra uma câmera escolhida pelo usuário no seletor (vale para todos os modos). */
export function rememberManualCamera(deviceId: string) {
  writeStorage(CAMERA_KEY, deviceId);
  writeStorage(MANUAL_KEY, '1');
}

/** Câmera externa da lista: a primeira física que não parece embutida nem virtual; sem nomes, a segunda câmera. */
export function pickExternalCamera(cameras: MediaDeviceInfo[]): MediaDeviceInfo | undefined {
  const named = cameras.some((c) => c.label);
  if (named) {
    return cameras.find((c) => c.label && !INTERNAL_CAMERA_RE.test(c.label) && !VIRTUAL_CAMERA_RE.test(c.label));
  }
  return cameras.length > 1 ? cameras[1] : undefined;
}

/**
 * deviceId com que cada modo deve abrir a câmera.
 * 1) câmera escolhida manualmente, se ainda estiver ligada;
 * 2) senão, a câmera externa (física, não virtual);
 * 3) senão, outra câmera física (ex.: a interna);
 * 4) senão, undefined (câmera padrão do sistema).
 */
export async function pickStartupCamera(): Promise<string | undefined> {
  let cameras = await listCameras();

  // Sem permissão ainda, o navegador não informa nomes/ids: pede uma vez e lista de novo
  if (cameras.length === 0 || cameras.every((c) => !c.label)) {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((t) => t.stop());
      cameras = await listCameras();
    } catch {
      /* sem permissão: cada modo mostra o próprio erro ao abrir a câmera */
    }
  }

  const saved = readStorage(CAMERA_KEY);
  if (readStorage(MANUAL_KEY) === '1' && saved && cameras.some((c) => c.deviceId === saved)) {
    return saved;
  }

  // Sem câmera externa: prefere uma física (ex.: a interna) a uma virtual
  const physical = cameras.find((c) => c.label && !VIRTUAL_CAMERA_RE.test(c.label));
  return (pickExternalCamera(cameras) ?? physical)?.deviceId;
}
