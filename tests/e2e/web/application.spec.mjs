import { expect, test } from '@playwright/test';

const password = process.env.DEMO_USER_PASSWORD;
if (!password) throw new Error('DEMO_USER_PASSWORD is required');

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Correo').fill('ana.pm@phs.test');
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
}

test('UI-01: login accesible, error anunciado y navegación por teclado', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Correo')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Contraseña')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeFocused();

  await page.getByLabel('Correo').fill('ana.pm@phs.test');
  await page.getByLabel('Contraseña').fill('credencial-incorrecta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');

  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
});

test('UI-02: recorrido principal en escritorio y cierre de sesión', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole('button', { name: 'Portafolio' }).click();
  await expect(page.getByRole('heading', { name: 'Portafolio' })).toBeVisible();
  await expect(page.getByText('SALUD PROMEDIO')).toBeVisible();

  await page.getByRole('button', { name: 'Proyectos' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
  await page.getByRole('button', { name: /Portal de clientes/ }).click();
  await expect(page.getByRole('heading', { name: 'Portal de clientes' })).toBeVisible();
  await page.getByRole('tab', { name: 'Revisión' }).click();
  await expect(page.getByRole('tab', { name: 'Revisión' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Ciclo de revisión' })).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('UI-03: navegación a 375 px sin desbordamiento de la página', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const noOverflow = async () => expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await noOverflow();

  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await page.getByRole('button', { name: 'Portafolio' }).click();
  await expect(page.getByRole('heading', { name: 'Portafolio' })).toBeVisible();
  await noOverflow();

  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Proyectos' }).click();
  await page.getByRole('button', { name: /Portal de clientes/ }).click();
  await expect(page.getByRole('heading', { name: 'Portal de clientes' })).toBeVisible();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.getByRole('heading', { name: 'Línea de tiempo' })).toBeVisible();
  await noOverflow();
});
