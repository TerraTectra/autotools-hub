const { test, expect } = require('@playwright/test');

const tools = [
  { path: 'index.html', name: 'Главная', selector: 'h1' },
  { path: 'compress.html', name: 'Сжатие', selector: '#img-in', action: async (page) => {} },
  { path: 'merge.html', name: 'PDF', selector: '#pdf-in', action: async (page) => {} },
  { path: 'qr.html', name: 'QR', selector: '#qr-text', action: async (page) => {
    await page.fill('#qr-text', 'test');
    await page.click('#qr-go');
    await page.waitForTimeout(500);
  }},
  { path: 'hash.html', name: 'Хэш', selector: '#hash-text', action: async (page) => {
    await page.fill('#hash-text', 'test');
    await page.click('#hash-go');
    await page.waitForTimeout(500);
  }},
  { path: 'password.html', name: 'Пароль', selector: '#pass-go', action: async (page) => {
    await page.click('#pass-go');
    await page.waitForTimeout(500);
  }},
  { path: 'color.html', name: 'Цвет', selector: '#color-picker', action: async (page) => {} },
  { path: 'palette.html', name: 'Палитры', selector: '#palette-go', action: async (page) => {
    await page.click('#palette-go');
    await page.waitForTimeout(500);
  }},
  { path: 'base64.html', name: 'Base64', selector: '#b64-input', action: async (page) => {
    await page.fill('#b64-input', 'test');
    await page.click('#b64-encode');
    await page.waitForTimeout(500);
  }},
  { path: 'convert.html', name: 'Конвертер', selector: '#conv-type', action: async (page) => {
    await page.selectOption('#conv-type', 'length');
    await page.fill('#conv-value', '1');
    await page.waitForTimeout(500);
  }},
  { path: 'lorem.html', name: 'Лорем', selector: '#lorem-go', action: async (page) => {
    await page.click('#lorem-go');
    await page.waitForTimeout(500);
  }},
  { path: 'json.html', name: 'JSON', selector: '#json-in', action: async (page) => {
    await page.fill('#json-in', '{"test":"value"}');
    await page.click('#json-go');
    await page.waitForTimeout(500);
  }},
  { path: 'datecalc.html', name: 'Даты', selector: '#date-from', action: async (page) => {
    await page.fill('#date-from', '2025-01-01');
    await page.fill('#date-to', '2025-01-02');
    await page.click('#date-go');
    await page.waitForTimeout(500);
  }},
  { path: 'bmi.html', name: 'BMI', selector: '#bmi-weight', action: async (page) => {
    await page.fill('#bmi-weight', '70');
    await page.fill('#bmi-height', '175');
    await page.click('#bmi-go');
    await page.waitForTimeout(500);
  }},
  { path: 'currency.html', name: 'Валюты', selector: '#currency-amount', action: async (page) => {
    await page.fill('#currency-amount', '100');
    await page.selectOption('#currency-from', 'USD');
    await page.selectOption('#currency-to', 'EUR');
    await page.click('#currency-go');
    await page.waitForTimeout(500);
  }},
  { path: 'qrlogo.html', name: 'QR+Лого', selector: '#qrlogo-text', action: async (page) => {} },
  { path: 'editor.html', name: 'Редактор', selector: '#editor-file', action: async (page) => {} },
  { path: 'jokes.html', name: 'Шутки', selector: '#joke-go', action: async (page) => {
    await page.click('#joke-go');
    await page.waitForTimeout(500);
  }},
  { path: 'guess.html', name: 'Игра', selector: '#guess-input', action: async (page) => {
    await page.fill('#guess-input', '50');
    await page.click('#guess-go');
    await page.waitForTimeout(500);
  }},
  { path: 'quiz.html', name: 'Викторина', selector: '#quiz-submit', action: async (page) => {
    await page.click('#quiz-submit');
    await page.waitForTimeout(500);
  }},
  { path: 'about.html', name: 'О сайте', selector: 'h2' },
  { path: 'donate.html', name: 'Донат', selector: 'h2' },
  { path: 'contact.html', name: 'Контакты', selector: 'h2' },
  { path: 'blog.html', name: 'Блог', selector: 'h2' },
];

tools.forEach(tool => {
  test(`Test ${tool.name} page`, async ({ page }) => {
    await page.goto(tool.path);
    
    // Check page title
    const title = await page.title();
    expect(title).toContain('AutoTools Hub');
    
    // Check header
    const header = await page.locator('header h1').textContent();
    expect(header).toBe('AutoTools Hub');
    
    // Check navigation
    const nav = await page.locator('nav').isVisible();
    expect(nav).toBeTruthy();
    
    // Check main content
    const main = await page.locator('main').isVisible();
    expect(main).toBeTruthy();
    
    // Check footer
    const footer = await page.locator('footer').isVisible();
    expect(footer).toBeTruthy();
    
    // Check tool-specific element
    if (tool.selector) {
      const element = await page.locator(tool.selector).isVisible();
      expect(element).toBeTruthy();
    }
    
    // Test tool functionality if action defined
    if (tool.action) {
      await tool.action(page);
    }
    
    // Check theme toggle
    const themeToggle = await page.locator('#theme-toggle').isVisible();
    expect(themeToggle).toBeTruthy();
    
    // Check metrics toggle
    const metricsToggle = await page.locator('#metrics-toggle').isVisible();
    expect(metricsToggle).toBeTruthy();
  });
});

test('Navigation links work', async ({ page }) => {
  await page.goto('index.html');
  
  const navLinks = [
    'compress.html',
    'merge.html',
    'qr.html',
    'hash.html',
    'password.html',
    'color.html',
    'palette.html',
    'base64.html',
    'convert.html',
    'lorem.html',
    'json.html',
    'datecalc.html',
    'bmi.html',
    'currency.html',
    'qrlogo.html',
    'editor.html',
    'jokes.html',
    'guess.html',
    'quiz.html',
    'blog.html',
    'about.html',
    'contact.html',
  ];
  
  for (const link of navLinks) {
    await page.goto(link);
    const title = await page.title();
    expect(title).toContain('AutoTools Hub');
  }
});
