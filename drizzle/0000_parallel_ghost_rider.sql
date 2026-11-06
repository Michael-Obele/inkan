CREATE TABLE "ledger_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spend_request_id" uuid,
	"mandate_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"amount_currency" text DEFAULT 'USD' NOT NULL,
	"merchant_id" text,
	"paypal_id" text,
	"external_id" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandate" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"purpose" text NOT NULL,
	"allowed_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ceiling_cents" integer NOT NULL,
	"ceiling_currency" text DEFAULT 'USD' NOT NULL,
	"per_transaction_cap_cents" integer NOT NULL,
	"per_transaction_cap_currency" text DEFAULT 'USD' NOT NULL,
	"auto_approve_amount_cents" integer NOT NULL,
	"auto_approve_amount_currency" text DEFAULT 'USD' NOT NULL,
	"allowed_merchants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandate_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandate_id" text NOT NULL,
	"kind" text NOT NULL,
	"change" jsonb,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spend_request_id" uuid NOT NULL,
	"text" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandate_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"raw_request" text NOT NULL,
	"intent" jsonb,
	"amount_cents" integer NOT NULL,
	"amount_currency" text DEFAULT 'USD' NOT NULL,
	"merchant_id" text,
	"merchant_email" text,
	"paypal_order_id" text,
	"paypal_authorization_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verdict" text,
	"deciding_rule" text,
	"reason" text,
	"decided_by" text,
	"failure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ledger_event" ADD CONSTRAINT "ledger_event_spend_request_id_spend_request_id_fk" FOREIGN KEY ("spend_request_id") REFERENCES "public"."spend_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_event" ADD CONSTRAINT "ledger_event_mandate_id_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandate_event" ADD CONSTRAINT "mandate_event_mandate_id_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_spend_request_id_spend_request_id_fk" FOREIGN KEY ("spend_request_id") REFERENCES "public"."spend_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_request" ADD CONSTRAINT "spend_request_mandate_id_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_event_external_idx" ON "ledger_event" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "ledger_event_mandate_idx" ON "ledger_event" USING btree ("mandate_id","occurred_at");--> statement-breakpoint
CREATE INDEX "mandate_owner_idx" ON "mandate" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "mandate_event_mandate_idx" ON "mandate_event" USING btree ("mandate_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "spend_request_idempotency_idx" ON "spend_request" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "spend_request_mandate_idx" ON "spend_request" USING btree ("mandate_id","created_at");