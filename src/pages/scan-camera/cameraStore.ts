const STORAGE_KEY = "scanner_camera_v1";

export interface SavedCamera {
  deviceId: string;
  label: string;
}

export interface DetectedBarcode {
  rawValue: string;
}

export interface Detector {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<DetectedBarcode[]>;
}

interface DetectorCtor {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e",
  "code_128", "code_39", "code_93", "itf",
  "qr_code", "data_matrix",
];

export const loadSavedCamera = (): SavedCamera | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedCamera;
    return parsed?.deviceId ? parsed : null;
  } catch {
    return null;
  }
};

export const saveCamera = (cam: SavedCamera) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cam));
};

export const clearSavedCamera = () => {
  localStorage.removeItem(STORAGE_KEY);
};

/** Сохранённая камера исчезла (другой id после очистки браузера и т.п.) */
export const isMissingCameraError = (err: unknown): boolean => {
  const name = (err as { name?: string })?.name || "";
  return name === "OverconstrainedError" || name === "NotFoundError";
};

export const createDetector = async (): Promise<Detector | null> => {
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  let supported: string[] = [];
  try {
    supported = (await Ctor.getSupportedFormats?.()) || [];
  } catch { /* ignore */ }
  const formats = FORMATS.filter((f) => supported.length === 0 || supported.includes(f));
  return new Ctor({ formats });
};

export const applyAutoFocus = async (track: MediaStreamTrack) => {
  try {
    const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
    const advanced: MediaTrackConstraintSet[] = [];
    for (const key of ["focusMode", "exposureMode", "whiteBalanceMode"]) {
      const modes = (caps[key] as string[] | undefined) || [];
      if (modes.includes("continuous")) {
        advanced.push({ [key]: "continuous" } as MediaTrackConstraintSet);
      }
    }
    if (advanced.length > 0) await track.applyConstraints({ advanced });
  } catch { /* ignore */ }
};

const FRONT = /front|user|фронт|передн/i;
const BACK = /back|rear|environment|задн|тыл/i;

/** Все задние камеры. Нужен уже выданный доступ к камере — иначе у устройств нет названий. */
export const listBackCameras = async (): Promise<MediaDeviceInfo[]> => {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === "videoinput" && d.deviceId,
  );
  const back = devices.filter((d) => BACK.test(d.label));
  if (back.length > 0) return back;
  return devices.filter((d) => !FRONT.test(d.label));
};

export const openCamera = (deviceId: string) =>
  navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
