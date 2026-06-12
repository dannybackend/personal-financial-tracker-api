# Personal Financial Tracker API

A small RESTful API for a personal budget tracker. The project is meant for tracking personal income and expenses while practicing core backend development concepts.

## Idea

The API allows an authenticated user to create, read, update, and delete financial records. The main entity at the start is a transaction: either income or expense, with an amount, category, date, and optional description.

## What To Build

- CRUD for the main entity: transactions.
- Authentication with Better Auth: email and password first.
- PostgreSQL as the main database.
- Drizzle ORM for schema definitions, migrations, and queries.
- Zod for input validation.
- Basic error handling and logging.
- Docker Compose for local development.

## Suggested Data Model

### Users

- `id`
- `email`
- `passwordHash`
- `createdAt`
- `updatedAt`

### Transactions

- `id`
- `userId`
- `type` - `income` or `expense`
- `amount`
- `category`
- `description`
- `date`
- `createdAt`
- `updatedAt`

## Example Endpoints

- `POST /auth/sign-up` - register a new user.
- `POST /auth/sign-in` - sign in.
- `GET /transactions` - list the current user's transactions.
- `POST /transactions` - create a transaction.
- `GET /transactions/:id` - get one transaction.
- `PATCH /transactions/:id` - update a transaction.
- `DELETE /transactions/:id` - delete a transaction.

## Topics To Learn Along The Way

- Database schema design: how to think about tables, relationships, indexes, and constraints.
- HTTP status codes: the logic behind choosing the right response, not just memorizing a list.
- JWT: what it is, how it works, where to store it on the client, and why that matters.
- Environment variables and configuration: `dotenv`, local configuration, and validation with Zod.

## Local Development

Planned local startup with Docker Compose:

```bash
docker compose up
```

After that, the API should be available locally and PostgreSQL should be running in a container.

## Status

This is a learning project. Start with a minimal CRUD flow and authentication, then add filters, categories, statistics, and tests.
