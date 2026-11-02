# Contribuir a Cartera

Gracias por tu interés. Esta guía explica cómo configurar el entorno y enviar cambios.

## Requisitos
- Python 3 (para servir localmente) o cualquier servidor estático.
- Node.js (solo para `node --check`).
- Docker (opcional, para probar la imagen).

## Desarrollo local
```bash
python -m http.server 8000
# abrir http://localhost:8000
```

Verificación rápida de sintaxis:
```bash
node --check assets/js/script.js
```

Auditoría responsive:
```bash
python -m http.server 8000
# abrir http://localhost:8000/responsive-test.html
```

## Convenciones
- Todo el texto visible al usuario en **español**.
- Moneda en **COP** (pesos colombianos).
- Estados de pago: `pagado`, `no_pagado`, `pendiente`.
- Sin build step: no ES modules, imports, JSX/TS ni dependencias npm-only.
- Mobile-first: CSS base para 320px, escalas con `@media (min-width:...)`. Sin `max-width`.
- Bump del `?v=` en `index.html` (3 lugares) en cada envío.
- Verificar ambos temas (claro/oscuro) y anchos 320/375/414/600/768/1024/1440/1920.

## Pull requests
1. Crea una rama desde `main`.
2. Haz cambios pequeños y enfocados.
3. Ejecuta `node --check assets/js/script.js`.
4. Prueba en navegador (ambos temas y varios anchos).
5. Actualiza `AGENTS.md` si cambias arquitectura o convenciones.
6. Abre el PR describiendo el cambio y cómo probarlo.

## Reportar bugs
Incluye: navegador/versión, pasos para reproducir, captura si es visual, y si aplica, los datos de `localStorage` (sin información sensible).
