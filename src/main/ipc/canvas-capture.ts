import { ipcMain } from 'electron'

/** The reference's floor snapshot: JPEG at quality 75, downscaled to at most this width. */
const SNAPSHOT_JPEG_QUALITY = 75

export type CanvasCaptureRegion = { x: number; y: number; width: number; height: number }

function validRegion(region: CanvasCaptureRegion): boolean {
  return (
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    region.width >= 1 &&
    region.height >= 1
  )
}

/**
 * The reference's floorSnapshot.capture: grabs a region of the calling window
 * (the board, in CSS pixels) as a JPEG data URL, scaled down to `maxWidth`. The
 * floor overview shows it on the sheet of the floor that was on screen, so a
 * ghost floor looks like the board it stands for. Null when nothing could be
 * captured; the sheet then falls back to the floor's name.
 */
export function registerCanvasCaptureHandler(): void {
  ipcMain.handle(
    'shell:captureCanvasRegion',
    async (event, region: CanvasCaptureRegion, maxWidth: number): Promise<string | null> => {
      if (!region || !validRegion(region)) {
        return null
      }
      try {
        const image = await event.sender.capturePage({
          x: Math.round(region.x),
          y: Math.round(region.y),
          width: Math.round(region.width),
          height: Math.round(region.height)
        })
        if (image.isEmpty()) {
          return null
        }
        const { width } = image.getSize()
        const scaled =
          Number.isFinite(maxWidth) && maxWidth >= 1 && width > maxWidth
            ? image.resize({ width: Math.round(maxWidth), quality: 'good' })
            : image
        const jpeg = scaled.toJPEG(SNAPSHOT_JPEG_QUALITY)
        return jpeg.length === 0 ? null : `data:image/jpeg;base64,${jpeg.toString('base64')}`
      } catch {
        return null
      }
    }
  )
}
