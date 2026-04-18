# WifiKit Next Frontend

This is a separate Next.js viewer frontend for the existing `server.js` backend.

## 1. Install dependencies

```bash
cd frontend
npm install
```

## 2. Configure the backend URL

Copy `.env.example` to `.env.local` and adjust the URL if needed:

```bash
NEXT_PUBLIC_SOCKET_SERVER_URL=https://localhost:3001
```

Use your backend machine IP if you want to open the Next frontend from another device.

## 3. HTTPS development

The frontend dev server now starts over HTTPS by default.

Per the official Next.js CLI docs, `next dev` supports `--experimental-https` plus custom `--experimental-https-key` and `--experimental-https-cert` flags for development. This project uses those flags and tries to reuse the same mkcert cert/key filenames referenced in the root `server.js`.

If you want to override that detection, set these in `.env.local` or in your shell before running the dev server:

```bash
NEXT_DEV_HTTPS_KEY=../172.27.126.175-key.pem
NEXT_DEV_HTTPS_CERT=../172.27.126.175.pem
```

## 4. Start both apps

Backend:

```bash
node server.js
```

Frontend:

```bash
cd frontend
npm run dev
```

Then open `https://localhost:3000`.

## Notes

- Your backend still uses `mkcert`, so trust the certificate first.
- The Next frontend acts as the laptop/viewer.
- The phone page is still served by `server.js` at `/mobile`.
- If you want plain HTTP temporarily, use `npm run dev:http`.
