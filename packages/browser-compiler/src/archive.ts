// Minimal archive readers for the browser compiler: `ar` (rustc's staticlib output) and
// `ustar` (the prebuilt dependency pack).

const text = new TextDecoder();

/** The first `.o` member of a GNU/System V `ar` archive (rustc's fat-LTO staticlib has one). */
export function firstObject(archive: Uint8Array): Uint8Array {
  if (text.decode(archive.subarray(0, 8)) !== "!<arch>\n") throw new Error("Not an ar archive");
  let off = 8;
  let longNames = "";
  while (off + 60 <= archive.length) {
    const header = text.decode(archive.subarray(off, off + 60));
    let name = header.slice(0, 16).trim();
    const size = Number.parseInt(header.slice(48, 58).trim(), 10);
    const body = archive.subarray(off + 60, off + 60 + size);
    if (name === "//") longNames = text.decode(body);
    else if (/^\/\d+$/.test(name)) name = longNames.slice(Number(name.slice(1))).split("/\n")[0];
    if (name.replace(/\/$/, "").endsWith(".o")) return body;
    off += 60 + size + (size % 2);
  }
  throw new Error("No object file in the compiler output");
}

/** Regular files of a ustar archive, keyed by absolute path ("/deps/libx.rlib"). */
export function untar(tar: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let off = 0;
  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, len: number) => text.decode(header.subarray(start, start + len)).replace(/\0[\s\S]*$/, "");
    const name = field(0, 100);
    const prefix = field(345, 155);
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const path = `/${(prefix ? `${prefix}/${name}` : name).replace(/^\.?\/+/, "")}`;
    if (type === "0" || type === "") files.set(path, tar.slice(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
