# Publicar en AWS (Lightsail)

Guía para dejar el sitio andando en un servidor propio. Lightsail es la forma más simple de tener un servidor en AWS:
un precio fijo por mes, una IP fija y poco para configurar. El plan más chico alcanza para empezar (mirá el precio actual en aws.amazon.com/lightsail).

## 1. Crear el servidor

1. Entrá a https://lightsail.aws.amazon.com → **Create instance**.
2. Plataforma **Linux/Unix**, plantilla **OS Only → Ubuntu 24.04 LTS**.
3. Elegí el plan más chico y ponele de nombre `tusfotos`.
4. Una vez creada: pestaña **Networking** → **Create static IP** y asociarla a la instancia (así la IP no cambia si se reinicia).
5. Misma pestaña, **IPv4 Firewall**: agregar **HTTP (80)** y **HTTPS (443)**. El 22 (SSH) ya viene.
6. Pestaña **Snapshots** → activar **Automatic snapshots** (copia diaria de todo el servidor).

## 2. Apuntar el dominio

En el panel donde esté el dominio (NIC.ar o donde lo hayan registrado), crear un registro **A** que apunte a la IP fija:

| Nombre | Tipo | Valor |
|---|---|---|
| `@` (el dominio solo) | A | la IP fija |
| `www` | A | la IP fija |

Los dominios `.com.ar` se registran en https://nic.ar; ahí se pueden cargar los DNS o delegarlos a Cloudflare o Route 53.
Puede tardar de minutos a unas horas en funcionar.

## 3. Instalar lo necesario

Entrar al servidor (botón **Connect using SSH** en Lightsail) y pegar:

```bash
sudo apt update && sudo apt install -y git build-essential python3 curl

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Caddy (el que pone el candadito HTTPS solo)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 4. Instalar el sitio

```bash
sudo useradd --system --home-dir /opt/tusfotos --shell /usr/sbin/nologin tusfotos
# "-b servidor-aws" porque este código todavía está en esa rama; cuando se una a main se saca.
sudo git clone -b servidor-aws https://github.com/cesarmercado4/DFfotografias.git /opt/tusfotos
cd /opt/tusfotos
sudo npm ci --omit=dev

sudo mkdir -p /var/lib/tusfotos && sudo chown tusfotos: /var/lib/tusfotos
```

Si el repositorio es privado, GitHub pide usuario y, como contraseña, un *token* (GitHub → Settings → Developer settings → Personal access tokens).

## 5. Configurar las claves

```bash
sudo cp deploy/tusfotos.env.example /etc/tusfotos.env
sudo nano /etc/tusfotos.env      # completar las 3 claves y guardar (Ctrl+O, Enter, Ctrl+X)
sudo chmod 600 /etc/tusfotos.env
```

- `GOOGLE_API_KEY`: la clave de Google Cloud (con la Drive API habilitada). Conviene crear una nueva para el servidor.
- `ADMIN_PASSWORD`: la contraseña con la que Daniel entra al panel. Larga y que no use en otro lado.
- `SESSION_SECRET`: texto al azar. Se genera con `openssl rand -hex 32`.

## 6. Encender

```bash
sudo cp deploy/tusfotos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tusfotos

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # cambiar tusfotos.com.ar por el dominio real
sudo systemctl reload caddy
```

Probar: `https://TU-DOMINIO/healthz` tiene que decir `ok`, y `https://TU-DOMINIO/admin` pide la contraseña.
Si algo falla: `sudo journalctl -u tusfotos -n 50` muestra el motivo.

La primera vez, la base se llena con las galerías de `events.json` (incluidas `demo` y `prueba`). Se pueden borrar desde el panel.

## 7. Copias de seguridad

Toda la información (galerías y favoritas) está en un solo archivo: `/var/lib/tusfotos/tusfotos.db`. Las fotos viven en Drive.
Además de los *snapshots* de Lightsail, conviene una copia diaria de la base:

```bash
sudo crontab -u tusfotos -e
# agregar esta línea (todos los días a las 4:00):
0 4 * * * cd /opt/tusfotos && DATA_DIR=/var/lib/tusfotos /usr/bin/node scripts/backup.js
```

Guarda un archivo por día en `/var/lib/tusfotos/backups` y conserva los últimos 14.

## Actualizar el sitio

Cuando haya cambios nuevos en GitHub:

```bash
cd /opt/tusfotos
sudo git pull
sudo npm ci --omit=dev
sudo systemctl restart tusfotos
```
