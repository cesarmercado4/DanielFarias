# Galerías de fotos · Daniel Farías

Sitio con tres partes:

- **Página oficial** (`/`): presentación de Daniel, contacto y un botón **Ingresar**.
- **Galerías de clientes** (`/cumpledecesarmercado`): leen las fotos de una carpeta de Google Drive y las muestran en una galería con visor, descarga y, si se activa, favoritas.
- **Panel de administración** (`/admin`): solo para Daniel. Crea y edita galerías pegando el link de la carpeta de Drive; el sistema extrae el ID, verifica que se pueda abrir y arma la dirección.

Todo corre en un único servidor Node con una base SQLite (un solo archivo).

## Probar en tu PC

```bash
npm install
```

Copiar `.env.example` a `.env` y completar las tres líneas (clave de Google, contraseña del panel, texto al azar). Después:

```bash
npm start
```

- http://localhost:3000 → página oficial
- http://localhost:3000/admin → panel
- http://localhost:3000/demo → galería de ejemplo (no necesita Drive)

## Cómo se crea una galería

1. Subir las fotos a una carpeta de Drive y compartirla como **"Cualquier persona con el vínculo"** (Lector).
2. Entrar a `/admin` → **Nueva galería** → pegar el link de la carpeta → **Verificar** (muestra el nombre y cuántas fotos tiene).
3. Guardar y copiar el link que se le pasa al cliente.

Opciones por galería: tipo de evento y fecha, orden de las fotos (por número de archivo o por hora de la toma), foto de portada, visible u oculta, y **favoritas**.

### Favoritas (opcional por galería)

Con la opción apagada la galería es de solo mirar y descargar, y no se guarda nada de lo que hace cada visitante.
Con la opción encendida cada persona escribe su nombre al marcar la primera foto con el corazón, y Daniel ve en **Ver elecciones** quién eligió qué, las fotos elegidas por más de una persona, puede copiar los códigos de archivo y descargar un CSV.

## Dónde está cada cosa

| | |
|---|---|
| `server.js` | arranque y rutas |
| `src/` | base de datos, login, Drive, páginas y panel |
| `views/` | pantallas: página oficial, galería, login y panel |
| `brand.json` | nombre, Instagram y WhatsApp |
| `events.json` | galerías iniciales (solo se leen la primera vez que se crea la base) |
| `data/tusfotos.db` | la base (se crea sola; no se sube a GitHub) |
| `deploy/` | archivos y guía para publicar en AWS: [deploy/AWS.md](deploy/AWS.md) |

`npm run backup` hace una copia de la base en `data/backups`.
