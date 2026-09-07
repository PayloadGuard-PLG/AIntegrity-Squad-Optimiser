import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { decodeScreenshotPng } from './screenshotPixels';
import type { PreparedScreenshot } from './playerScanPipeline';

/** Normalise orientation once; no resizing or lossy JPEG recompression. */
export async function preparePlayerScreenshot(uri: string): Promise<PreparedScreenshot> {
  const context = ImageManipulator.manipulate(uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let cacheUri: string | undefined;
  const dispose = async () => {
    if (cacheUri && cacheUri !== uri) {
      await FileSystem.deleteAsync(cacheUri, { idempotent: true });
    }
  };
  try {
    rendered = await context.renderAsync();
    const png = await rendered.saveAsync({ format: SaveFormat.PNG, base64: true });
    cacheUri = png.uri;
    if (!png.base64) throw new Error('Screenshot pixels were not returned.');
    const image = decodeScreenshotPng(png.base64);
    if (image.width !== png.width || image.height !== png.height) {
      throw new Error('Screenshot pixel dimensions do not match OCR input.');
    }
    return { uri: png.uri, image, dispose };
  } catch (error) {
    await dispose().catch(() => undefined);
    throw error;
  } finally {
    rendered?.release();
    context.release();
  }
}
