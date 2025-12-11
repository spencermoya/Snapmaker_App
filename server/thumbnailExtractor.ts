/**
 * Extracts embedded thumbnails from G-code files.
 * 
 * Many slicers embed PNG thumbnails in G-code comments:
 * - PrusaSlicer/SuperSlicer: ; thumbnail begin WxH ...base64... ; thumbnail end
 * - Cura: ;Generated with Cura ... or uses custom thumbnail plugin format
 * - Snapmaker Luban: May include thumbnails in similar format
 */

export function extractThumbnail(gcode: string): string | null {
  if (!gcode || typeof gcode !== 'string') {
    return null;
  }

  // Try PrusaSlicer/SuperSlicer format first (most common)
  // Format: ; thumbnail begin WxH length
  //         ; base64data...
  //         ; thumbnail end
  const prusaMatch = gcode.match(/;\s*thumbnail begin \d+[xX]\d+[^\n]*\n([\s\S]*?);\s*thumbnail end/i);
  if (prusaMatch) {
    const base64Data = prusaMatch[1]
      .split('\n')
      .map(line => line.replace(/^;\s*/, '').trim())
      .filter(line => line.length > 0)
      .join('');
    
    if (base64Data.length > 100) {
      return `data:image/png;base64,${base64Data}`;
    }
  }

  // Try to find the largest thumbnail if multiple exist
  const thumbnailRegex = /;\s*thumbnail begin (\d+)[xX](\d+)[^\n]*\n([\s\S]*?);\s*thumbnail end/gi;
  const allThumbnails = Array.from(gcode.matchAll(thumbnailRegex));
  let largestThumbnail: { width: number; height: number; data: string } | null = null;
  
  for (const match of allThumbnails) {
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);
    const base64Data = match[3]
      .split('\n')
      .map((line: string) => line.replace(/^;\s*/, '').trim())
      .filter((line: string) => line.length > 0)
      .join('');
    
    if (base64Data.length > 100) {
      if (!largestThumbnail || (width * height > largestThumbnail.width * largestThumbnail.height)) {
        largestThumbnail = { width, height, data: base64Data };
      }
    }
  }
  
  if (largestThumbnail) {
    return `data:image/png;base64,${largestThumbnail.data}`;
  }

  // Try Cura's thumbnail format (uses different encoding sometimes)
  // Format: ;THUMBNAIL_BLOCK_START or similar markers
  const curaMatch = gcode.match(/;\s*(?:THUMBNAIL_BLOCK_START|thumbnail_begin)[^\n]*\n([\s\S]*?);\s*(?:THUMBNAIL_BLOCK_END|thumbnail_end)/i);
  if (curaMatch) {
    const base64Data = curaMatch[1]
      .split('\n')
      .map(line => line.replace(/^;\s*/, '').trim())
      .filter(line => line.length > 0 && !line.startsWith(';'))
      .join('');
    
    if (base64Data.length > 100) {
      return `data:image/png;base64,${base64Data}`;
    }
  }

  // Try Snapmaker Luban format
  // Luban may use: ;thumbnail:data:image/png;base64,... format
  const lubanMatch = gcode.match(/;\s*thumbnail\s*:\s*data:image\/[^;]+;base64,([A-Za-z0-9+/=\s]+)/i);
  if (lubanMatch) {
    const base64Data = lubanMatch[1].replace(/\s/g, '');
    if (base64Data.length > 100) {
      return `data:image/png;base64,${base64Data}`;
    }
  }

  return null;
}
