import { samsungTableOf, type SamsungFile } from './samsung-export.js';

/**
 * Citește o arhivă .zip în browser, fără bibliotecă: directorul central, apoi fiecare fișier cerut, despachetat cu
 * DecompressionStream („deflate-raw”). Doar fișierele pe care le folosim (antrenamente, somn, faze de somn, greutate).
 */
export async function unzipNeeded(buf: ArrayBuffer): Promise<SamsungFile[]> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70_000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('arhiva nu pare un .zip valid');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: SamsungFile[] = [];
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true);
    const elen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    p += 46 + nlen + elen + clen;
    if (!samsungTableOf(name)) continue;
    const ln = v.getUint16(off + 26, true);
    const le = v.getUint16(off + 28, true);
    const data = new Uint8Array(buf, off + 30 + ln + le, csize);
    let bytes: ArrayBuffer;
    if (method === 0) bytes = data.slice().buffer;
    else if (method === 8) bytes = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    else continue;
    out.push({ name, text: dec.decode(bytes) });
  }
  return out;
}

