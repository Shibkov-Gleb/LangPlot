# LangPlot

Локальная основа сервиса изучения языков через интерактивные истории. Курсы ещё не опубликованы. Демо-вход и студия предназначены только для локальной разработки.

Node.js 22, pnpm 10.28.2, Docker Desktop с Linux containers.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Открыть http://localhost:3000. API слушает только 127.0.0.1:4000, PostgreSQL — 127.0.0.1:54329.

Полная инструкция и описание архитектуры будут дополнены после проверки реализации.
