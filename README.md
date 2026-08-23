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

- Firebase Authentication y Cloud Firestore
La autenticación y los registros se gestionan con Firebase. Firebase mantiene la sesión en el navegador, mientras que los pagos y las categorías se guardan en Cloud Firestore separados por usuario.

## Configurar Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Registra una aplicación web y copia su configuración en `firebase-config.js`.
3. En **Authentication > Sign-in method**, habilita `Correo electrónico/contraseña` y `Google`.
4. En **Firestore Database**, crea la base de datos y publica el contenido de `firestore.rules`:

```text
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /users/{userId}/{document=**} {
			allow read, write: if request.auth != null && request.auth.uid == userId;
		}
	}
}
```

5. Sirve la aplicación desde un origen permitido, por ejemplo `python -m http.server 8000`, y agrega `localhost` en **Authentication > Settings > Authorized domains** si Firebase lo solicita.

No publiques una configuración con reglas abiertas. `firebase-config.js` contiene identificadores del proyecto, no contraseñas, pero las reglas de Firestore son las que protegen los datos.

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
