// The design is drawn at 1280×720; everything is laid out on that grid and zoomed to the screen.
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

export function stageZoom(width: number, height: number): number {
  return Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
}
