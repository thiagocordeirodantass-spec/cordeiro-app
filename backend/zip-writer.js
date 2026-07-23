// =============================================================================
//  Gerador de ZIP (sem dependencias / sem npm) — metodo STORE, sem compressao.
//  Usado para empacotar varios XML/PDF organizados em pastas num unico
//  arquivo .zip, para download em lote (aba "Portal Nacional").
//  Mesma tecnica do xlsx-writer.js, generalizada para qualquer arquivo.
// =============================================================================
import { Buffer } from "buffer";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function dosDateTime(d = new Date()) {
  const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const dosDate = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

// Sanitiza uma parte de caminho (pasta/arquivo) para uso dentro do ZIP
function sanitizePathPart(s) {
  return String(s ?? "")
    .replace(/[\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "sem-nome";
}
export function buildZipPath(parts) {
  return parts.filter(Boolean).map(sanitizePathPart).join("/");
}

export class ZipWriter {
  constructor() {
    this.entries = [];
    this.chunks = [];
    this.offset = 0;
    this._usedNames = new Set();
  }
  addFile(zipPath, content) {
    let finalPath = zipPath;
    let n = 1;
    while (this._usedNames.has(finalPath)) {
      const dot = zipPath.lastIndexOf(".");
      finalPath = dot > 0 ? `${zipPath.slice(0, dot)} (${n})${zipPath.slice(dot)}` : `${zipPath} (${n})`;
      n++;
    }
    this._usedNames.add(finalPath);

    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    const nameBuf = Buffer.from(finalPath, "utf-8");
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime();
    const localOffset = this.offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    this.chunks.push(local, nameBuf, data);
    this.offset += local.length + nameBuf.length + data.length;
    this.entries.push({ nameBuf, crc, size: data.length, localOffset, dosTime, dosDate });
    return finalPath;
  }
  toBuffer() {
    const centralChunks = [];
    let centralSize = 0;
    for (const e of this.entries) {
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(e.dosTime, 12);
      central.writeUInt16LE(e.dosDate, 14);
      central.writeUInt32LE(e.crc, 16);
      central.writeUInt32LE(e.size, 20);
      central.writeUInt32LE(e.size, 24);
      central.writeUInt16LE(e.nameBuf.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(e.localOffset, 42);
      centralChunks.push(central, e.nameBuf);
      centralSize += central.length + e.nameBuf.length;
    }
    const centralOffset = this.offset;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...this.chunks, ...centralChunks, end]);
  }
}
