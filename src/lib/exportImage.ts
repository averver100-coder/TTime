import { toPng } from 'html-to-image';

export interface ExportImageOptions {
  filename: string;
  backgroundColor?: string;
}

/**
 * Exports an HTML element to a high-resolution PNG image and triggers download.
 */
export async function exportElementAsPng(
  element: HTMLElement,
  options: ExportImageOptions
): Promise<void> {
  const { filename, backgroundColor = '#ffffff' } = options;

  // Generate high quality PNG
  const dataUrl = await toPng(element, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor,
    cacheBust: true,
    style: {
      borderRadius: '0px'
    }
  });

  // Trigger download
  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
