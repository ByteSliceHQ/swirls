---
name: micro-saas
description: |
  Bootstrap a complete micro-SaaS application powered by Swirls. Generates a full-stack app with TanStack Start, Better Auth, SQLite via Drizzle ORM, and the Swirls SDK for AI workflows, form handling, and infrastructure management.

  Use when the user wants to build a new micro-SaaS product, bootstrap a SaaS starter, or create a full-stack app that integrates with Swirls for AI-powered workflows. Feed in a product idea and get a complete, deployable application scaffold.
user-invocable: true
allowed-tools: [Bash, Read, Write, Edit]
metadata:
  last_verified: "2026-02-13"
  repository: "https://github.com/byteslicehq/swirls"
  documentation: "https://swirls.ai/docs"
---

# Micro SaaS Bootstrapper

Build a complete micro-SaaS application powered by Swirls. This skill generates a production-ready full-stack app from a product idea using TanStack Start, Better Auth, SQLite, and the Swirls SDK.

**Stack:**

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [TanStack Start](https://tanstack.com/start) (full-stack React with SSR)
- **Routing**: [TanStack Router](https://tanstack.com/router) (file-based, type-safe)
- **Auth**: [Better Auth](https://www.better-auth.com/) (email/password, OAuth, sessions)
- **Database**: SQLite via [Drizzle ORM](https://orm.drizzle.team/) (local `bun:sqlite` or remote Turso/libSQL)
- **Validation**: [Zod](https://zod.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **AI Workflows**: [Swirls SDK](https://swirls.ai) (forms, graph execution, data streams)

---

## Table of Contents

- [How to Use This Skill](#how-to-use-this-skill)
- [Project Scaffold](#project-scaffold)
- [Step 1: Initialize the Project](#step-1-initialize-the-project)
- [Step 2: Configure Swirls](#step-2-configure-swirls)
- [Step 3: Database Schema](#step-3-database-schema)
- [Step 4: Authentication](#step-4-authentication)
- [Step 5: Server Functions](#step-5-server-functions)
- [Step 6: Routes and Pages](#step-6-routes-and-pages)
- [Step 7: Swirls SDK Integration](#step-7-swirls-sdk-integration)
- [Step 8: Deployment](#step-8-deployment)
- [Swirls API Reference](#swirls-api-reference)
- [Swirls SDK Reference](#swirls-sdk-reference)
- [Swirls CLI Reference](#swirls-cli-reference)
- [Patterns and Best Practices](#patterns-and-best-practices)

---

## How to Use This Skill

When the user provides a micro-SaaS idea, follow these steps:

1. **Understand the idea**: Identify the core domain entities, user flows, and what Swirls features the app needs (forms, workflows, webhooks, schedules, AI agents, data streams).
2. **Design the schema**: Map domain entities to Drizzle ORM SQLite tables, plus the standard Better Auth tables.
3. **Plan Swirls integration**: Determine which Swirls resources to create (forms with JSON schemas, workflow graphs, triggers, webhooks, schedules, streams) and how they connect to the app.
4. **Generate the scaffold**: Create the full project structure following the patterns below.
5. **Wire up the SDK**: Initialize the Swirls config, run code generation, and integrate form adapters and graph executions into the app.

**Important**: The Swirls platform handles AI workflow orchestration externally. The app you build is the *frontend and user-facing layer* that submits data to Swirls (via forms, webhooks, or SDK calls) and reads results back (via streams, executions, or graph outputs). Do NOT try to replicate workflow logic inside the app. Let Swirls handle it.

---

## Project Scaffold

Generate this directory structure for every new micro-SaaS project:

```
my-saas/
├── src/
│   ├── components/
│   │   ├── AuthComponents.tsx      # SignedIn, SignedOut, UserButton wrappers
│   │   ├── Header.tsx              # Navigation with auth UI
│   │   └── ...                     # Domain-specific components
│   ├── db/
│   │   ├── schema.ts               # Drizzle ORM table definitions
│   │   └── client.ts               # Database client factory
│   ├── lib/
│   │   ├── auth.ts                 # Better Auth server configuration
│   │   └── auth-client.ts          # Better Auth client (React hooks)
│   ├── routes/
│   │   ├── __root.tsx              # Root layout (HTML shell, Header, Outlet)
│   │   ├── index.tsx               # Landing page
│   │   ├── sign-in.tsx             # Sign-in form
│   │   ├── sign-up.tsx             # Sign-up form
│   │   ├── dashboard.tsx           # Protected dashboard
│   │   ├── pricing.tsx             # Pricing page (optional)
│   │   └── api/
│   │       └── auth/
│   │           └── $.ts            # Better Auth catch-all handler
│   ├── server/
│   │   └── [domain].ts             # Server functions for each domain entity
│   ├── router.tsx                  # TanStack Router instance
│   ├── start.ts                    # TanStack Start instance
│   ├── swirls.gen.ts               # Generated Swirls SDK types (auto-generated)
│   └── styles.css                  # Tailwind CSS imports
├── drizzle/                        # Generated migrations
├── public/                         # Static assets
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── swirls.config.ts                # Swirls SDK configuration
├── biome.json                      # Linter/formatter config
├── Dockerfile
├── .env.example
└── .gitignore
```

---

## Step 1: Initialize the Project

### package.json

```json
{
  "name": "my-saas",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --port 3000",
    "build": "vite build",
    "start": "bun .output/server/index.mjs",
    "preview": "vite preview",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "swirls:gen": "swirls dev gen"
  },
  "dependencies": {
    "@libsql/client": "^0.17.0",
    "@swirls/sdk": "^0.0.4",
    "@tailwindcss/vite": "^4.0.6",
    "@tanstack/react-devtools": "^0.7.0",
    "@tanstack/react-router": "^1.132.0",
    "@tanstack/react-router-devtools": "^1.132.0",
    "@tanstack/react-start": "^1.132.0",
    "@tanstack/router-plugin": "^1.132.0",
    "better-auth": "^1.4.18",
    "drizzle-orm": "^0.45.1",
    "lucide-react": "^0.561.0",
    "nitro": "npm:nitro-nightly@latest",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tailwindcss": "^4.0.6",
    "vite-tsconfig-paths": "^6.0.2",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@biomejs/biome": "2.2.4",
    "@tanstack/devtools-vite": "^0.3.11",
    "@types/node": "^22.10.2",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.4",
    "drizzle-kit": "^0.31.8",
    "typescript": "^5.7.2",
    "vite": "^7.1.7"
  }
}
```

### vite.config.ts

```typescript
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    devtools(),
    nitro({ preset: "bun" }),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
```

### tsconfig.json

```json
{
  "include": ["**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "target": "ES2022",
    "jsx": "react-jsx",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### drizzle.config.ts

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "sqlite.db",
  },
});
```

### .env.example

```env
# Better Auth
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3000

# Optional: Remote SQLite (Turso/libSQL) - omit to use local sqlite.db
# DB_URL=libsql://your-db.turso.io
# DB_TOKEN=your-auth-token

# Swirls
SWIRLS_API_KEY=ak_your-swirls-api-key
```

### swirls.config.ts

```typescript
import { defineConfig } from "@swirls/sdk/config";

export default defineConfig({
  projectId: "your-swirls-project-id", // UUID from Swirls dashboard
  genPath: "src/swirls.gen.ts",
});
```

### biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.4/schema.json",
  "vcs": { "enabled": false },
  "files": {
    "includes": ["**/src/**/*", "**/.vscode/**/*", "**/index.html", "**/vite.config.ts"],
    "ignores": ["**/src/routeTree.gen.ts", "**/src/swirls.gen.ts", "**/src/styles.css"]
  },
  "formatter": { "enabled": true, "indentStyle": "tab" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

---

## Step 2: Configure Swirls

### Initialize Swirls in the Project

```bash
# Login to Swirls (opens browser OAuth)
swirls auth login

# Initialize config file
swirls dev init

# After creating forms/graphs in the Swirls dashboard, generate types:
swirls dev gen
```

### Generated Code (src/swirls.gen.ts)

The `swirls dev gen` command fetches your project's forms from the Swirls API and generates a type-safe TypeScript file. This file contains:

- Zod schemas for each form
- A typed form registry
- A `registerForms()` function to call at app startup
- Module augmentation for the `FormRegistry` interface

**Example generated output:**

```typescript
// AUTO-GENERATED by @swirls/cli - DO NOT EDIT
import { z } from "zod";
import { registerForm } from "@swirls/sdk/form";

// Form: Contact Form
const contactFormSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  message: z.string(),
});

// Form: Feedback Form
const feedbackFormSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});

declare module "@swirls/sdk/form" {
  interface FormRegistry {
    "contact-form": {
      id: "form-uuid-here";
      schema: typeof contactFormSchema;
    };
    "feedback-form": {
      id: "form-uuid-here";
      schema: typeof feedbackFormSchema;
    };
  }
}

export function registerForms() {
  registerForm("contact-form", {
    id: "form-uuid-here",
    schema: contactFormSchema,
  });
  registerForm("feedback-form", {
    id: "form-uuid-here",
    schema: feedbackFormSchema,
  });
}
```

### Register Forms at App Startup

In the root layout or entry point, call `registerForms()`:

```typescript
// src/routes/__root.tsx
import { registerForms } from "@/swirls.gen";

// Register Swirls forms on app boot
registerForms();
```

---

## Step 3: Database Schema

### src/db/client.ts

```typescript
import * as schema from "./schema";

const createDb = async () => {
  // Remote libSQL/Turso (if configured)
  if (process.env.DB_URL && process.env.DB_TOKEN) {
    const { createClient } = await import("@libsql/client/web");
    const { drizzle } = await import("drizzle-orm/libsql");
    const client = createClient({
      url: process.env.DB_URL,
      authToken: process.env.DB_TOKEN,
    });
    return drizzle({ client, schema });
  }

  // Local SQLite with Bun
  const { Database } = await import("bun:sqlite");
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const sqlite = new Database("sqlite.db");
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");
  return drizzle({ client: sqlite, schema });
};

export const db = await createDb();
```

### src/db/schema.ts

Every micro-SaaS needs the Better Auth tables plus domain-specific tables. Below is the base schema. **Add your domain tables after the auth section**.

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ============================================================
// Better Auth Tables (REQUIRED - do not modify column names)
// ============================================================

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const session = sqliteTable("session", {
  id: text().primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const account = sqliteTable("account", {
  id: text().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text(),
  password: text(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const verification = sqliteTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

// ============================================================
// Domain Tables (ADD YOUR TABLES HERE)
// ============================================================
// Example pattern for a domain entity:
//
// export const items = sqliteTable("items", {
//   id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
//   userId: text("user_id").notNull(),
//   name: text().notNull(),
//   description: text(),
//   createdAt: integer("created_at", { mode: "timestamp_ms" })
//     .notNull()
//     .default(sql`(strftime('%s', 'now') * 1000)`),
//   updatedAt: integer("updated_at", { mode: "timestamp_ms" })
//     .notNull()
//     .default(sql`(strftime('%s', 'now') * 1000)`)
//     .$onUpdate(() => new Date()),
// });
//
// export const itemsRelations = relations(items, ({ many }) => ({
//   children: many(childTable),
// }));
//
// export type Item = typeof items.$inferSelect;
// export type NewItem = typeof items.$inferInsert;
```

---

## Step 4: Authentication

### src/lib/auth.ts (Server)

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [tanstackStartCookies()],
});
```

### src/lib/auth-client.ts (Client)

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

### src/components/AuthComponents.tsx

```typescript
import { authClient } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  if (!session?.user) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;
  if (session?.user) return null;
  return <>{children}</>;
}

export function UserButton() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  if (!session?.user) return null;

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-300">{session.user.name}</span>
      <button
        onClick={handleSignOut}
        className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600"
      >
        Sign out
      </button>
    </div>
  );
}
```

### Auth API Route (src/routes/api/auth/$.ts)

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
```

### Auth Guard Pattern (reuse in server functions)

```typescript
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

export const requireAuth = async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect({ to: "/" });
  }
  return session.user.id;
};
```

### Sign-In Page (src/routes/sign-in.tsx)

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      setError(error.message ?? "Sign in failed");
      return;
    }

    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 p-8">
        <h1 className="text-2xl font-bold">Sign In</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded border p-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="w-full rounded border p-2"
        />
        <button
          type="submit"
          className="w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-700"
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
```

### Sign-Up Page (src/routes/sign-up.tsx)

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const { error } = await authClient.signUp.email({ name, email, password });

    if (error) {
      setError(error.message ?? "Sign up failed");
      return;
    }

    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 p-8">
        <h1 className="text-2xl font-bold">Sign Up</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          required
          className="w-full rounded border p-2"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded border p-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="w-full rounded border p-2"
        />
        <button
          type="submit"
          className="w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-700"
        >
          Sign Up
        </button>
      </form>
    </div>
  );
}
```

---

## Step 5: Server Functions

Server functions are the RPC layer. They run on the server and are callable from client components as regular async functions. Always protect mutations with `requireAuth()`.

### Pattern: Domain CRUD Server Functions

```typescript
// src/server/[domain].ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/client";
import { items } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth-guard";

// READ - List items for the authenticated user
export const getItems = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireAuth();
  return db.query.items.findMany({
    where: eq(items.userId, userId),
    orderBy: [asc(items.createdAt)],
  });
});

// CREATE - Add a new item
export const createItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const [newItem] = await db
      .insert(items)
      .values({
        userId,
        name: data.name,
        description: data.description,
      })
      .returning();
    return newItem;
  });

// UPDATE - Modify an existing item (ownership check)
export const updateItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const existing = await db.query.items.findFirst({
      where: eq(items.id, data.id),
    });
    if (!existing || existing.userId !== userId) return null;

    const [updated] = await db
      .update(items)
      .set({ name: data.name, description: data.description })
      .where(eq(items.id, data.id))
      .returning();
    return updated;
  });

// DELETE - Remove an item (ownership check)
export const deleteItem = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const existing = await db.query.items.findFirst({
      where: eq(items.id, data.id),
    });
    if (!existing || existing.userId !== userId) return null;
    await db.delete(items).where(eq(items.id, data.id));
    return { success: true };
  });
```

---

## Step 6: Routes and Pages

### Root Layout (src/routes/__root.tsx)

```typescript
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { registerForms } from "@/swirls.gen";
import appCss from "@/styles.css?url";

// Register Swirls forms at app boot
registerForms();

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "My SaaS App" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-gray-950 text-white">
        <Header />
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
```

### Router Instance (src/router.tsx)

```typescript
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

### TanStack Start Instance (src/start.ts)

```typescript
import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({}));
```

### Protected Dashboard Route (src/routes/dashboard.tsx)

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth";
import { getItems } from "@/server/items";

const authGuard = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw redirect({ to: "/" });
  }
  return { userId: session.user.id };
});

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => authGuard(),
  loader: () => getItems(),
  component: DashboardPage,
});

function DashboardPage() {
  const items = Route.useLoaderData();

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      {/* Render your domain UI here */}
    </main>
  );
}
```

### Styles (src/styles.css)

```css
@import "tailwindcss";
```

---

## Step 7: Swirls SDK Integration

The Swirls SDK connects your app to the Swirls platform for AI workflows, form handling, and data persistence.

### Using the Form Adapter (React Hook)

After running `swirls dev gen`, use the `useSwirlsFormAdapter` hook to submit data to Swirls forms:

```typescript
import { useSwirlsFormAdapter } from "@swirls/sdk/form";

function ContactForm() {
  const adapter = useSwirlsFormAdapter("contact-form", {
    name: "",
    email: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const result = await adapter.submit({
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      message: formData.get("message") as string,
    });

    // result.executionIds contains IDs of triggered graph executions
    console.log("Submitted:", result.executionIds);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required />
      <input name="email" type="email" required />
      <textarea name="message" required />
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Form Submission Flow

When you call `adapter.submit(data)`:

1. The SDK validates data against the form's Zod schema
2. Sends a POST request to `https://swirls.ai/api/forms/{formId}`
3. Swirls triggers any connected workflow graphs
4. Returns `{ message: string, executionIds: string[] }`

### Direct API Calls (Server-Side)

For server-side Swirls operations (creating resources, querying streams, executing graphs), use direct HTTP calls to the Swirls API from server functions:

```typescript
// src/server/swirls.ts
import { createServerFn } from "@tanstack/react-start";

const SWIRLS_API = "https://swirls.ai/rpc";

async function swirlsRPC(endpoint: string, data?: unknown) {
  const response = await fetch(`${SWIRLS_API}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SWIRLS_API_KEY}`,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return response.json();
}

// Execute a workflow graph
export const executeWorkflow = createServerFn({ method: "POST" })
  .inputValidator(z.object({ graphId: z.string(), input: z.record(z.any()) }))
  .handler(async ({ data }) => {
    return swirlsRPC("graphs.executeGraph", {
      graphId: data.graphId,
      input: data.input,
    });
  });

// Query a data stream
export const queryStream = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      streamId: z.string(),
      filters: z.array(z.object({
        column: z.string(),
        operator: z.enum(["eq", "ne", "gt", "lt", "gte", "lte", "like", "in"]),
        value: z.any(),
      })).optional(),
    })
  )
  .handler(async ({ data }) => {
    return swirlsRPC("streams.executeStreamQuery", {
      streamId: data.streamId,
      filters: data.filters ?? [],
    });
  });

// Get execution status
export const getExecution = createServerFn({ method: "GET" })
  .inputValidator(z.object({ executionId: z.string() }))
  .handler(async ({ data }) => {
    return swirlsRPC("graphs.getExecution", {
      executionId: data.executionId,
    });
  });
```

---

## Step 8: Deployment

### Dockerfile

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-slim AS production
WORKDIR /app

COPY --from=build /app/.output ./.output

ENV BETTER_AUTH_SECRET=""
ENV BETTER_AUTH_URL=""
ENV DB_URL=""
ENV DB_TOKEN=""
ENV SWIRLS_API_KEY=""

EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
```

### Build and Run

```bash
# Development
bun run dev

# Production build
bun run build

# Start production server
bun run start

# Database operations
bun run db:push      # Push schema to database (development)
bun run db:generate  # Generate migrations
bun run db:migrate   # Run migrations (production)

# Swirls code generation
bun run swirls:gen   # Regenerate types after updating forms in Swirls
```

---

## Swirls API Reference

The Swirls platform exposes an oRPC-based API. All endpoints are prefixed with `/rpc/`. Authentication uses Bearer tokens (API keys: `ak_*`).

### Projects

| Endpoint | Method | Description |
|----------|--------|-------------|
| `projects.listProjects` | GET | List all projects |
| `projects.createProject` | POST | Create a new project |
| `projects.getProject` | GET | Get project by ID |
| `projects.getStorage` | GET | Get project storage info |
| `projects.createStorage` | POST | Provision storage for project |

### Forms

| Endpoint | Method | Description |
|----------|--------|-------------|
| `forms.createForm` | POST | Create form with JSON schema |
| `forms.getForm` | GET | Get form by ID |
| `forms.updateForm` | PUT | Update form name/description/schema |
| `forms.deleteForm` | DELETE | Delete a form |
| `forms.listForms` | GET | List forms (paginated) |
| `forms.listFormSubmissions` | GET | List submissions for a form |
| `forms.listTriggersForForm` | GET | List triggers connected to a form |

**Form Schema**: Forms accept a JSON Schema (JSON Schema 7) defining the expected input. When submitted via the SDK, data is validated against this schema.

### Workflow Graphs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `graphs.createGraph` | POST | Create a workflow graph |
| `graphs.getGraph` | GET | Get graph with nodes and edges |
| `graphs.updateGraph` | PUT | Update graph metadata |
| `graphs.deleteGraph` | DELETE | Delete a graph |
| `graphs.listGraphs` | GET | List graphs (paginated) |
| `graphs.createNode` | POST | Add node to graph |
| `graphs.updateNode` | PUT | Update node config |
| `graphs.deleteNode` | DELETE | Remove node |
| `graphs.createEdge` | POST | Connect two nodes |
| `graphs.deleteEdge` | DELETE | Disconnect nodes |
| `graphs.syncGraph` | POST | Sync all nodes and edges at once |
| `graphs.executeGraph` | POST | Execute a graph (returns executionId) |
| `graphs.executeNode` | POST | Test-execute a single node |
| `graphs.getExecution` | GET | Get execution status and results |
| `graphs.listExecutions` | GET | List executions (paginated) |

**Node Types**:

| Type | Description | Key Config |
|------|-------------|------------|
| `llm` | Language model call | model, prompt, temperature, maxTokens |
| `http` | HTTP request | url, method, headers, body |
| `code` | JavaScript execution | code (string) |
| `decision` | Conditional branch | expression |
| `document` | Read document content | documentId |
| `email` | Send email | to, subject, body |
| `graph` | Execute sub-graph | graphId |
| `scrape` | Web scraping | url, selector |
| `stream` | Query data stream | streamId, query |
| `wait` | Delay execution | duration |
| `bucket` | File storage ops | action (download/upload), path |

### Triggers

Triggers connect resources (forms, webhooks, schedules, agents) to graphs.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `triggers.createTrigger` | POST | Create trigger (form/webhook/schedule/agent -> graph) |
| `triggers.getTrigger` | GET | Get trigger by ID |
| `triggers.updateTrigger` | PUT | Update trigger config |
| `triggers.deleteTrigger` | DELETE | Delete a trigger |
| `triggers.listTriggers` | GET | List triggers (paginated) |
| `triggers.executeTriggers` | POST | Manually fire triggers |

**Trigger Types**: `form`, `webhook`, `schedule`, `agent`

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `webhooks.createWebhook` | POST | Create webhook endpoint |
| `webhooks.getWebhook` | GET | Get webhook by ID |
| `webhooks.updateWebhook` | PUT | Update webhook |
| `webhooks.deleteWebhook` | DELETE | Delete webhook |
| `webhooks.listWebhooks` | GET | List webhooks (paginated) |

### Schedules (Cron)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `schedules.createSchedule` | POST | Create cron schedule |
| `schedules.getSchedule` | GET | Get schedule by ID |
| `schedules.updateSchedule` | PUT | Update schedule expression |
| `schedules.deleteSchedule` | DELETE | Delete schedule |
| `schedules.listSchedules` | GET | List schedules (paginated) |

### Agents (AI Assistants)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `agents.createAgent` | POST | Create an AI agent with tools |
| `agents.getAgent` | GET | Get agent by ID |
| `agents.updateAgent` | PUT | Update agent config |
| `agents.deleteAgent` | DELETE | Delete agent |
| `agents.listAgents` | GET | List agents (paginated) |

### Data Streams

Streams persist data from graph executions for querying.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `streams.createStream` | POST | Create data stream (with persistence condition) |
| `streams.getStream` | GET | Get stream by ID |
| `streams.updateStream` | PUT | Update stream |
| `streams.deleteStream` | DELETE | Delete stream |
| `streams.listStreams` | GET | List streams (paginated) |
| `streams.executeStreamQuery` | POST | Query stream data with filters |
| `streams.listStreamSchemas` | GET | List inferred schemas |
| `streams.promoteStreamSchema` | POST | Promote a schema version |
| `streams.listStreamTableColumns` | GET | Get column definitions |

**Stream Query Filters**: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `like`, `in`

### Schemas (JSON Schema Registry)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `schemas.createSchema` | POST | Register a JSON schema |
| `schemas.getSchema` | GET | Get schema by ID |
| `schemas.updateSchema` | PUT | Update schema |
| `schemas.deleteSchema` | DELETE | Delete schema |
| `schemas.listSchemas` | GET | List schemas (paginated) |

### Secrets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `secrets.createSecret` | POST | Store an encrypted secret |
| `secrets.getSecretValue` | GET | Retrieve secret value |
| `secrets.updateSecret` | POST | Update secret value |
| `secrets.deleteSecret` | POST | Delete secret |
| `secrets.listSecrets` | GET | List secrets (masked values) |

### File Buckets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `buckets.createBucket` | POST | Create file storage bucket |
| `buckets.listFiles` | GET | List files and folders |
| `buckets.deleteFile` | POST | Delete a file |
| `buckets.createSignedUrl` | POST | Get download URL (default 24h expiry) |
| `buckets.createSignedUploadUrl` | POST | Get upload URL with token |
| `buckets.moveFile` | POST | Move/rename file |
| `buckets.copyFile` | POST | Copy file |

### API Keys

| Endpoint | Method | Description |
|----------|--------|-------------|
| `apiKeys.createApiKey` | POST | Create API key (secret returned once) |
| `apiKeys.listApiKeys` | GET | List API keys |
| `apiKeys.revokeApiKey` | POST | Revoke an API key |

### Reviews (Approval Workflows)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `reviews.listReviews` | GET | List pending reviews |
| `reviews.getReview` | GET | Get review details |
| `reviews.approveReview` | POST | Approve a review |
| `reviews.rejectReview` | POST | Reject a review |

### Storage (SQL Queries)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `storage.createQuery` | POST | Save a SQL query |
| `storage.executeQuery` | POST | Execute a saved query |
| `storage.listQueries` | GET | List saved queries |
| `storage.getQuery` | GET | Get query by ID |
| `storage.updateQuery` | PUT | Update query |
| `storage.deleteQuery` | DELETE | Delete query |

### Pagination

All list endpoints support cursor-based pagination:

```typescript
{
  before?: string,  // Cursor for previous page
  after?: string,   // Cursor for next page
  first?: number,   // Items per page (1-100)
  last?: number,    // Items from end
}
```

---

## Swirls SDK Reference

### Installation

```bash
bun add @swirls/sdk
```

### Config (`@swirls/sdk/config`)

```typescript
import { defineConfig } from "@swirls/sdk/config";

// Creates swirls.config.ts
export default defineConfig({
  projectId: "uuid",          // Your Swirls project UUID
  genPath: "src/swirls.gen.ts", // Output path for generated code
});
```

### Form Adapter (`@swirls/sdk/form`)

```typescript
import { useSwirlsFormAdapter } from "@swirls/sdk/form";

// Returns a FormAdapter object
const adapter = useSwirlsFormAdapter("form-name", defaultValues);

// adapter.schema     - Zod schema for validation
// adapter.defaultValues - Default form values
// adapter.submit(data) - Submit form data to Swirls
//   Returns: Promise<{ message: string, executionIds: string[] }>
```

### Code Generation (`@swirls/sdk/form/generate`)

Called internally by the CLI. Converts JSON Schema to Zod schemas and generates:
- Typed form definitions
- `registerForms()` bootstrap function
- Module augmentation for `FormRegistry` interface

---

## Swirls CLI Reference

```bash
# Authentication
swirls auth login     # OAuth login (opens browser)
swirls auth logout    # Revoke session

# Development
swirls dev init       # Create swirls.config.ts
swirls dev gen        # Generate TypeScript types from project forms

# Projects
swirls project create  # Create a new Swirls project
swirls project open    # Open project in browser

# File Storage
swirls storage list [path]             # List files
swirls storage upload <src> <dest>     # Upload file
swirls storage download <src> <dest>   # Download file
swirls storage delete <path>           # Delete file
swirls storage url <path> [--expires]  # Get signed URL
```

---

## Patterns and Best Practices

### 1. One Swirls Project Per Micro-SaaS

Each micro-SaaS app should have its own Swirls project. This isolates forms, graphs, secrets, and storage.

### 2. Use Forms for User Input -> AI Processing

The primary integration point is: **User submits form in your app -> Swirls validates & triggers workflow graph -> Graph processes with LLMs/HTTP/code -> Results stored in stream**.

```
User -> Your App (TanStack Start) -> Swirls Form -> Trigger -> Graph -> Stream
                                                                          |
User <- Your App (query stream) <-----------------------------------------
```

### 3. Use Streams for Reading Results

After a graph execution completes, query the connected data stream to read results back into your app:

```typescript
const results = await queryStream({
  streamId: "your-stream-id",
  filters: [
    { column: "user_id", operator: "eq", value: userId },
    { column: "created_at", operator: "gte", value: startDate },
  ],
});
```

### 4. Use Webhooks for External Integrations

If your SaaS receives data from external services (Stripe, GitHub, etc.), create a Swirls webhook and point the external service to it. The webhook triggers a graph that processes the data.

### 5. Use Schedules for Recurring Tasks

Cron-based schedules trigger graphs on a recurring basis. Use for daily reports, data sync, cleanup jobs, etc.

### 6. Auth Guard Everything

Always use `requireAuth()` in server functions that access user data. Check ownership (`userId` match) before update/delete operations.

### 7. Keep Domain Logic in the App, AI Logic in Swirls

- **In your app (TanStack Start)**: User management, CRUD operations, UI rendering, session management
- **In Swirls (graphs)**: LLM calls, HTTP enrichment, data transforms, email notifications, AI decision-making

### 8. Generate Types After Every Swirls Change

Whenever you modify forms in the Swirls dashboard, regenerate types:

```bash
bun run swirls:gen
```

This keeps your TypeScript types in sync with your Swirls project.

### 9. Environment Variable Security

- `BETTER_AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `SWIRLS_API_KEY` - Create in Swirls dashboard (format: `ak_*`)
- Never commit `.env` files
- Use Turso for production databases (`DB_URL` + `DB_TOKEN`)

### 10. Local Development Workflow

```bash
# 1. Start the app
bun run dev

# 2. Push schema to local SQLite
bun run db:push

# 3. Open Drizzle Studio to inspect data
bun run db:studio

# 4. After creating forms in Swirls dashboard, generate types
bun run swirls:gen
```

---

**Last verified**: 2026-02-13 | **Skill version**: 1.0.0
