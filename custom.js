/*
 * Custom enhancements for AutoTools Hub.
 *
 * This script supplements the main script.js by:
 * 1. Defining a global `page` variable when it is undefined to prevent
 *    ReferenceError in the existing script.js. The main script assumes
 *    `page` is globally available when highlighting navigation and
 *    incrementing page view metrics.
 * 2. Implementing three additional tools requested by users:
 *    - Офлайн‑конвертер валют (currency converter)
 *    - Генератор QR‑кодов с логотипом (QR with logo)
 *    - Мини‑редактор изображений (image editor)
 * 3. Counting usage of these tools via the global incrementMetric function
 *    defined in script.js.
 */

(() => {
  // Ensure the `page` variable exists globally before script.js executes.
  try {
    if (typeof window.page === 'undefined') {
      const fullPath = window.location.pathname.split('/').pop() || 'index.html';
      window.page = fullPath.split('?')[0];
    }
  } catch (e) {
    const fullPath = window.location.pathname.split('/').pop() || 'index.html';
    window.page = fullPath.split('?')[0];
  }

  document.addEventListener('DOMContentLoaded', () => {
    // ------------------- Global fixes before tools --------------------
    // Ensure the latest stylesheet is loaded by appending a version query. This
    // bypasses the service worker cache which may otherwise serve an old file.
    const styleLink = document.querySelector('link[rel="stylesheet"][href*="styles.css"]');
    if (styleLink && !styleLink.href.includes('?v=')) {
      styleLink.href = styleLink.getAttribute('href') + '?v=2';
    }

    // Fix the theme toggle icon. The main script only toggles the data-theme
    // attribute and sometimes clears the button text, making the icon disappear.
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      const updateIcon = () => {
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        // Show a sun icon when dark mode is active (to indicate switching back)
        // and a moon icon when light mode is active.
        themeToggle.textContent = theme === 'dark' ? '☀' : '🌙';
      };
      // Set the icon on initial load
      updateIcon();
      // Update the icon after the main script toggles the theme
      themeToggle.addEventListener('click', () => {
        setTimeout(updateIcon, 0);
      });
    }

    // Increment the page view metric manually because the existing script
    // references an undefined `page` variable. Determine the current page name
    // (without extension) and call incrementMetric.
    try {
      const current = window.location.pathname.split('/').pop() || 'index.html';
      const base = current.split('?')[0];
      const name = base.replace('.html', '') || 'index';
      if (typeof window.incrementMetric === 'function') {
        window.incrementMetric(name + 'Views');
      }
    } catch (e) {
      // Ignore errors silently
    }
    /* ------------------- Metrics toggle and unlocking -------------------- */
    // Handle the floating metrics button, password overlay and metrics link
    {
      const toggle = document.getElementById('metrics-toggle');
      const navLink = document.getElementById('metrics-link');
      const overlay = document.getElementById('metrics-overlay');
      const pwdInput = document.getElementById('metrics-password');
      const submitBtn = document.getElementById('metrics-submit');
      const errorMsg = document.getElementById('metrics-error');
      if (toggle) {
        // If metrics were already unlocked in this browser, reveal the link
        if (localStorage.getItem('metricsUnlocked') === 'true' && navLink) {
          navLink.classList.remove('hidden');
        }
        toggle.addEventListener('click', () => {
          const unlocked = localStorage.getItem('metricsUnlocked') === 'true';
          if (!unlocked) {
            // Show overlay for password input
            if (overlay) {
              overlay.classList.remove('hidden');
              if (pwdInput) pwdInput.value = '';
              if (errorMsg) errorMsg.classList.add('hidden');
            }
          } else {
            // Toggle visibility of the metrics link
            if (navLink) navLink.classList.toggle('hidden');
          }
        });
        if (submitBtn) {
          submitBtn.addEventListener('click', () => {
            if (pwdInput && pwdInput.value === '272829Dr') {
              localStorage.setItem('metricsUnlocked', 'true');
              if (overlay) overlay.classList.add('hidden');
              if (navLink) navLink.classList.remove('hidden');
            } else {
              if (errorMsg) errorMsg.classList.remove('hidden');
            }
          });
        }
        if (overlay) {
          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
              overlay.classList.add('hidden');
            }
          });
        }
      }
    }
    /* ------------------- Currency converter -------------------- */
    const curGo = document.getElementById('currency-go');
    if (curGo) {
      // Exchange rates relative to USD. Update these values manually to
      // reflect current rates. Rates are approximate and serve offline use.
      const rates = {
        USD: 1,
        EUR: 0.94,
        RUB: 100,
        GBP: 0.82
      };
      curGo.addEventListener('click', () => {
        const amountInput = document.getElementById('currency-amount');
        const fromSel = document.getElementById('currency-from');
        const toSel = document.getElementById('currency-to');
        const resultEl = document.getElementById('currency-result');
        const amount = parseFloat(amountInput && amountInput.value) || 0;
        const from = fromSel && fromSel.value;
        const to = toSel && toSel.value;
        if (!amount) {
          alert('Введите сумму');
          return;
        }
        // Convert via USD base
        const usdAmount = amount / (rates[from] || 1);
        const converted = usdAmount * (rates[to] || 1);
        if (resultEl) {
          resultEl.textContent = `${amount.toFixed(2)} ${from} = ${converted.toFixed(2)} ${to}`;
        }
        if (typeof window.incrementMetric === 'function') {
          window.incrementMetric('currencyConvertUses');
        }
      });
    }

    /* ------------------- QR with logo generator -------------------- */
    const qrLogoBtn = document.getElementById('qrlogo-go');
    // We check for existence of the QRCodeStyling class after the library loads.
    if (qrLogoBtn) {
      let qr;
      qrLogoBtn.addEventListener('click', () => {
        const textInput = document.getElementById('qrlogo-text');
        const fileInput = document.getElementById('qrlogo-logo');
        const wrapper = document.getElementById('qrlogo-result');
        const downloadLink = document.getElementById('qrlogo-download');
        const data = textInput ? textInput.value.trim() : '';
        if (!data) {
          alert('Введите текст');
          return;
        }
        // Build options for QR code
        const options = {
          width: 300,
          height: 300,
          type: 'png',
          data,
          image: undefined,
          dotsOptions: { color: '#000' },
          cornersSquareOptions: { color: '#000' },
          cornersDotOptions: { color: '#000' }
        };
        if (fileInput && fileInput.files && fileInput.files[0]) {
          options.image = URL.createObjectURL(fileInput.files[0]);
        }
        // If a previous QR instance exists, remove its canvas
        if (wrapper) {
          wrapper.innerHTML = '';
        }
        if (typeof QRCodeStyling === 'function') {
          qr = new QRCodeStyling(options);
          qr.append(wrapper);
          // Generate downloadable data URL
          if (downloadLink) {
            qr.getRawData('png').then((dataUrl) => {
              downloadLink.href = dataUrl;
              downloadLink.classList.remove('hidden');
            });
          }
          if (typeof window.incrementMetric === 'function') {
            window.incrementMetric('qrLogoUses');
          }
        } else {
          alert('Библиотека QR не загружена');
        }
      });
    }

    /* ------------------- Image editor -------------------- */
    const fileInput = document.getElementById('editor-file');
    const downloadButton = document.getElementById('editor-download');
    const editorContainer = document.getElementById('editor-container');
    if (fileInput && editorContainer) {
      let editor;
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) {
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (!editor) {
            editor = new tui.ImageEditor(editorContainer, {
              includeUI: {
                loadImage: { path: reader.result, name: file.name },
                theme: {},
                menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'filter'],
                initMenu: 'filter',
                uiSize: { width: '100%', height: '500px' },
                menuBarPosition: 'bottom'
              },
              cssMaxWidth: 700,
              cssMaxHeight: 500,
              selectionStyle: { cornerSize: 10, rotatingPointOffset: 70 }
            });
          } else {
            editor.loadImageFromURL(reader.result, file.name);
          }
          if (downloadButton) {
            downloadButton.classList.remove('hidden');
          }
          if (typeof window.incrementMetric === 'function') {
            window.incrementMetric('imageEditUses');
          }
        };
        reader.readAsDataURL(file);
      });
      if (downloadButton) {
        downloadButton.addEventListener('click', () => {
          if (!editor) return;
          // Use built-in method to export data URL
          const dataURL = editor.toDataURL();
          downloadButton.href = dataURL;
          downloadButton.download = 'edited.png';
        });
      }
    }
  });
})();
