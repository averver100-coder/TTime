import { toPng } from 'html-to-image';

export interface ExportImageOptions {
  filename: string;
  backgroundColor?: string;
}

/**
 * Exports an HTML element to a high-resolution PNG image and triggers download.
 * Uses skipFonts: true and fontEmbedCSS: '' to avoid SecurityError when reading remote CSS stylesheets.
 */
export async function exportElementAsPng(
  element: HTMLElement,
  options: ExportImageOptions
): Promise<void> {
  const { filename, backgroundColor = '#ffffff' } = options;

  let dataUrl: string;

  try {
    // Generate high quality PNG with skipFonts to prevent cross-origin cssRules SecurityError
    dataUrl = await toPng(element, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor,
      cacheBust: true,
      skipFonts: true,
      fontEmbedCSS: '',
      style: {
        borderRadius: '0px'
      }
    });
  } catch (err) {
    console.warn('[ExportImage] Retrying export with relaxed options due to error:', err);
    dataUrl = await toPng(element, {
      quality: 0.9,
      pixelRatio: 1.5,
      backgroundColor,
      skipFonts: true,
      fontEmbedCSS: ''
    });
  }

  // Trigger download
  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

