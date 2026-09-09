import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, type Result } from "@zxing/library";
import type { BarcodeFormat as AppBarcodeFormat } from "../types";

// Thin wrapper around ZXing so the rest of the app never touches the
// underlying scanning library directly — swapping scanning engines later
// only means rewriting this file.

const SUPPORTED_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

const FORMAT_MAP: Partial<Record<BarcodeFormat, AppBarcodeFormat>> = {
  [BarcodeFormat.EAN_13]: "EAN_13",
  [BarcodeFormat.EAN_8]: "EAN_8",
  [BarcodeFormat.UPC_A]: "UPC_A",
  [BarcodeFormat.UPC_E]: "UPC_E",
  [BarcodeFormat.CODE_128]: "CODE_128",
  [BarcodeFormat.CODE_39]: "CODE_39",
  [BarcodeFormat.ITF]: "ITF",
  [BarcodeFormat.QR_CODE]: "QR_CODE",
};

export interface DecodedBarcode {
  text: string;
  format: AppBarcodeFormat;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export class BarcodeService {
  private reader: BrowserMultiFormatReader;
  private controls: { stop: () => void } | null = null;

  constructor() {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    this.reader = new BrowserMultiFormatReader(hints);
  }

  static mapResult(result: Result): DecodedBarcode {
    const format = FORMAT_MAP[result.getBarcodeFormat()] ?? "UNKNOWN";
    return { text: result.getText(), format };
  }

  async listCameras(): Promise<CameraDevice[]> {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    return devices.map((d) => ({ deviceId: d.deviceId, label: d.label || "Camera" }));
  }

  async start(
    videoElement: HTMLVideoElement,
    deviceId: string | undefined,
    onDecode: (decoded: DecodedBarcode) => void,
    onError?: (error: unknown) => void
  ): Promise<void> {
    this.stop();
    this.controls = await this.reader.decodeFromVideoDevice(
      deviceId,
      videoElement,
      (result, error) => {
        if (result) {
          onDecode(BarcodeService.mapResult(result));
        } else if (error && onError) {
          // NotFoundException fires continuously while no barcode is in
          // frame — that is expected noise, not a real error.
          const name = (error as { name?: string }).name;
          if (name !== "NotFoundException") onError(error);
        }
      }
    );
  }

  stop(): void {
    this.controls?.stop();
    this.controls = null;
  }
}

export const barcodeService = new BarcodeService();
