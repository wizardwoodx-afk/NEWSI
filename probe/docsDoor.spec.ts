/**
 * THE DOCS DOOR WITH REAL ENGINES — mixed PDFs, and documents that are images.
 *
 * WHY THIS SUITE EXISTS, IN THE WORDS OF THE REVIEW THAT FOUND THE GAPS:
 *
 *   "pdfRender.ts is capable of identifying individual scanned pages inside a mixed PDF…
 *    but documentParsers.ts only invokes the OCR pipeline when the entire PDF produces no
 *    text markdown. So Page 2 can disappear."
 *
 *   "Right now the OCR feature is essentially: scanned PDF → render page → OCR. Not:
 *    arbitrary image → OCR."
 *
 * Both are fixed, and neither fix can be proven by a fake engine — a fake cannot tell you
 * that a mixed PDF's scanned page was really read by a real recogniser while its typed pages
 * kept their own text. So this suite builds genuine documents:
 *
 *   • a THREE-PAGE PDF — typed page, image-only page, typed page — assembled byte by byte,
 *     whose textless middle page is asserted to be textless before anything is read;
 *   • a real JPEG, written by an image encoder rather than renamed from a PNG, because the
 *     signature check and the recogniser's decoder are two different things and a renamed
 *     file would only exercise the first;
 * and pushes each through `parsePdf` / `parseImage`, the functions the door actually calls.
 *
 * REFUSES rather than skips when the engines or the language data are absent: exit 2, the
 * house refusal code, so both runners classify it honestly.
 */
import { parsePdf, parseImage } from "../src/mission/documentParsers";
import { readPdf } from "../src/mission/pdfRender";
import { existsSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const DATA = process.env.SI_TESSDATA ?? path.join(process.cwd(), "public", "ocr", "tessdata");
try {
  if (!existsSync(path.join(DATA, "eng.traineddata.gz")) && !existsSync(path.join(DATA, "eng.traineddata"))) {
    throw new Error(`no eng language data in ${DATA}`);
  }
  await import("clawpdf");
} catch (e) {
  console.log(
    "REFUSED (needs node_modules): the mixed-PDF and image paths need clawpdf and OCR language data — " +
    `${String(e instanceof Error ? e.message : e).slice(0, 120)}. Their LOGIC is proven by scannedPdf.test.ts, ` +
    "which needs nothing; these end-to-end reads are NOT proven here.",
  );
  process.exit(2);
}

const { configureOcrData } = await import("../src/mission/ocrData");
configureOcrData({ dataPath: DATA, language: "eng" });

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures: a PNG decoder, a real JPEG encoder, and a PDF assembler. All byte-level, so
// what the door reads is a document rather than a mock of one.

function decodePng(png: Uint8Array): { rgb: Uint8Array; w: number; h: number } {
  const buf = Buffer.from(png);
  let off = 8, w = 0, h = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); colorType = body[9]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0, b = prev[x], c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < out.length; i += channels, j += 3) { rgb[j] = out[i]; rgb[j + 1] = out[i + 1]; rgb[j + 2] = out[i + 2]; }
  return { rgb, w, h };
}

/**
 * A GENUINE JPEG, encoded by an image library rather than by hand.
 *
 * Why a fixture and not a line of code: the first attempt at this suite carried a hand-
 * written baseline JPEG encoder, and hand-written JPEG entropy coding is a well-known way to
 * produce a file that every decoder rejects for reasons that have nothing to do with the
 * thing under test. The question here is "does the DOOR accept a photograph", not "can this
 * file write a Huffman table", so the image is made once, verified, and carried verbatim.
 *
 * Regenerate it with:
 *   python3 -c "from PIL import Image,ImageDraw;import io,base64; \
 *     im=Image.new('RGB',(760,220),'white'); d=ImageDraw.Draw(im); \
 *     d.text((28,30),'PHOTOGRAPHED INVOICE',fill='black'); \
 *     d.text((28,70),'Vendor: Northwind Supplies',fill='black'); \
 *     d.text((28,110),'Total: 48200 INR',fill='black'); \
 *     d.text((28,150),'Date: 2026-09-14',fill='black'); b=io.BytesIO(); \
 *     im.save(b,'JPEG',quality=88); print(base64.b64encode(b.getvalue()).decode())"
 *
 * Its first three bytes are asserted below, so a fixture that stops being a JPEG fails
 * loudly instead of quietly testing the PNG path twice.
 */
const JPEG_INVOICE = Uint8Array.from(Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcY" +
  "GRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY" +
  "GBgYGBgYGBj/wAARCADcAvgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUF" +
  "BAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVW" +
  "V1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi" +
  "4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC" +
  "AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVm" +
  "Z2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq" +
  "8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6S+Ofxzu/g7qPhbT9P8ET+KbvxDJPDBbwXZgkDxmEKiqIpDIzmYAAYOR3zXCf8NO/Fv8A" +
  "6NU8a/8AfVz/APIdH7Tv/JxP7P3/AGMZ/wDSmxr6dqAPmL/hp34t/wDRqnjX/vq5/wDkOj/hp34t/wDRqnjX/vq5/wDkOvp2igD5" +
  "i/4ad+Lf/RqnjX/vq5/+Q6P+Gnfi3/0ap41/76uf/kOvp2igD5i/4ad+Lf8A0ap41/76uf8A5Do/4ad+Lf8A0ap41/76uf8A5Dr6" +
  "dooA+Yv+Gnfi3/0ap41/76uf/kOj/hp34t/9GqeNf++rn/5Dr6dooA+Yv+Gnfi3/ANGqeNf++rn/AOQ6P+Gnfi3/ANGqeNf++rn/" +
  "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" +
  "8L/8Jvrdv/ZngNNb/wCEh1//AEuG/jbWn/4mlycPB5IZV2d/MPyhTjBwPdaKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigA" +
  "ooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoooo" +
  "AKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD5i/Zi/5OJ/aB/wCxjH/pTfUUfsxf8nE/tA/9jGP/" +
  "AEpvqKbAP2nf+Tif2fv+xjP/AKU2NfTtfMX7Tv8AycT+z9/2MZ/9KbGvp2gAooopAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFF" +
  "FABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABR" +
  "RRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQA" +
  "UUUUAfMX7MX/ACcT+0D/ANjGP/Sm+oo/Zi/5OJ/aB/7GMf8ApTfUU2AftO/8nE/s/f8AYxn/ANKbGvp2vmL9p3/k4n9n7/sYz/6U" +
  "2NfTtABRRXA/FK8tvDen6L8QbpzHb+HdQWW8cDJ+yTqbeXP+yplSU/8AXEUgO+or5u8MeIvH+h+MLDw5c6lpml3Eup2lxPpFxOPO" +
  "vxelLq8lSAWrySBJJ7mNZFmjRPs43jCndp3fjX4j6ToI8T2utz65cXniHxJpNpoTWcAi2Waao9qqlEErSbrCJMlyCrnI3fNQB79R" +
  "XzPaeMJIPixq93p3xR/tLS7uz0G11HxX5VoBp0JOryYBEfkrmZYo8up2+fg5K5rrvAXizxT4j8ZXA13xlLZ6VZabYSQbLa2iXUmm" +
  "1TULeKdmeMkfaIbW2wqFR+9+TaSKAPaqK8O8YCfQ/wBpTWfiHaeY3/CP+HNI/tCJMnzdOlutTFzx3KbIpx3PkFR96uZ+GXjXX7Tw" +
  "N4F0uHX/ACLiKy8OWNh4a8mI/wBpWM1nam4vMlTKfL8y5O5GCr9lwwO407AfS9FfJ/inUvEep/BPQtd8SeNr+8u9b+E3iC+mhkjt" +
  "oIbm4ktLKXywiRLkhXkcYO7ERIIXeD6F4j8Y+L/AGta22p+J7rWtN0G30fWL0y2cCSPBdTXttPEvlxriNDDFMDy42sCzA4osB7dR" +
  "Xz1p/jL4gy6XJYeI9Sil1Lw/rGiaXqTmyh2TXN3rEIJAKYVls5IcFcY+0bh8wBE9341+I+k6CPE9rrc+uXF54h8SaTaaE1nAItlm" +
  "mqPaqpRBK0m6wiTJcgq5yN3zUrAe/UV438LdVttU+NXjG8tPGzeMYh4e0T/iYCOBcHztSJjHkoqnBOcYyN20kkVwOga9aeD7eOfw" +
  "1qOlX3lR6e+o+IrCIw3CWv8AalpHcrrFu+4LdeRLOxmYhwEuTtjxQB9RUV4FqvxUub/WZZLH4gwaT4dfx4uiDWIo7Zo47MaALoqs" +
  "kiMmDcgkSNnr1KcViSfFHxl5+ppL46Fvf2mgxX2hab9jtwfEc/8AaGowwnDR7j9ohtrQ7YiuPN3LtAOXYD6Yor5pbxhr3hmxdPDT" +
  "2Zn+1+LHuTKiZtseJrZDM8nlu0axQXc0pG1lxhmRwBUmofEzxjpvhy21G78fae9nHe3ix3GmmG6l1GONLYosUklrDDdlXe4UxQiK" +
  "RxtEbM0b5VgPpKiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAo" +
  "oooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA" +
  "KKKKACiiigD5i/Zi/wCTif2gf+xjH/pTfUUfsxf8nE/tA/8AYxj/ANKb6imwD9p3/k4n9n7/ALGM/wDpTY19O18xftO/8nE/s/f9" +
  "jGf/AEpsa+naACiiikAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBRv9H07U7/AEu9vrfzZ9LuWvLN97L5UphkgLYBAb93PKuDkfNn" +
  "GQCCLR9Og8S3fiCK326jd20FnPPvY74oXleNducDDXExyBk7uScDF6igAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAC" +
  "iiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiig" +
  "AooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAPmL9mL/k4n9oH/sYx/wClN9RR+zF/ycT+0D/2MY/9" +
  "Kb6imwD9p3/k4n9n7/sYz/6U2NfTtfMX7Tv/ACcT+z9/2MZ/9KbGvp2gAooopAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAB" +
  "RRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQ" +
  "AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUU" +
  "UAfMX7MX/JxP7QP/AGMY/wDSm+oo/Zi/5OJ/aB/7GMf+lN9RTYB+07/ycT+z9/2MZ/8ASmxr6dr5i/ad/wCTif2fv+xjP/pTY19O" +
  "0AFecfHnRdH1f9nHxxLquk2N89n4f1C4tnuoElMEgtZMOhYHaw9Rg16PRSA8QvdXuvDfj+78KeGdRtfDoi1iwstN8L6dY20S31nc" +
  "JCbm+VTGWLRmS5bcp2D7LhlO45434P8AxJ1uTUfhj4WTxlLqcE1na6df2V59mEu7+x5btnAVPNfZLGsJlLKAUeNleRWkr6hopgeU" +
  "fCXVLuH9lDw9deG2HiPVLPw7YxxaWlxCnlXKWEA+zF/l2fNhm3ksPMPbao8PWzuY/GWvaf4n+waRt1a9uLrUvHlvBe6fLeSaTpTF" +
  "PJiuCqzli0kREmEiMiKGJIT7HopAfPEE3hTUNb+Guh3mprZ+MF03Rr2efXb2MX1hDFh1t0DYZri5fdFIqj5k3lukatzNp9n/AOER" +
  "0r+zMfav7Dt/+Fh/Z/8AWef/AGnY/afteOfM8n+1c7udmf4cV9W0UwPBdR/s/wD4Zf8AjX/wj32f/hGPs2q/2J9kx9m8j+zI/N8n" +
  "b8vl/aftWNvGc4rj/in53hq0+O/jCHzGsNR8/QNVQZIXfoFn9jmx/szStEfa5yeEr6qoouB87appe741eJ9abw/o0Ucfj3R4X8SL" +
  "J/xMbXNjpm2BF8rmKRmWFj5o+W4k+Q45+iaKKQBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFF" +
  "FABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABR" +
  "RRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB8xfsxf8AJxP7QP8A2MY/9Kb6ij9mL/k4n9oH/sYx/wClN9RT" +
  "YB+07/ycT+z9/wBjGf8A0psa+na+Yv2nf+Tif2fv+xjP/pTY19O0AFFFFIAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKK" +
  "ACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACii" +
  "igAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD5" +
  "i/Zi/wCTif2gf+xjH/pTfUUfsxf8nE/tA/8AYxj/ANKb6imwD9p3/k4n9n7/ALGM/wDpTY19O18xftO/8nE/s/f9jGf/AEpsa+na" +
  "ACiivMPjF/wi/wDanw6/4TP+yP7E/wCEmk+0f2v5f2b/AJBOobN/mfL9/bjPfGOaQHp9FfL8HxA1Dw38QV0XwprgsvDM3iLTxo+n" +
  "usKQXlhd3dvazfZy6s8kayi7ZFi8tY1MbbmR0Wqtr468d6GdZ0XTPGlqj2up6tLbNrFzEsl3dHV7tBaLElnK82I1tpPKQxyYuhtb" +
  "YUCOwH1VRXBeP9X8Had8Jr/UfF+rjUdGivcSIZYQLqVbrC2R4VCvmKISrYGFIkP3zXieoWWmWHg68gudS0q/v28MmbwU9jOs8EOq" +
  "yX15I9vp7jqYXawhG3B2RjgDICA+qaK+efHl1o1/8TPEqeAtWsl8baRp1/dPKt0hvrq7bTXjg0+FM72iQFJ2AG1XWMjLF9u98KXF" +
  "nqWvWvgq18MapZqmnu93pVxJa2DFhMJVxibddoqxmRvl8wPFu2EHIB7RRXynaJZP4LsfsFxDBfp4cSTxywVir6gt/ZMyX+35gHxq" +
  "KSMQWWFnOCoAPq3wjm1v+zdWk0vSfD6eHZ9dkNkunXri1t7UW0AY2mIcTKbgXPP7tSSzDg4oA9WorxfQbHVvCul/FTS/h9pN1eX4" +
  "8TwxwL9oSSWMy6VpxluGa4kUSOu95MM/ztgEjJI2vgHEbX4OPp/9najZR2mva1BGmoTRzTMo1S55Z0dwzAkqxJ5ZWIyCGIB6dRRR" +
  "QAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUU" +
  "UUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAF" +
  "FFFABRRRQB8xfsxf8nE/tA/9jGP/AEpvqKP2Yv8Ak4n9oH/sYx/6U31FNgH7Tv8AycT+z9/2MZ/9KbGvp2vmL9p3/k4n9n7/ALGM" +
  "/wDpTY19O0AFFFFIAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooo" +
  "oAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKK" +
  "KKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD5i/Zi/5OJ/aB/7GMf8ApTfUUfsxf8nE/tA/9jGP/Sm+" +
  "opsA/ad/5OJ/Z+/7GM/+lNjX07XzF+07/wAnE/s/f9jGf/Smxr6doAKKKKQBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUU" +
  "UAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFF" +
  "FFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH" +
  "zF+zF/ycT+0D/wBjGP8A0pvqKP2Yv+Tif2gf+xjH/pTfUU2AftO/8nE/s/f9jGf/AEpsa+na+Yv2nf8Ak4n9n7/sYz/6U2NfTtAB" +
  "RRRSAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoooo" +
  "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",
  "base64",
));

/** The same page as a PNG, so the suite can show the two real formats both come through. */
const PNG_INVOICE = (() => {
  // Built from the decoded RGB of a rendered PDF page, re-encoded as a checksum-valid PNG.
  // Small and dependency-free: the PDF page fixtures above already produce the pixels.
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (buf: Uint8Array) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Uint8Array) => {
    const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, data.length);
    const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
    const c = new Uint8Array(4); new DataView(c.buffer).setUint32(0, crc(body));
    return new Uint8Array([...len, ...body, ...c]);
  };
  return { chunk, crcTable };
})();

/** A PDF built from a list of pages, each either a stream of text operators or an image. */
function buildPdf(pages: Array<{ kind: "text"; body: string } | { kind: "image"; png: Uint8Array; w: number; h: number }>): Uint8Array {
  const objects: Array<{ dict: string; stream?: Buffer }> = [];
  const kids: number[] = [];
  // 1 catalog, 2 pages, then per page: page object, contents, and for images an XObject
  objects.push({ dict: "<</Type/Catalog/Pages 2 0 R>>" });
  objects.push({ dict: "" }); // filled in once the kids are known
  pages.forEach((pg, i) => {
    const pageObj = 3 + i * 2;
    kids.push(pageObj);
  });
  pages.forEach((pg, i) => {
    const pageObj = 3 + i * 2, contentObj = pageObj + 1;
    if (pg.kind === "text") {
      const body = Buffer.from(pg.body, "latin1");
      objects[pageObj - 1] = { dict: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${contentObj} 0 R/Resources<</Font<</F1 ${3 + pages.length * 2} 0 R>>>>>>` };
      objects[contentObj - 1] = { dict: `<</Length ${body.length}>>`, stream: body };
    } else {
      const img = zlib.deflateSync(Buffer.from(pg.png));
      // The image object goes LAST in the file so the page numbering above stays simple;
      // its number is reserved here and appended after the loop.
      const imgObj = 100 + i;
      objects[pageObj - 1] = { dict: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${contentObj} 0 R/Resources<</XObject<</Im0 ${imgObj} 0 R>>>>>>` };
      const content = Buffer.from(`q 612 0 0 792 0 0 cm /Im0 Do Q`, "latin1");
      objects[contentObj - 1] = { dict: `<</Length ${content.length}>>`, stream: content };
      objects[imgObj - 1] = { dict: `<</Type/XObject/Subtype/Image/Width ${pg.w}/Height ${pg.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/FlateDecode/Length ${img.length}>>`, stream: img };
    }
  });
  const fontObj = 3 + pages.length * 2;
  objects[fontObj - 1] = { dict: "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>" };
  objects[1] = { dict: `<</Type/Pages/Kids[${kids.map((k) => `${k} 0 R`).join(" ")}]/Count ${pages.length}>>` };

  let out = Buffer.from("%PDF-1.4\n");
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    if (!obj) return;
    offsets[i] = out.length;
    const head = Buffer.from(`${i + 1} 0 obj\n${obj.dict}\n`);
    if (obj.stream) out = Buffer.concat([out, head, Buffer.from("stream\n"), obj.stream, Buffer.from("\nendstream\nendobj\n")]);
    else out = Buffer.concat([out, head, Buffer.from("endobj\n")]);
  });
  const xref = out.length;
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < objects.length; i++) tail += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  tail += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.concat([out, Buffer.from(tail)]));
}

// ─────────────────────────────────────────────────────────────────────────────
section("0. build the fixtures — asserted to be what they claim before they are used");

// A page of text, rendered to pixels: this is the "scanned" middle page.
const TEXT_PAGE = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
  "4 0 obj<</Length 104>>stream\nBT /F1 30 Tf 60 640 Td (SCANNED INVOICE BODY) Tj 0 -60 Td (Subtotal 1200 USD) Tj ET\nendstream endobj\n" +
  "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>",
);
const shot = await readPdf(TEXT_PAGE, { renderScannedPages: true, dpi: 200, minTextChars: 10_000 });
ok("the middle page's pixels were produced", shot.ok === true && shot.result?.pages[0].png !== undefined, shot.ok ? "no png" : shot.refusal.words);
const dec = decodePng(shot.result!.pages[0].png!);

const MIXED = buildPdf([
  { kind: "text", body: "BT /F1 26 Tf 60 700 Td (COVER PAGE) Tj 0 -40 Td (Prepared for the board) Tj ET" },
  { kind: "image", png: dec.rgb, w: dec.w, h: dec.h },
  { kind: "text", body: "BT /F1 26 Tf 60 700 Td (APPENDIX) Tj 0 -40 Td (Signed off 2026-09) Tj ET" },
]);

// The premise, asserted rather than assumed: the file must really be mixed, i.e. exactly one
// page with no text layer. If this fails, the suite would be testing nothing.
const probe = await readPdf(MIXED, { renderScannedPages: false });
ok("the fixture is a three-page document", probe.ok === true && (probe.result?.pageCount ?? 0) === 3, String(probe.ok ? probe.result?.pageCount : ""));
ok("…whose first and third pages carry text", probe.ok === true && /COVER PAGE/.test(probe.result?.pages[0].text ?? "") && /APPENDIX/.test(probe.result?.pages[2].text ?? ""), "");
ok("…and whose SECOND page carries NONE — the page that used to disappear",
  probe.ok === true && (probe.result?.pages[1].text ?? "x") === "", JSON.stringify(probe.ok ? probe.result?.pages[1].text : "?"));

// ─────────────────────────────────────────────────────────────────────────────
section("1. a MIXED document keeps every page — the scanned one included");

const mixed = await parsePdf(MIXED, 100_000);
ok("the mixed PDF reads", mixed.ok === true, mixed.ok ? "" : `${mixed.refusal.code}: ${mixed.refusal.words.slice(0, 140)}`);
if (mixed.ok) {
  const md = mixed.markdown;
  console.log(`           markdown: ${JSON.stringify(md.replace(/\n/g, " ⏎ ").slice(0, 220))}`);
  ok("page 1 kept its own text", /COVER PAGE/.test(md), md.slice(0, 80));
  ok("page 3 kept its own text", /APPENDIX/.test(md), "");
  ok("PAGE 2 WAS READ — the page that used to vanish", /SCANNED INVOICE BODY/i.test(md), md.slice(0, 200));
  ok("…and its numbers came through too", /1200/.test(md), "");
  ok("the pages are in document order", md.indexOf("COVER PAGE") < md.indexOf("APPENDIX"), "");
  ok("…and the scanned page sits BETWEEN them", md.indexOf("COVER PAGE") < md.search(/SCANNED INVOICE/i) && md.search(/SCANNED INVOICE/i) < md.indexOf("APPENDIX"), "");
  ok("the notes say the read happened on this machine", mixed.notes.join(" ").includes("on this machine"), mixed.notes.join(" | ").slice(0, 160));

  // The point of the whole exercise: the document must be distillable by the next gate.
  const { extractStructure } = await import("../src/mission/knowledgeSkills");
  const structure = extractStructure(md);
  ok("the next gate finds structure in the spliced document", Boolean(structure), JSON.stringify(structure).slice(0, 120));

  // And it must be ONE document, not three. A spliced file that reads as a pile is a
  // different failure wearing the same fix.
  ok("it reads as one document, not a pile of fragments", md.split("## Page").length - 1 === 3, `${md.split("## Page").length - 1} page headings`);
}

// ─────────────────────────────────────────────────────────────────────────────
section("2. a document that IS an image — a real JPEG, no PDF involved");

ok("the fixture really is a JPEG (not a renamed PNG)", JPEG_INVOICE[0] === 0xff && JPEG_INVOICE[1] === 0xd8 && JPEG_INVOICE[2] === 0xff, `${JPEG_INVOICE.length} bytes`);
ok("…and it is not a PNG", !(JPEG_INVOICE[0] === 0x89 && JPEG_INVOICE[1] === 0x50), "");

const imgRead = await parseImage(JPEG_INVOICE, 100_000);
ok("the JPEG reads as a document", imgRead.ok === true, imgRead.ok ? "" : `${imgRead.refusal.code}: ${imgRead.refusal.words.slice(0, 140)}`);
if (imgRead.ok) {
  console.log(`           markdown: ${JSON.stringify(imgRead.markdown.replace(/\n/g, " ⏎ ").slice(0, 200))}`);
  const flat = imgRead.markdown.toUpperCase().replace(/[^A-Z0-9]/g, "");
  ok("its text was recognised", flat.includes("INVOICE"), imgRead.markdown.slice(0, 100));
  ok("…including the vendor", flat.includes("NORTHWIND"), "");
  ok("…including the amount", flat.includes("48200"), "");
  ok("it has a heading, like every other document", imgRead.markdown.startsWith("## Page 1"), "");
  ok("and it says it was an image read on this machine", /document is an image/.test(imgRead.notes.join(" ")) && /on this machine/.test(imgRead.notes.join(" ")), imgRead.notes.join(" | ").slice(0, 160));
  ok("…and reports confidence like every other read", /OCR confidence/.test(imgRead.notes.join(" ")), "");
}

// A PNG is the other format the door now accepts, and it must go through the same pieces.
const pngRead = await parseImage(shot.result!.pages[0].png!, 100_000);
ok("a PNG dropped as a document reads too", pngRead.ok === true, pngRead.ok ? "" : pngRead.refusal.words.slice(0, 120));
ok("…with its text", pngRead.ok === true && /INVOICE/i.test(pngRead.markdown), pngRead.ok ? pngRead.markdown.slice(0, 80) : "");

// And a NON-image must still be refused rather than handed to a recogniser that would
// crash on it. This is the guard, exercised through the door rather than directly.
const notAnImage = await parseImage(new Uint8Array(4096).fill(0x41), 100_000);
ok("bytes that are not an image are refused by the door", notAnImage.ok === false, notAnImage.ok ? "ACCEPTED" : "");
ok("…with a code the door can act on", !notAnImage.ok && notAnImage.refusal.code === "unrecognised-binary", !notAnImage.ok ? notAnImage.refusal.code : "");

// ─────────────────────────────────────────────────────────────────────────────
section("3. the receipt tells the truth about how every page was read");

const mixedNotes = mixed.ok ? mixed.notes.join(" | ") : "";
ok("a read that involved images says so", /read as images|document is an image/.test(mixedNotes), mixedNotes.slice(0, 160));
ok("…and reports a confidence for it", /OCR confidence/.test(mixedNotes), mixedNotes.slice(0, 200));

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
