// Tab switching
window.addEventListener('DOMContentLoaded', () => {
  const navButtons = document.querySelectorAll('nav button');
  const tabs = document.querySelectorAll('.tab');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
  // Image compression
  const imgInput = document.getElementById('img-in');
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

  // PDF merge
  const pdfInput = document.getElementById('pdf-in');
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

  // QR generator
  const qrText = document.getElementById('qr-text');
  const qrGo = document.getElementById('qr-go');
  const qrCanvas = document.getElementById('qr-canvas');
  qrGo.addEventListener('click', () => {
    const text = qrText.value.trim();
    if (!text) { alert('Введите текст'); return; }
    QRCode.toCanvas(qrCanvas, text, { width: 256, margin: 1 }, (err) => {
      if (err) alert('Ошибка генерации QR');
    });
  });

  // Hash calculator
  const hashText = document.getElementById('hash-text');
  const hashGo = document.getElementById('hash-go');
  const hashOut = document.getElementById('hash-out');
  hashGo.addEventListener('click', async () => {
    const text = hashText.value;
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    hashOut.textContent = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  });

  // Donation via MetaMask
  let currentAccount;
  const walletConnectBtn = document.getElementById('wallet-connect');
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
      recipientInput.value = currentAccount;
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
});
