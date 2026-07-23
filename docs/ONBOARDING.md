# Онбординг розробника

Цей документ описує, як запустити Personal Financial Tracker API локально з чистого checkout.

## Передумови

- Node.js 24 або новіший
- npm
- Docker Desktop з Docker Compose
- Git

## 1. Встановити залежності

```bash
npm i
```

## 2. Створити локальний `.env`

Скопіюй приклад:

```bash
cp .env.example .env
```

У Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Для стандартного `docker-compose.yml` PostgreSQL доступний на host-порту `5433`, тому локальний `.env` має виглядати приблизно так:

```env
POSTGRES_USER=personal_api
POSTGRES_PASSWORD=personal_api_password
POSTGRES_DB=personal_api
DATABASE_URL=postgresql://personal_api:personal_api_password@localhost:5433/personal_api

BETTER_AUTH_SECRET=replace_with_at_least_32_random_characters
BETTER_AUTH_URL=http://localhost:3000
```

Згенерувати сильніший `BETTER_AUTH_SECRET` можна однією з команд:

```bash
openssl rand -base64 32
```

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 3. Запустити інфраструктуру

```bash
docker compose up -d
```

Це піднімає:

- PostgreSQL на `localhost:5433`
- Redis на `localhost:6379`

Перевірити статус контейнерів:

```bash
docker compose ps
```

## 4. Накотити міграції

```bash
npm run db:migrate
```

Команда застосовує міграції з `src/db/migrations/` до PostgreSQL бази з `DATABASE_URL`.

## 5. Запустити API

```bash
npm run dev
```

API буде доступне за адресою:

```text
http://localhost:3000
```

Поточна перевірка, що сервер відповідає:

```bash
curl http://localhost:3000/
```

Очікувана відповідь:

```text
Hello Hono!
```

## Переглянути дані в базі

Найпростіший спосіб — **Drizzle Studio**. Вже входить у `drizzle-kit`
(devDependency), не питає окремих кредів — читає той самий
`drizzle.config.ts`, яким користуються міграції:

```bash
npm run db:studio
```

Відкриває `https://local.drizzle.studio` в браузері: список таблиць,
перегляд і редагування рядків, довільні SQL-запити. UI віддається з хмари
Drizzle, але саме з'єднання з базою лишається локальним.

Якщо потрібен окремий клієнт (VS Code extension, TablePlus, DBeaver тощо),
йому потрібні ті самі значення, що вже лежать у `.env`:

| Поле | Значення |
|---|---|
| Host | `localhost` |
| Port | `5433` (не стандартний `5432` — дивись `docker-compose.yml`) |
| Database | значення `POSTGRES_DB` з `.env` |
| User | значення `POSTGRES_USER` з `.env` |
| Password | значення `POSTGRES_PASSWORD` з `.env` |
| SSL | вимкнено (локальна розробка) |

Швидка перевірка без жодного клієнта, напряму через контейнер:

```bash
docker exec -it personal-api-postgres psql -U personal_api -d personal_api
```

Всередині `psql`: `\dt` — список таблиць, `SELECT * FROM auth_user;` —
подивитись дані, `\q` — вийти.

## Корисні команди

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Згенерувати нову міграцію після зміни Drizzle-схеми:

```bash
npm run db:generate
```

Застосувати pending-міграції:

```bash
npm run db:migrate
```

Зупинити локальну інфраструктуру:

```bash
docker compose down
```

Зупинити інфраструктуру і видалити локальні дані PostgreSQL/Redis:

```bash
docker compose down -v
```

## Поточний стан проєкту

Зараз у проєкті є:

- bootstrap Hono-сервера
- підключення PostgreSQL через Drizzle
- Drizzle-схема і початкова міграція
- конфігурація Better Auth і таблиці `auth_*`
- Docker Compose для PostgreSQL і Redis

Ще не реалізовані бізнесові endpoints для реєстрації, логіну, accounts, categories, transactions або budgets. Актуальний статус дивись у `docs/PROGRESS.md`.

## Troubleshooting

Якщо міграції не можуть під'єднатися до PostgreSQL, перевір:

- `docker compose ps` показує PostgreSQL як running або healthy
- `DATABASE_URL` використовує `localhost:5433`, а не `localhost:5432`, якщо запускаєш базу через цей `docker-compose.yml`
- `POSTGRES_USER`, `POSTGRES_PASSWORD` і `POSTGRES_DB` збігаються з credentials у `DATABASE_URL`

Якщо API падає на старті через env validation, перевір:

- файл `.env` існує
- `DATABASE_URL` заповнений
- `BETTER_AUTH_SECRET` має щонайменше 32 символи
- `BETTER_AUTH_URL` не має trailing slash
