/* PDF Forge – app.js  (Crop + Scanner Edition) */

// Dynamic API URL based on current frontend address
const API_BASE = window.location.origin + '/api';
// ── State ─────────────────────────────────────────────────────
// { file, objectUrl, crop:{x,y,w,h}|null, enhance:'none'|'bw'|'scan'|'enhance' }
let imageFiles = [];
let cropIndex  = -1;   // which image is open in crop modal
let editor     = null; // CropEditor instance
let modalEnhance = 'none';

// ── DOM ───────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const dropZone       = $('dropZone'),   fileInput     = $('fileInput');
const browseBtn      = $('browseBtn'),  addMoreBtn    = $('addMoreBtn');
const clearAllBtn    = $('clearAllBtn');
const previewSection = $('previewSection'), previewGrid = $('previewGrid');
const countBadge     = $('countBadge');
const settingsSection= $('settingsSection'), convertWrap = $('convertWrap');
const progressWrap   = $('progressWrap'), progressBar = $('progressBar');
const progressPct    = $('progressPct'), progressLabel = $('progressLabel');
const progressSub    = $('progressSub');
const resultWrap     = $('resultWrap'), resultMeta    = $('resultMeta');
const downloadBtn    = $('downloadBtn'), convertAnotherBtn = $('convertAnotherBtn');
const errorWrap      = $('errorWrap'),  errorMsg      = $('errorMsg');
const retryBtn       = $('retryBtn');
const marginRange    = $('margin'),    marginVal     = $('marginVal');
// Crop modal
const cropModal      = $('cropModal'), cropCanvas    = $('cropCanvas');
const cropInfo       = $('cropInfo'),  cropModalClose= $('cropModalClose');
const cropCancel     = $('cropCancel'),cropApply     = $('cropApply');
const cropReset      = $('cropReset');

marginRange.addEventListener('input', () => { marginVal.textContent = marginRange.value; });

// ── Drop zone ─────────────────────────────────────────────────
['dragenter','dragover'].forEach(e => dropZone.addEventListener(e, ev =>{ ev.preventDefault(); dropZone.classList.add('drag-over'); }));
['dragleave','drop'].forEach(e => dropZone.addEventListener(e, ev =>{ ev.preventDefault(); dropZone.classList.remove('drag-over'); }));
dropZone.addEventListener('drop', e => { const f=[...e.dataTransfer.files].filter(isImg); if(f.length) addFiles(f); });
dropZone.addEventListener('click', e => { if(e.target!==browseBtn) fileInput.click(); });
browseBtn.addEventListener('click', e =>{ e.stopPropagation(); fileInput.click(); });
addMoreBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f=[...fileInput.files].filter(isImg); if(f.length) addFiles(f); fileInput.value='';
});
const isImg = f => f.type.startsWith('image/');

// ── File management ───────────────────────────────────────────
function addFiles(files) {
  files.forEach(file => {
    if(imageFiles.length >= 50) return;
    // Store originalFile to allow resetting cropper.
    imageFiles.push({ 
      originalFile: file, 
      file: file, 
      objectUrl: URL.createObjectURL(file), 
      crop: null, 
      enhance: 'none' 
    });
  });
  renderPreviews(); showUI();
}
function removeImage(i) {
  URL.revokeObjectURL(imageFiles[i].objectUrl);
  imageFiles.splice(i,1);
  imageFiles.length ? renderPreviews() : resetUI();
}
function renderPreviews() {
  previewGrid.innerHTML = '';
  imageFiles.forEach(({ file, objectUrl, crop, enhance, rotation }, idx) => {
    const item = document.createElement('div');
    item.className = 'preview-item slide-up';
    item.style.animationDelay = `${idx*25}ms`;
    // Image
    const img = document.createElement('img');
    img.src = objectUrl; img.alt = file.name; img.loading = 'lazy';
    // Page num
    const pg = document.createElement('span');
    pg.className = 'page-num'; pg.textContent = `Page ${idx+1}`;
    // Filename
    const fn = document.createElement('div');
    fn.className = 'file-name'; fn.textContent = file.name;
    // Crop btn
    const cb = document.createElement('button');
    cb.className = 'crop-btn'; cb.title = 'Crop & Enhance'; cb.innerHTML = '✂️';
    cb.addEventListener('click', e => { e.stopPropagation(); openCropModal(idx); });
    // Remove btn
    const rb = document.createElement('button');
    rb.className = 'remove-btn'; rb.title = 'Remove'; rb.innerHTML = '✕';
    rb.addEventListener('click', e => { e.stopPropagation(); removeImage(idx); });
    // Edited badge
    if(crop || enhance !== 'none') {
      const badge = document.createElement('div');
      badge.className = 'edited-badge';
      const icons = [crop?'✂️':'', enhance==='bw'?'📄':enhance==='scan'?'🖨️':enhance==='enhance'?'✨':''].filter(Boolean);
      badge.textContent = icons.join(' ');
      item.appendChild(badge);
    }
    item.append(img, pg, fn, cb, rb);
    previewGrid.appendChild(item);
  });
  countBadge.textContent = imageFiles.length;
}

// ── UI helpers ────────────────────────────────────────────────
function showUI() {
  previewSection.hidden = settingsSection.hidden = convertWrap.hidden = false;
  progressWrap.hidden = resultWrap.hidden = errorWrap.hidden = true;
}
function resetUI() {
  imageFiles.forEach(i => URL.revokeObjectURL(i.objectUrl)); imageFiles = [];
  previewGrid.innerHTML = '';
  [previewSection,settingsSection,convertWrap,progressWrap,resultWrap,errorWrap].forEach(el=>el.hidden=true);
}
clearAllBtn.addEventListener('click', resetUI);
convertAnotherBtn.addEventListener('click', resetUI);
retryBtn.addEventListener('click', () => { errorWrap.hidden=true; convertWrap.hidden=false; });

// ═════════════════════════════════════════════════════════════
// ══  CROP MODAL LOGIC (powered by Cropper.js)  ═══════════════
// ═════════════════════════════════════════════════════════════
let cropper = null;

async function openCropModal(idx) {
  cropIndex   = idx;
  modalEnhance = imageFiles[idx].enhance || 'none';

  // Set enhance buttons
  document.querySelectorAll('.enhance-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.enhance === modalEnhance);
  });

  const target = $('cropTarget');
  // Initialize with the ORIGINAL file so you can redo crops
  target.src = URL.createObjectURL(imageFiles[idx].originalFile);

  cropModal.hidden = false; 

  if(cropper){ cropper.destroy(); cropper=null; }
  
  $('freeRotate').value = 0;
  $('rotateVal').textContent = '0°';

  // Wait a tick for modal to display to avoid Cropper initialization bugs
  setTimeout(() => {
    cropper = new Cropper(target, {
      viewMode: 2,
      autoCropArea: 0.9,
      background: false,
      responsive: true
    });
  }, 50);
}

function closeCropModal() {
  cropModal.hidden = true;
  if(cropper){ cropper.destroy(); cropper=null; }
  cropIndex = -1;
}

cropModalClose.addEventListener('click', closeCropModal);
cropCancel.addEventListener('click', closeCropModal);
cropModal.addEventListener('click', e => { if(e.target===cropModal) closeCropModal(); });

const freeRotate = $('freeRotate');
const rotateVal = $('rotateVal');
if(freeRotate){
  freeRotate.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    rotateVal.textContent = val + '°';
    if(cropper) cropper.rotateTo(val);
  });
}

cropReset.addEventListener('click', () => { 
  if(cropper) {
    cropper.reset();
    freeRotate.value = 0;
    rotateVal.textContent = '0°';
  }
});

// Apply
cropApply.addEventListener('click', () => {
  if(cropIndex < 0 || !cropper) return;
  
  // Extract visually perfect cropped blob directly from CropperJS!
  const canvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });
  
  if(!canvas) {
    closeCropModal();
    return;
  }

  canvas.toBlob(blob => {
    // We overwrite the active file with our perfect cropped blob
    // By keeping originalFile, the user can reset entirely if they wish
    const oldUrl = imageFiles[cropIndex].objectUrl;
    
    imageFiles[cropIndex].file = blob;
    imageFiles[cropIndex].objectUrl = URL.createObjectURL(blob);
    imageFiles[cropIndex].crop = true; // flag that a crop exists
    imageFiles[cropIndex].enhance = modalEnhance;

    URL.revokeObjectURL(oldUrl); // cleanup
    closeCropModal();
    renderPreviews();
  }, 'image/jpeg', 0.95);
});

// Enhance buttons
document.querySelectorAll('.enhance-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    modalEnhance = btn.dataset.enhance;
    document.querySelectorAll('.enhance-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Escape key closes modal
document.addEventListener('keydown', e => {
  if(e.key==='Escape' && !cropModal.hidden) closeCropModal();
});

// ═════════════════════════════════════════════════════════════
// ══  CONVERSION  ═════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
document.getElementById('convertBtn').addEventListener('click', startConversion);

async function startConversion() {
  if(!imageFiles.length) return;

  const pdfName    = $('pdfName').value.trim() || 'converted';
  const pageSize   = $('pageSize').value;
  const orientation= $('orientation').value;
  const fitMode    = $('fitMode').value;
  const margin     = $('margin').value;

  convertWrap.hidden=true; progressWrap.hidden=false; resultWrap.hidden=errorWrap.hidden=true;
  setProg(0,'Uploading images…','Sending to server…');

  const form = new FormData();
  imageFiles.forEach(({file, enhance}, i) => {
    // The 'file' here is already cropped to perfection by CropperJS!
    form.append('images', file, `image_${i}.jpg`);
    if(enhance && enhance!=='none') form.append(`enhance_${i}`, enhance);
  });
  form.append('pdfName', pdfName);
  form.append('pageSize', pageSize);
  form.append('orientation', orientation);
  form.append('fitMode', fitMode);
  form.append('margin', margin);

  const fake = fakeProg(10, 85, 3500);

  try {
    const res = await fetch(`${API_BASE}/api/convert`, { method:'POST', body:form });
    clearInterval(fake);
    if(!res.ok){ const d=await res.json().catch(()=>({error:'Server error'})); throw new Error(d.error); }
    setProg(90,'Finalising PDF…','Almost done!');
    const data = await res.json();
    await sleep(500);
    setProg(100,'Done!','Your PDF is ready');
    await sleep(400);
    showResult(data, pdfName);
  } catch(err) {
    clearInterval(fake);
    showError(err.message);
  }
}

function setProg(pct,label,sub){
  progressBar.style.width=pct+'%'; progressPct.textContent=pct+'%';
  progressLabel.textContent=label; progressSub.textContent=sub;
}
function fakeProg(from,to,ms){
  const step=(to-from)/(ms/100); let cur=from;
  return setInterval(()=>{
    cur=Math.min(cur+step,to); const p=Math.floor(cur);
    let l='Uploading…',s='Sending to server…';
    if(p>30){l='Processing images…';s='Applying crops & enhancements';}
    if(p>60){l='Building PDF…';s='Laying out pages';}
    setProg(p,l,s);
  },100);
}
function showResult(data, pdfName){
  progressWrap.hidden=true; resultWrap.hidden=false;
  resultMeta.innerHTML=`
    <span class="meta-chip">📄 ${data.pages} page${data.pages!==1?'s':''}</span>
    <span class="meta-chip">💾 ${data.fileSize}</span>
    <span class="meta-chip">⚙️ ${$('pageSize').value}</span>`;
  downloadBtn.href     = API_BASE + data.downloadUrl;
  downloadBtn.download = (pdfName||'converted')+'.pdf';
}
function showError(msg){
  progressWrap.hidden=true; errorWrap.hidden=false; convertWrap.hidden=false;
  errorMsg.textContent = msg||'Something went wrong.';
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// Enter key to convert
document.addEventListener('keydown', e => {
  if(e.key==='Enter' && !convertWrap.hidden && imageFiles.length) startConversion();
});

// ═════════════════════════════════════════════════════════════
// ══  FEATURE CARDS ACTIONS  ══════════════════════════════════
// ═════════════════════════════════════════════════════════════
const featureCrop = $('featureCrop');
const featureScan = $('featureScan');
const featurePdf  = $('featurePdf');

if (featureCrop) featureCrop.addEventListener('click', () => {
  if (imageFiles.length > 0) openCropModal(0); // Open first image
  else fileInput.click();
});

if (featureScan) featureScan.addEventListener('click', () => {
  if (imageFiles.length > 0) {
    imageFiles.forEach(img => img.enhance = 'bw');
    renderPreviews();
    alert('✅ "Document Scanner" effect applied to all your selected images!');
  } else {
    fileInput.click();
  }
});

if (featurePdf) featurePdf.addEventListener('click', () => {
  if (imageFiles.length > 0 && convertWrap.hidden === false) startConversion();
  else if (imageFiles.length === 0) fileInput.click();
});
