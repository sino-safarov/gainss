export interface PdfImagePage {
  jpeg: Uint8Array
  /** Pixel size of the JPEG. */
  width: number
  height: number
}

export const A4 = { width: 595, height: 842 }

/** Writes a minimal PDF where every page is one full-bleed JPEG. */
export function buildPdf(pages: PdfImagePage[], size = A4): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length
    push(`${id} 0 obj\n${body}\n`)
    if (stream) {
      push('stream\n')
      push(stream)
      push('\nendstream\n')
    }
    push('endobj\n')
  }

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const pageId = (i: number) => 3 + i * 3
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`)
  pages.forEach((page, i) => {
    const id = pageId(i)
    const content = enc.encode(`q ${size.width} 0 0 ${size.height} 0 0 cm /Im0 Do Q`)
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Contents ${id + 1} 0 R /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> >>`,
    )
    object(id + 1, `<< /Length ${content.length} >>`, content)
    object(
      id + 2,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    )
  })

  const count = 3 + pages.length * 3
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
