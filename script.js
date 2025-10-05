// Script to handle theme toggling, navigation highlighting and tool functionality

window.addEventListener('DOMContentLoaded', () => {
  // Theme toggle setup
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const applyTheme = (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      themeToggle.textContent = theme === 'dark' ? '☀' : '🌙';
    };
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('theme', next);
    });
  }

  // Highlight current nav link
  const navLinks = document.querySelectorAll('nav a');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    // Determine current page name (default to index.html for root).
    // Strip query parameters to ensure matching links like about.html?v=1
    const fullPath = window.location.pathname.split('/').pop() || 'index.html';
    const page = fullPath.split('?')[0];
    if (href === page) {
      link.classList.add('active');
    }
  });

  // Image compression functionality
  const imgInput = document.getElementById('img-in');
  if (imgInput) {
    const imgQuality = document.getElementById('img-q');
    const imgGo = document.getElementById('img-go');
    const imgCanvas = document.getElementById('img-cv');
    const imgDownload = document.getElementById('img-dl');
    imgGo.addEventListener('click', () => {
      const file = imgInput.files[0];
      if (!file) { alert('Выберите изображение'); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          imgCanvas.width = img.width;
          imgCanvas.height = img.height;
          const ctx = imgCanvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          imgCanvas.classList.remove('hidden');
          imgCanvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            imgDownload.href = url;
            imgDownload.classList.remove('hidden');
          }, 'image/webp', parseFloat(imgQuality.value));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // PDF merge functionality
  const pdfInput = document.getElementById('pdf-in');
  if (pdfInput) {
    const pdfGo = document.getElementById('pdf-go');
    const pdfDownload = document.getElementById('pdf-dl');
    pdfGo.addEventListener('click', async () => {
      const files = pdfInput.files;
      if (!files.length) { alert('Выберите PDF'); return; }
      const mergedPdf = await PDFLib.PDFDocument.create();
      for (let file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => mergedPdf.addPage(p));
      }
      const buf = await mergedPdf.save();
      const blob = new Blob([buf], { type: 'application/pdf' });
      pdfDownload.href = URL.createObjectURL(blob);
      pdfDownload.classList.remove('hidden');
    });
  }

  // QR generator functionality
  const qrText = document.getElementById('qr-text');
  if (qrText) {
    const qrGo = document.getElementById('qr-go');
    const qrCanvas = document.getElementById('qr-canvas');
    qrGo.addEventListener('click', () => {
      const text = qrText.value.trim();
      if (!text) { alert('Введите текст'); return; }
      QRCode.toCanvas(qrCanvas, text, { width: 256, margin: 1 }, (err) => {
        if (err) alert('Ошибка генерации QR');
      });
    });
  }

  // Password generator functionality
  const passBtn = document.getElementById('pass-go');
  if (passBtn) {
    const passLen = document.getElementById('pass-length');
    const passUpper = document.getElementById('pass-upper');
    const passNumber = document.getElementById('pass-number');
    const passSymbol = document.getElementById('pass-symbol');
    const passOut = document.getElementById('pass-out');
    passBtn.addEventListener('click', () => {
      const length = parseInt(passLen.value) || 8;
      let chars = 'abcdefghijklmnopqrstuvwxyz';
      if (passUpper && passUpper.checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (passNumber && passNumber.checked) chars += '0123456789';
      if (passSymbol && passSymbol.checked) chars += '!@#$%^&*()_+-=[]{},.<>?/';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      passOut.value = result;
    });

    // Копирование пароля в буфер обмена
    const passCopy = document.getElementById('pass-copy');
    if (passCopy) {
      passCopy.addEventListener('click', () => {
        if (!passOut.value) { return; }
        navigator.clipboard.writeText(passOut.value).then(() => {
          const original = passCopy.textContent;
          passCopy.textContent = 'Скопировано';
          setTimeout(() => { passCopy.textContent = original; }, 2000);
        });
      });
    }
  }

  // Color converter functionality
  const colorPicker = document.getElementById('color-picker');
  if (colorPicker) {
    const colorHex = document.getElementById('color-hex');
    const colorRgb = document.getElementById('color-rgb');
    const updateColor = () => {
      const hex = colorPicker.value;
      colorHex.textContent = hex;
      const bigint = parseInt(hex.substring(1), 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      colorRgb.textContent = `rgb(${r}, ${g}, ${b})`;
    };
    updateColor();
    colorPicker.addEventListener('input', updateColor);
  }

  // Random quote functionality
  const quoteBtn = document.getElementById('quote-go');
  if (quoteBtn) {
    const quoteOut = document.getElementById('quote-out');
    // Список вдохновляющих цитат. Можно расширить при необходимости.
    const quotes = [
      'Не бойтесь совершенства — вам его не достичь. (Сальвадор Дали)',
      'Самое трудное — решить действовать. Остальное — только упорство. (Амелия Эрхарт)',
      'Успех — это способность идти от поражения к поражению, не теряя энтузиазма. (Уинстон Черчилль)',
      'Мы становимся тем, о чём думаем. (Наполеон Хилл)',
      'Секрет продвижения вперёд заключается в том, чтобы начать. (Марка Твен)',
      'Лучший способ предсказать будущее — создать его самому. (Питер Друкер)' ,
      'Дорога возникает под шагами идущего. (Франц Кафка)'
    ];
    quoteBtn.addEventListener('click', () => {
      const idx = Math.floor(Math.random() * quotes.length);
      quoteOut.textContent = quotes[idx];
    });
  }

  // Hash calculator functionality
  const hashText = document.getElementById('hash-text');
  if (hashText) {
    const hashGo = document.getElementById('hash-go');
    const hashOut = document.getElementById('hash-out');
    hashGo.addEventListener('click', async () => {
      const text = hashText.value;
      const enc = new TextEncoder();
      const data = enc.encode(text);
      const digest = await crypto.subtle.digest('SHA-256', data);
      hashOut.textContent = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    });
  }

  // Donation functionality via MetaMask
  const walletConnectBtn = document.getElementById('wallet-connect');
  if (walletConnectBtn) {
    let currentAccount;
    const walletArea = document.getElementById('wallet-area');
    const fromAddrSpan = document.getElementById('from-addr');
    const recipientInput = document.getElementById('recipient');
    const donateAmount = document.getElementById('donate-amount');
    const sendDonateBtn = document.getElementById('send-donate');
    const txStatus = document.getElementById('tx-status');
    walletConnectBtn.addEventListener('click', async () => {
      if (!window.ethereum) { alert('MetaMask не найден'); return; }
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        currentAccount = accounts[0];
        walletArea.classList.remove('hidden');
        fromAddrSpan.textContent = currentAccount;
        if (recipientInput) {
          recipientInput.value = currentAccount;
        }
      } catch (err) {
        alert('Ошибка подключения: ' + err.message);
      }
    });
    sendDonateBtn.addEventListener('click', async () => {
      if (!currentAccount) { alert('Сначала подключите кошелек'); return; }
      const recipient = recipientInput.value || currentAccount;
      const amount = donateAmount.value;
      if (!amount) { alert('Введите сумму'); return; }
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      try {
        txStatus.textContent = 'Отправка...';
        const tx = await signer.sendTransaction({
          to: recipient,
          value: ethers.utils.parseEther(amount)
        });
        txStatus.textContent = 'Транзакция отправлена: ' + tx.hash;
      } catch (err) {
        txStatus.textContent = 'Ошибка: ' + err.message;
      }
    });
  }

  // Base64 converter functionality
  const b64Input = document.getElementById('b64-input');
  if (b64Input) {
    const b64Encode = document.getElementById('b64-encode');
    const b64Decode = document.getElementById('b64-decode');
    const b64Out = document.getElementById('b64-out');
    b64Encode.addEventListener('click', () => {
      try {
        b64Out.value = btoa(b64Input.value);
      } catch (err) {
        alert('Невозможно закодировать: ' + err.message);
      }
    });
    b64Decode.addEventListener('click', () => {
      try {
        b64Out.value = atob(b64Input.value);
      } catch (err) {
        alert('Невозможно декодировать: ' + err.message);
      }
    });
  }

  // Unit converter functionality
  const convType = document.getElementById('conv-type');
  if (convType) {
    const convValue = document.getElementById('conv-value');
    const convFrom = document.getElementById('conv-from');
    const convTo = document.getElementById('conv-to');
    const convOut = document.getElementById('conv-out');
    const convGo = document.getElementById('conv-go');
    const lengthUnits = ['m','km','mi'];
    const weightUnits = ['kg','lb','g'];
    const tempUnits = ['C','F','K'];
    const updateOptions = () => {
      let units;
      if (convType.value === 'length') units = lengthUnits;
      else if (convType.value === 'weight') units = weightUnits;
      else units = tempUnits;
      convFrom.innerHTML = '';
      convTo.innerHTML = '';
      units.forEach(u => {
        const o1 = document.createElement('option');
        o1.value = u;
        o1.textContent = u;
        convFrom.appendChild(o1);
        const o2 = document.createElement('option');
        o2.value = u;
        o2.textContent = u;
        convTo.appendChild(o2);
      });
    };
    updateOptions();
    convType.addEventListener('change', updateOptions);
    const convertVal = (val, from, to) => {
      let v = val;
      if (convType.value === 'length') {
        // to metres
        if (from === 'km') v *= 1000;
        else if (from === 'mi') v *= 1609.34;
        // convert to target
        if (to === 'km') v /= 1000;
        else if (to === 'mi') v /= 1609.34;
      } else if (convType.value === 'weight') {
        // to kg
        if (from === 'g') v /= 1000;
        else if (from === 'lb') v *= 0.453592;
        // convert to target
        if (to === 'g') v *= 1000;
        else if (to === 'lb') v /= 0.453592;
      } else {
        // temp: convert to Celsius
        if (from === 'F') v = (v - 32) * 5/9;
        else if (from === 'K') v = v - 273.15;
        // convert from Celsius to target
        if (to === 'F') v = v * 9/5 + 32;
        else if (to === 'K') v = v + 273.15;
      }
      return v;
    };
    convGo.addEventListener('click', () => {
      const val = parseFloat(convValue.value);
      if (isNaN(val)) { alert('Введите корректное число'); return; }
      const from = convFrom.value;
      const to = convTo.value;
      const res = convertVal(val, from, to);
      convOut.textContent = res.toFixed(4);
    });
  }

  // Color palette generator
  const paletteGo = document.getElementById('palette-go');
  if (paletteGo) {
    const paletteContainer = document.getElementById('palette-container');
    paletteGo.addEventListener('click', () => {
      paletteContainer.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6,'0');
        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch';
        swatch.style.backgroundColor = color;
        swatch.textContent = color;
        swatch.title = 'Нажмите, чтобы скопировать';
        swatch.addEventListener('click', () => {
          navigator.clipboard.writeText(color);
          const orig = swatch.textContent;
          swatch.textContent = 'Скопировано';
          setTimeout(() => { swatch.textContent = orig; }, 1500);
        });
        paletteContainer.appendChild(swatch);
      }
    });
  }

  // Date difference calculator
  const dateFrom = document.getElementById('date-from');
  if (dateFrom) {
    const dateTo = document.getElementById('date-to');
    const dateGo = document.getElementById('date-go');
    const dateOut = document.getElementById('date-out');
    dateGo.addEventListener('click', () => {
      if (!dateFrom.value || !dateTo.value) {
        alert('Выберите обе даты');
        return;
      }
      const fromDate = new Date(dateFrom.value);
      const toDate = new Date(dateTo.value);
      const diffMs = Math.abs(toDate - fromDate);
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      dateOut.textContent = `Разница: ${diffDays} дней`;
    });
  }

  // Lorem Ipsum generator functionality
  const loremBtn = document.getElementById('lorem-go');
  if (loremBtn) {
    const loremCount = document.getElementById('lorem-count');
    const loremOut = document.getElementById('lorem-out');
    // Базовый текст-рыба для генерации Lorem Ipsum. Можно расширить по желанию.
    const loremSample =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla facilisi. Vivamus eget mauris eu justo tincidunt tempor. Cras dictum, nibh sed semper feugiat, quam mi egestas mauris, nec convallis tortor felis quis arcu.';
    loremBtn.addEventListener('click', () => {
      const count = parseInt(loremCount.value) || 1;
      let paragraphs = [];
      for (let i = 0; i < count; i++) {
        paragraphs.push(loremSample);
      }
      loremOut.value = paragraphs.join('\n\n');
    });
  }

  // JSON formatter functionality
  const jsonIn = document.getElementById('json-in');
  if (jsonIn) {
    const jsonGo = document.getElementById('json-go');
    const jsonOut = document.getElementById('json-out');
    jsonGo.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(jsonIn.value);
        jsonOut.value = JSON.stringify(parsed, null, 2);
      } catch (err) {
        alert('Ошибка разбора JSON: ' + err.message);
      }
    });
  }

      // BMI calculator functionality
      const bmiWeight = document.getElementById('bmi-weight');
      if (bmiWeight) {
        const bmiHeight = document.getElementById('bmi-height');
        const bmiGo = document.getElementById('bmi-go');
        const bmiOut = document.getElementById('bmi-out');
        bmiGo.addEventListener('click', () => {
          const weight = parseFloat(bmiWeight.value);
          const height = parseFloat(bmiHeight.value);
          if (!weight || !height) {
            alert('Введите массу и рост');
            return;
          }
          const hM = height / 100;
          const bmi = weight / (hM * hM);
          let category = '';
          if (bmi < 18.5) category = 'Недостаточный вес';
          else if (bmi < 25) category = 'Норма';
          else if (bmi < 30) category = 'Избыточный вес';
          else category = 'Ожирение';
          bmiOut.textContent = `BMI: ${bmi.toFixed(2)} (${category})`;
        });
      }
});