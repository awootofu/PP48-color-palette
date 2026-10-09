/* ==========================================================================
   Color Palette Identifier — PP48
   Palette extraction: lokesh/color-thief (MIT), loaded from vendor/.
   Everything runs client-side; the image is never uploaded anywhere.
   ========================================================================== */
'use strict';

(function () {

  /* ------------------------------------------------------------------ config */

  var SAMPLES = [
    { src: 'images/samples/gradient-mesh.png', label: 'Gradient mesh' },
    { src: 'images/samples/sunset.png',        label: 'Sunset' },
    { src: 'images/samples/forest.png',        label: 'Forest' },
    { src: 'images/samples/color-blocks.png',  label: 'Color blocks' }
  ];

  /* -------------------------------------------------------------------- dom */

  var el = {
    dropzone:    document.getElementById('dropzone'),
    fileInput:   document.getElementById('file-input'),
    urlInput:    document.getElementById('url-input'),
    urlBtn:      document.getElementById('url-btn'),
    samples:     document.getElementById('samples'),
    stage:       document.getElementById('stage'),
    preview:     document.getElementById('preview'),
    meta:        document.getElementById('meta'),
    count:       document.getElementById('count'),
    countOut:    document.getElementById('count-out'),
    quality:     document.getElementById('quality'),
    status:      document.getElementById('status'),
    dominantWrap:document.getElementById('dominant-wrap'),
    dominant:    document.getElementById('dominant'),
    dominantChip:document.getElementById('dominant-chip'),
    dominantHex: document.getElementById('dominant-hex'),
    dominantRgb: document.getElementById('dominant-rgb'),
    palette:     document.getElementById('palette'),
    hexlistWrap: document.getElementById('hexlist-wrap'),
    hexlist:     document.getElementById('hexlist'),
    downloadBtn: document.getElementById('download-btn'),
    toast:       document.getElementById('toast')
  };

  if (typeof ColorThief !== 'function') {
    el.status.className = 'status is-error';
    el.status.textContent =
      'Color Thief failed to load. Check that vendor/color-thief.min.js is present.';
    return;
  }

  var thief = new ColorThief();

  // Opening index.html straight off the disk (file://) gives the page an opaque
  // origin, so canvas.getImageData() throws. Detect it and say so plainly.
  var LOCAL_FILE = location.protocol === 'file:';

  var state = {
    img: null,          // HTMLImageElement currently loaded
    name: '',           // display name / source
    objectUrl: null,    // blob url to revoke
    palette: [],        // [[r,g,b], ...]
    dominant: null,     // [r,g,b]
    tainted: false      // image without CORS headers -> pixels unreadable
  };

  /* -------------------------------------------------------------- color math */

  function toHex(n) { return n.toString(16).padStart(2, '0').toUpperCase(); }

  function rgbToHex(c) { return '#' + toHex(c[0]) + toHex(c[1]) + toHex(c[2]); }

  function rgbToCss(c) { return 'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')'; }

  /* Relative luminance (WCAG) -> pick readable text over a color. */
  function luminance(c) {
    var s = c.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }

  function textOn(c) { return luminance(c) > 0.45 ? '#0b0f15' : '#ffffff'; }

  /* ---------------------------------------------------------------- helpers */

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, 1800);
  }

  function setStatus(msg, kind) {
    el.status.className = 'status' + (kind ? ' is-' + kind : '');
    el.status.textContent = msg || '';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for non-secure contexts (e.g. plain http).
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  /* ------------------------------------------------------------ image loading */

  function releaseObjectUrl() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
  }

  function loadFromFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setStatus('"' + file.name + '" is not an image file.', 'error');
      return;
    }
    releaseObjectUrl();
    var url = URL.createObjectURL(file);
    loadImage(url, file.name || 'pasted image', true);
  }

  function loadFromUrl(url, label, opts) {
    opts = opts || {};
    if (!url) return;

    var absolute = /^(https?:|data:|blob:)/i.test(url);
    // Relative paths (bundled samples) are fine; anything else typed by hand
    // must be a real URL so the failure message is useful.
    if (!absolute && (opts.allowRelative !== true || /\s/.test(url))) {
      setStatus('Enter a full image URL starting with http:// or https://', 'error');
      return;
    }
    loadImage(url, label || url, opts.cors !== false, opts.keepUrl === true);
  }

  function loadImage(src, name, useCors, keepSrc) {
    setStatus('Loading image…', 'busy');

    var img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';

    img.onload = function () {
      state.img = img;
      state.name = name;
      state.tainted = false;
      showPreview(img, name);
      extract();
    };

    img.onerror = function () {
      // Retry once without CORS so at least the preview shows, then explain.
      if (useCors) {
        var retry = new Image();
        retry.onload = function () {
          state.img = retry;
          state.name = name;
          state.tainted = true;
          showPreview(retry, name);
          extract();
        };
        retry.onerror = function () {
          setStatus('Could not load that image. Check the URL or try another source.', 'error');
        };
        retry.src = src;
        return;
      }
      setStatus('Could not load that image. Check the URL or try another source.', 'error');
    };

    img.src = src;

    if (keepSrc) releaseObjectUrl();
  }

  function showPreview(img, name) {
    el.preview.src = img.src;
    el.preview.alt = 'Preview of ' + name;
    el.stage.classList.add('has-image');
    el.meta.textContent = name + '  ·  ' + img.naturalWidth + ' × ' + img.naturalHeight + ' px';
    el.downloadBtn.disabled = false;
  }

  /* --------------------------------------------------------------- extraction */

  function getCount()   { return parseInt(el.count.value, 10) || 8; }
  function getQuality() { return parseInt(el.quality.value, 10) || 10; }

  function extract() {
    if (!state.img) {
      setStatus('Load an image first.', 'error');
      return;
    }

    var count = getCount();
    var quality = getQuality();

    setStatus('Analysing colors…', 'busy');

    // Let the browser paint the busy state before the synchronous work.
    setTimeout(function () {
      try {
        state.palette = thief.getPalette(state.img, count, quality) || [];
      } catch (err) {
        state.palette = [];
        state.dominant = null;
        render();
        if (state.tainted || LOCAL_FILE) {
          setStatus(
            LOCAL_FILE
              ? 'This page is open as a local file (file://), so the browser blocks canvas pixel reads. ' +
                'Open it over http:// — run `python -m http.server` in this folder, or use the deployed GitHub Pages site.'
              : 'This image\'s pixels can\'t be read — its server does not send CORS headers. ' +
                'Save the image to your device and load it from a file instead.',
            'error'
          );
        } else {
          setStatus('Could not read pixels from this image: ' + (err && err.message ? err.message : err), 'error');
        }
        return;
      }

      state.dominant = state.palette[0] || null;
      render();
      setStatus('Palette extracted automatically from ' + state.name + '.', 'ok');
    }, 16);
  }

  /* ----------------------------------------------------------------- render */

  function render() {
    renderDominant();
    renderPalette();
    renderHexList();
  }

  function renderDominant() {
    var d = state.dominant;
    if (!d) { el.dominantWrap.hidden = true; return; }

    var hex = rgbToHex(d);
    el.dominantWrap.hidden = false;
    el.dominantChip.style.background = hex;
    el.dominantChip.style.color = textOn(d);
    el.dominantHex.textContent = hex;
    el.dominantRgb.textContent = rgbToCss(d);
  }

  function renderPalette() {
    el.palette.innerHTML = '';

    state.palette.forEach(function (c, i) {
      var hex = rgbToHex(c);
      var ink = textOn(c);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.dataset.hex = hex;
      btn.title = 'Copy ' + hex;
      btn.setAttribute('aria-label', 'Copy hex code ' + hex);

      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = hex;
      chip.style.color = ink;
      chip.innerHTML = '<span>' + (i === 0 ? 'DOMINANT' : '#' + (i + 1)) + '</span>' +
                       '<span class="copy-hint">COPY</span>';

      var body = document.createElement('span');
      body.className = 'body';
      body.innerHTML =
        '<span class="sw-hex" style="display:block">' + hex + '</span>' +
        '<span class="sw-rgb" style="display:block">' + rgbToCss(c) + '</span>' +
        '<span class="sw-tag">' + (ink === '#0b0f15' ? 'light' : 'dark') + '</span>';

      btn.appendChild(chip);
      btn.appendChild(body);
      el.palette.appendChild(btn);
    });
  }

  function renderHexList() {
    if (!state.palette.length) {
      el.hexlistWrap.hidden = true;
      el.hexlist.textContent = '';
      return;
    }
    el.hexlistWrap.hidden = false;
    el.hexlist.textContent = state.palette.map(function (c) {
      return rgbToHex(c) + '   ' + rgbToCss(c);
    }).join('\n');
  }

  /* ---------------------------------------------------------------- events */

  // --- file picker / dropzone
  el.dropzone.addEventListener('click', function () { el.fileInput.click(); });

  el.dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.fileInput.click();
    }
  });

  el.fileInput.addEventListener('change', function () {
    loadFromFile(el.fileInput.files && el.fileInput.files[0]);
    el.fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (type) {
    el.dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      el.dropzone.classList.add('is-over');
    });
  });

  ['dragleave', 'drop'].forEach(function (type) {
    el.dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      el.dropzone.classList.remove('is-over');
    });
  });

  el.dropzone.addEventListener('drop', function (e) {
    var dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files && dt.files.length) { loadFromFile(dt.files[0]); return; }
    var url = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (url) {
      el.urlInput.value = url.trim();
      loadFromUrl(url.trim());
    }
  });

  // --- paste anywhere
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        loadFromFile(items[i].getAsFile());
        return;
      }
    }
    var text = e.clipboardData && e.clipboardData.getData('text');
    if (text && /^https?:\/\//i.test(text.trim())) {
      el.urlInput.value = text.trim();
      loadFromUrl(text.trim());
    }
  });

  // --- url
  el.urlBtn.addEventListener('click', function () {
    loadFromUrl(el.urlInput.value.trim());
  });

  el.urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadFromUrl(el.urlInput.value.trim());
    }
  });

  // --- samples
  SAMPLES.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sample';
    b.innerHTML = '<img src="' + s.src + '" alt="">' +
                  '<span>' + s.label + '</span>';
    b.addEventListener('click', function () {
      el.urlInput.value = s.src;
      loadFromUrl(s.src, s.src, { keepUrl: true, allowRelative: true, cors: false });
    });
    el.samples.appendChild(b);
  });

  // --- options
  el.count.addEventListener('input', function () {
    el.countOut.textContent = el.count.value;
  });

  el.count.addEventListener('change', function () {
    if (state.img) extract();
  });

  el.quality.addEventListener('change', function () {
    if (state.img) extract();
  });

  // --- copy from dominant + swatches (delegated)
  function copyFromTarget(target) {
    var hex = null;
    if (target.closest) {
      var hit = target.closest('[data-hex]');
      if (hit) hex = hit.dataset.hex;
    }
    if (!hex && state.dominant) hex = rgbToHex(state.dominant);
    if (!hex) return;

    copyText(hex).then(function () {
      toast('Copied ' + hex);
    }, function () {
      toast('Copy failed — ' + hex);
    });
  }

  el.palette.addEventListener('click', function (e) {
    copyFromTarget(e.target);
  });

  el.dominant.addEventListener('click', function () {
    if (!state.dominant) return;
    var hex = rgbToHex(state.dominant);
    copyText(hex).then(function () { toast('Copied ' + hex); },
                       function () { toast('Copy failed — ' + hex); });
  });

  // --- download palette as PNG
  el.downloadBtn.addEventListener('click', function () {
    if (!state.palette.length) return;

    var n = state.palette.length;
    var W = Math.max(600, Math.min(1600, n * 170));
    var bandH = 260;
    var labelH = 90;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = bandH + labelH;

    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, cv.width, cv.height);

    var bandW = W / n;
    state.palette.forEach(function (c, i) {
      var hex = rgbToHex(c);
      ctx.fillStyle = hex;
      ctx.fillRect(i * bandW, 0, bandW, bandH);
      ctx.fillStyle = textOn(c);
      ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(hex, i * bandW + bandW / 2, bandH - 18);
    });

    ctx.fillStyle = '#9aa7b8';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Palette of ' + n + ' colors · extracted with Color Thief',
      W / 2, bandH + 40
    );
    ctx.fillStyle = '#e8edf4';
    ctx.fillText(state.name.length > 70 ? state.name.slice(0, 67) + '…' : state.name,
                 W / 2, bandH + 64);

    cv.toBlob(function (blob) {
      if (!blob) { toast('Could not export image'); return; }
      var a = document.createElement('a');
      var base = (state.name.split(/[\\/]/).pop() || 'image').replace(/\.[^.]+$/, '');
      a.href = URL.createObjectURL(blob);
      a.download = base + '-palette.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('Palette downloaded');
    }, 'image/png');
  });

  /* ------------------------------------------------------------------ start */

  el.countOut.textContent = el.count.value;
  setStatus('');

})();