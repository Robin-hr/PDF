const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');
[UPLOADS_DIR, OUTPUTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.get('/api/download/:filename', (req, res) => {
  const file = path.join(OUTPUTS_DIR, req.params.filename);
  if (fs.existsSync(file)) {
    const customName = req.query.name || 'converted.pdf';
    res.download(file, customName);
  } else {
    res.status(404).send('File not found or expired.');
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});
const fileFilter = (req, file, cb) => {
  const ok = ['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/tiff','image/heic','image/heif'];
  ok.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Unsupported image type: ${file.mimetype}. Please use JPEG, PNG or WebP.`), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 50*1024*1024, files: 50 } });

const PAGE_SIZES = {
  A4: [595.28, 841.89], A3: [841.89, 1190.55],
  Letter: [612, 792], Legal: [612, 1008], A5: [419.53, 595.28]
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PDF Converter API running 🚀', timestamp: new Date().toISOString() });
});

app.post('/api/convert', upload.array('images', 50), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0)
    return res.status(400).json({ error: 'No images uploaded.' });

  const outputFileName = `converted_${uuidv4()}.pdf`;
  const outputPath = path.join(OUTPUTS_DIR, outputFileName);

  try {
    const { pageSize='A4', orientation='auto', margin='30', fitMode='fit', pdfName='converted' } = req.body;
    const marginPx = parseInt(margin, 10) || 30;
    const [defW, defH] = PAGE_SIZES[pageSize] || PAGE_SIZES['A4'];

    const doc = new PDFDocument({ autoFirstPage: false, compress: true });
    const ws = fs.createWriteStream(outputPath);
    doc.pipe(ws);

    for (let i = 0; i < files.length; i++) {
      const imgPath = files[i].path;

      // ── 1. Create pipeline from frontend Cropper blob ──
      let pipeline = sharp(imgPath).rotate(); 

      // ── 4. Apply Enhancement ──
      const enhance = req.body[`enhance_${i}`] || 'none';
      if (enhance === 'bw')      pipeline = pipeline.grayscale().normalize().sharpen({ sigma: 1.5 });
      else if (enhance === 'enhance') pipeline = pipeline.normalize().sharpen({ sigma: 0.8 });
      else if (enhance === 'scan')    pipeline = pipeline.grayscale().normalize().sharpen({ sigma: 2 }).linear(1.3, -20);

      // To JPEG buffer
      const jpegBuf = await pipeline.jpeg({ quality: 92 }).toBuffer();
      const { width: imgW, height: imgH } = await sharp(jpegBuf).metadata();

      // ── Page layout ───────────────────────────────────────
      let pageW, pageH;
      if (orientation === 'auto')      { pageW = imgW > imgH ? defH : defW; pageH = imgW > imgH ? defW : defH; }
      else if (orientation === 'landscape') { pageW = defH; pageH = defW; }
      else                                   { pageW = defW; pageH = defH; }

      doc.addPage({ size: [pageW, pageH], margin: 0 });

      const aW = pageW - marginPx * 2, aH = pageH - marginPx * 2;
      let dW, dH, dX, dY;

      if (fitMode === 'stretch') {
        dW = aW; dH = aH; dX = marginPx; dY = marginPx;
      } else if (fitMode === 'fill') {
        const s = Math.max(aW / imgW, aH / imgH);
        dW = imgW * s; dH = imgH * s;
        dX = marginPx + (aW - dW) / 2; dY = marginPx + (aH - dH) / 2;
      } else {
        const s = Math.min(aW / imgW, aH / imgH);
        dW = imgW * s; dH = imgH * s;
        dX = marginPx + (aW - dW) / 2; dY = marginPx + (aH - dH) / 2;
      }

      doc.image(jpegBuf, dX, dY, { width: dW, height: dH });
    }

    doc.end();
    await new Promise((resolve, reject) => { ws.on('finish', resolve); ws.on('error', reject); });

    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
    setTimeout(() => { try { fs.unlinkSync(outputPath); } catch (_) {} }, 10 * 60 * 1000);

    const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);
    const safeName = encodeURIComponent(`${pdfName}.pdf`);
    res.json({ success: true, downloadUrl: `/api/download/${outputFileName}?name=${safeName}`, fileName: `${pdfName}.pdf`, pages: files.length, fileSize: `${sizeKB} KB` });

  } catch (err) {
    console.error('Conversion error:', err);
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
    if (fs.existsSync(outputPath)) { try { fs.unlinkSync(outputPath); } catch (_) {} }
    res.status(500).json({ error: 'PDF conversion failed: ' + err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('[Global Error]:', err);
  if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ error: 'One or more files are too large (max 50MB per file).' });
  if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files uploaded at once (max 50).' });
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 PDF Converter API → http://localhost:${PORT}`);
  console.log(`📄 Health → http://localhost:${PORT}/api/health\n`);
});
