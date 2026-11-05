import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().notNull(),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash").notNull(),
    role: text("role", { enum: ["SUPER_ADMIN", "ADMIN", "DEVELOPER", "CLIENT", "GUEST"] })
      .notNull()
      .default("GUEST"),
    hwid: text("hwid"),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
    updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    createdAtIdx: index("users_created_at_idx").on(table.created_at),
  })
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "CASCADE" }),
    refresh_token: text("refresh_token").notNull().unique(),
    session_id: text("session_id").notNull().unique(),
    expires_at: integer("expires_at", { mode: "timestamp" }).notNull(),
    revoked: integer("revoked", { mode: "boolean" }).notNull().default(0),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    userIdx: index("sessions_user_id_idx").on(table.user_id),
    sessionIdIdx: uniqueIndex("sessions_session_id_idx").on(table.session_id),
    refreshTokenIdx: uniqueIndex("sessions_refresh_token_idx").on(table.refresh_token),
  })
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey().notNull(),
    client_id: text("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "RESTRICT" }),
    developer_id: text("developer_id").references(() => users.id, { onDelete: "SET NULL" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["QUOTE_ACCEPTED", "IN_DEVELOPMENT", "REVIEW", "COMPLETED", "DELIVERED", "CANCELLED"],
    })
      .notNull()
      .default("QUOTE_ACCEPTED"),
    progress_percentage: integer("progress_percentage").notNull().default(0),
    total_amount: integer("total_amount").notNull(), // cents
    first_paid: integer("first_paid", { mode: "boolean" }).notNull().default(0),
    final_paid: integer("final_paid", { mode: "boolean" }).notNull().default(0),
    final_deliverable_hash: text("final_deliverable_hash"),
    r2_object_key: text("r2_object_key"),
    escrow_held: integer("escrow_held", { mode: "boolean" }).notNull().default(0),
    escrow_released: integer("escrow_released", { mode: "boolean" }).notNull().default(0),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
    updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    clientIdx: index("projects_client_id_idx").on(table.client_id),
    developerIdx: index("projects_developer_id_idx").on(table.developer_id),
    statusIdx: index("projects_status_idx").on(table.status),
    createdAtIdx: index("projects_created_at_idx").on(table.created_at),
    clientStatusIdx: index("projects_client_status_idx").on(table.client_id, table.status),
  })
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey().notNull(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "CASCADE" }),
    stripe_payment_intent_id: text("stripe_payment_intent_id").unique(),
    amount: integer("amount").notNull(), // cents
    currency: text("currency").notNull().default("usd"),
    status: text("status", {
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED"],
    }).notNull().default("PENDING"),
    idempotency_key: text("idempotency_key").notNull().unique(),
    milestone: text("milestone", { enum: ["FIRST_50", "SECOND_50"] }).notNull(),
    paid_at: integer("paid_at", { mode: "timestamp" }),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    projectIdx: index("payments_project_id_idx").on(table.project_id),
    idempotencyIdx: uniqueIndex("payments_idempotency_key_idx").on(table.idempotency_key),
    stripeIdx: uniqueIndex("payments_stripe_payment_intent_id_idx").on(
      table.stripe_payment_intent_id
    ),
    statusIdx: index("payments_status_idx").on(table.status),
  })
);

export const licenses = sqliteTable(
  "licenses",
  {
    id: text("id").primaryKey().notNull(),
    license_key: text("license_key").notNull().unique(),
    project_id: text("project_id").references(() => projects.id, { onDelete: "SET NULL" }),
    client_id: text("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "CASCADE" }),
    hwid: text("hwid"),
    floating: integer("floating", { mode: "boolean" }).notNull().default(0),
    status: text("status", { enum: ["ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"] })
      .notNull()
      .default("ACTIVE"),
    max_activations: integer("max_activations").notNull().default(1),
    current_activations: integer("current_activations").notNull().default(0),
    expires_at: integer("expires_at", { mode: "timestamp" }),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
    updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    licenseKeyIdx: uniqueIndex("licenses_license_key_idx").on(table.license_key),
    clientIdx: index("licenses_client_id_idx").on(table.client_id),
    projectIdx: index("licenses_project_id_idx").on(table.project_id),
    statusIdx: index("licenses_status_idx").on(table.status),
  })
);

export const projectMessages = sqliteTable(
  "project_messages",
  {
    id: text("id").primaryKey().notNull(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "CASCADE" }),
    sender_id: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "CASCADE" }),
    content: text("content").notNull(),
    attachment_url: text("attachment_url"),
    attachment_hash: text("attachment_hash"),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    projectIdx: index("project_messages_project_id_idx").on(table.project_id),
    createdAtIdx: index("project_messages_created_at_idx").on(table.created_at),
    projectCreatedIdx: index("project_messages_project_created_idx").on(
      table.project_id,
      table.created_at
    ),
  })
);

export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "CASCADE" }),
    project_id: text("project_id").references(() => projects.id, { onDelete: "SET NULL" }),
    subject: text("subject").notNull(),
    status: text("status", {
      enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
    }).notNull().default("OPEN"),
    priority: text("priority", { enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] })
      .notNull()
      .default("MEDIUM"),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
    updated_at: integer("updated_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    userIdx: index("support_tickets_user_id_idx").on(table.user_id),
    projectIdx: index("support_tickets_project_id_idx").on(table.project_id),
    statusIdx: index("support_tickets_status_idx").on(table.status),
    createdAtIdx: index("support_tickets_created_at_idx").on(table.created_at),
  })
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey().notNull(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "CASCADE" }),
    client_id: text("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "CASCADE" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    projectIdx: index("reviews_project_id_idx").on(table.project_id),
    clientIdx: index("reviews_client_id_idx").on(table.client_id),
    projectClientIdx: uniqueIndex("reviews_project_client_idx").on(
      table.project_id,
      table.client_id
    ),
  })
);

export const escrowHolds = sqliteTable(
  "escrow_holds",
  {
    id: text("id").primaryKey().notNull(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "CASCADE" }),
    payment_id: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "CASCADE" }),
    amount: integer("amount").notNull(), // cents
    status: text("status", { enum: ["HELD", "RELEASED", "REFUNDED"] })
      .notNull()
      .default("HELD"),
    released_at: integer("released_at", { mode: "timestamp" }),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    projectIdx: index("escrow_holds_project_id_idx").on(table.project_id),
    statusIdx: index("escrow_holds_status_idx").on(table.status),
  })
);

export const messageReadReceipts = sqliteTable(
  "message_read_receipts",
  {
    id: text("id").primaryKey().notNull(),
    message_id: text("message_id")
      .notNull()
      .references(() => projectMessages.id, { onDelete: "CASCADE" }),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "CASCADE" }),
    read_at: integer("read_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    messageIdx: index("message_read_receipts_message_id_idx").on(table.message_id),
    userIdx: index("message_read_receipts_user_id_idx").on(table.user_id),
    messageUserIdx: uniqueIndex("message_read_receipts_message_user_idx").on(
      table.message_id,
      table.user_id
    ),
  })
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").references(() => users.id, { onDelete: "SET NULL" }),
    action: text("action").notNull(),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id"),
    metadata: text("metadata"),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    created_at: integer("created_at", { mode: "timestamp" }).notNull().default(Date.now()),
  },
  (table) => ({
    userIdx: index("audit_logs_user_id_idx").on(table.user_id),
    entityIdx: index("audit_logs_entity_idx").on(table.entity_type, table.entity_id),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.created_at),
    actionIdx: index("audit_logs_action_idx").on(table.action),
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  projectsAsClient: many(projects, { relationName: "client" }),
  projectsAsDeveloper: many(projects, { relationName: "developer" }),
  licenses: many(licenses),
  messages: many(projectMessages),
  tickets: many(supportTickets),
  reviews: many(reviews),
  auditLogs: many(auditLogs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.user_id], references: [users.id] }),
}));

export const escrowHoldsRelations = relations(escrowHolds, ({ one }) => ({
  project: one(projects, { fields: [escrowHolds.project_id], references: [projects.id] }),
  payment: one(payments, { fields: [escrowHolds.payment_id], references: [payments.id] }),
}));

export const messageReadReceiptsRelations = relations(messageReadReceipts, ({ one }) => ({
  message: one(projectMessages, { fields: [messageReadReceipts.message_id], references: [projectMessages.id] }),
  user: one(users, { fields: [messageReadReceipts.user_id], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(users, { fields: [projects.client_id], references: [users.id], relationName: "client" }),
  developer: one(users, { fields: [projects.developer_id], references: [users.id], relationName: "developer" }),
  payments: many(payments),
  licenses: many(licenses),
  messages: many(projectMessages),
  tickets: many(supportTickets),
  reviews: many(reviews),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  project: one(projects, { fields: [payments.project_id], references: [projects.id] }),
}));

export const licensesRelations = relations(licenses, ({ one }) => ({
  project: one(projects, { fields: [licenses.project_id], references: [projects.id] }),
  client: one(users, { fields: [licenses.client_id], references: [users.id] }),
}));

export const projectMessagesRelations = relations(projectMessages, ({ one }) => ({
  project: one(projects, { fields: [projectMessages.project_id], references: [projects.id] }),
  sender: one(users, { fields: [projectMessages.sender_id], references: [users.id] }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  user: one(users, { fields: [supportTickets.user_id], references: [users.id] }),
  project: one(projects, { fields: [supportTickets.project_id], references: [projects.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  project: one(projects, { fields: [reviews.project_id], references: [projects.id] }),
  client: one(users, { fields: [reviews.client_id], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.user_id], references: [users.id] }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertSessionSchema = createInsertSchema(sessions);
export const selectSessionSchema = createSelectSchema(sessions);
export const insertProjectSchema = createInsertSchema(projects);
export const selectProjectSchema = createSelectSchema(projects);
export const insertPaymentSchema = createInsertSchema(payments);
export const selectPaymentSchema = createSelectSchema(payments);
export const insertLicenseSchema = createInsertSchema(licenses);
export const selectLicenseSchema = createSelectSchema(licenses);
export const insertProjectMessageSchema = createInsertSchema(projectMessages);
export const selectProjectMessageSchema = createSelectSchema(projectMessages);
export const insertSupportTicketSchema = createInsertSchema(supportTickets);
export const selectSupportTicketSchema = createSelectSchema(supportTickets);
export const insertReviewSchema = createInsertSchema(reviews);
export const selectReviewSchema = createSelectSchema(reviews);
export const insertAuditLogSchema = createInsertSchema(auditLogs);
export const selectAuditLogSchema = createSelectSchema(auditLogs);
export const insertEscrowHoldSchema = createInsertSchema(escrowHolds);
export const selectEscrowHoldSchema = createSelectSchema(escrowHolds);
export const insertMessageReadReceiptSchema = createInsertSchema(messageReadReceipts);
export const selectMessageReadReceiptSchema = createSelectSchema(messageReadReceipts);
