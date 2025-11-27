import html2canvas from "html2canvas";

// Generates an optimized thumbnail from an HTML element and returns it as a base64 encoded JPEG.
export const generateOptimizedThumbnail = async (elementId: string): Promise<string | undefined> => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element with ID "${elementId}" not found for thumbnail generation.`);
    return undefined;
  }

  try {
    // Render with a specific scale, then resize precisely for optimization
    const canvas = await html2canvas(element as HTMLElement, {
      backgroundColor: '#bbc7d6',
      scale: 1,
      useCORS: true,
      logging: false,
      allowTaint: true,
    });

    // Define target dimensions for the thumbnail
    const maxW = 420;
    const maxH = 240;

    // Calculate the best-fit ratio to maintain aspect ratio without stretching
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
    const outW = Math.max(1, Math.round(canvas.width * ratio));
    const outH = Math.max(1, Math.round(canvas.height * ratio));

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outW;
    outputCanvas.height = outH;
    const ctx = outputCanvas.getContext('2d');

    if (ctx) {
      // Enable image smoothing for better quality on downscaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, outW, outH);

      // Return JPEG with moderate quality to keep file size small
      return outputCanvas.toDataURL('image/jpeg', 0.65);
    }

    return undefined;
  } catch (error) {
    console.warn('Thumbnail generation failed, continuing without thumbnail.', error);
    return undefined;
  }
};