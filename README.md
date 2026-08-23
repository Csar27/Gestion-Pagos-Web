# Cartera | Gestión de pagos

Aplicación web estática para registrar y consultar pagos personales en pesos colombianos de forma sencilla. Los datos se almacenan localmente en el navegador, sin necesidad de una base de datos o un backend.

## Funcionalidades

- Registrar pagos con concepto, importe, categoría y fecha.
- Consultar el gasto total y el promedio diario del mes.
- Identificar la categoría con mayor gasto.
- Visualizar la actividad mensual mediante un gráfico.
- Filtrar la información por mes.
- Crear y eliminar categorías personalizadas.
- Eliminar pagos individuales o todos los pagos.
- Cambiar entre tema claro y oscuro.
- Exportar los pagos a un archivo CSV compatible con hojas de cálculo.
- Iniciar sesión, mantener la sesión activa y cerrar sesión.

Todos los importes se muestran en pesos colombianos (COP).

## Inicio de sesión

En el primer acceso selecciona `Crear una cuenta` y registra un correo y una contraseña. Después podrás iniciar sesión y cerrar sesión desde el panel.

La cuenta y la sesión se guardan únicamente en el `localStorage` del navegador. Esta autenticación sirve para uso local en un dispositivo, pero no sustituye un sistema de usuarios con backend para una aplicación publicada.

## Tecnologías

- HTML5
- CSS3
- JavaScript vanilla
- `localStorage` para la persistencia local
- Nginx Alpine para servir la aplicación en Docker

## Ejecución local

Abre `index.html` directamente en un navegador, o sirve la carpeta con cualquier servidor web estático.

Por ejemplo, con Python:

```bash
python -m http.server 8000
```

Después visita [http://localhost:8000](http://localhost:8000).

## Ejecución con Docker

Como el `Dockerfile` copia la carpeta completa `Gestión Pagos/`, ejecuta el comando desde la carpeta padre:

```bash
docker build -f "Gestión Pagos/Dockerfile" -t cartera-pagos .
docker run --rm -p 8080:80 cartera-pagos
```

Después visita [http://localhost:8080](http://localhost:8080).

## Almacenamiento de datos

Los pagos, las categorías y la preferencia de tema se guardan en el `localStorage` del navegador. Por ello:

- Los datos solo están disponibles en el navegador y dispositivo donde se registraron.
- Borrar los datos del sitio puede eliminar la información almacenada.
- La exportación CSV permite conservar una copia de los pagos.

## Estructura

```text
.
├── Dockerfile
├── index.html
├── script.js
├── style.css
└── README.md
```
