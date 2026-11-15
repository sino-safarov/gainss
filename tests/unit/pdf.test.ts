import { describe, expect, it } from 'vitest'
import { buildPdf } from '../../src/report/pdf'

describe('buildPdf', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
  const pdf = buildPdf([
    { jpeg, width: 10, height: 20 },
    { jpeg, width: 10, height: 20 },
  ])
  const text = Buffer.from(pdf).toString('latin1')

  it('has a header, two pages and a trailer', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text).toContain('/Type /Pages /Count 2 /Kids [3 0 R 6 0 R]')
    expect(text).toContain('/Filter /DCTDecode /Length 9')
    expect(text.endsWith('%%EOF\n')).toBe(true)
  })

  it('points every cross-reference entry at its object', () => {
    const xref = Number(/startxref\n(\d+)\n/.exec(text)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const entries = text.slice(xref).split('\n').slice(3, 3 + 8)
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10))
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })

  it('embeds the image bytes unchanged', () => {
    const at = text.indexOf('stream\n', text.indexOf('/DCTDecode')) + 7
    expect([...pdf.subarray(at, at + jpeg.length)]).toEqual([...jpeg])
  })
})
