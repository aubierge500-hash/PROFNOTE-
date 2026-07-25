declare module '@paddlejs-models/ocr' {
  export function init(): Promise<void>
  export function recognize(
    img: HTMLImageElement | HTMLCanvasElement,
    option?: unknown
  ): Promise<{ text: string | string[]; points?: unknown }>
  }
