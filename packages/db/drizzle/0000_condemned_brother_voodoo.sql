CREATE TABLE IF NOT EXISTS "Account" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"steamId" text NOT NULL,
	"username" text NOT NULL,
	"wrappedDek" text,
	"dekNonce" text,
	"encryptedRefreshToken" text,
	"tokenNonce" text,
	"cachedWalletBalance" real,
	"cachedWalletCurrency" text,
	"cachedOwnedCount" integer,
	"cachedAt" timestamp with time zone,
	"limit" text DEFAULT '0' NOT NULL,
	"usage" text DEFAULT 'max' NOT NULL,
	"maxPrice" real DEFAULT 0 NOT NULL,
	"priceOptionsFlag" integer DEFAULT 0 NOT NULL,
	"mode" text DEFAULT 'buy' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ActivatedKey" (
	"id" serial PRIMARY KEY NOT NULL,
	"productKey" text NOT NULL,
	"accountId" integer NOT NULL,
	"activatedAt" timestamp with time zone NOT NULL,
	"success" boolean NOT NULL,
	"packageId" text,
	"errorMessage" text,
	CONSTRAINT "ActivatedKey_productKey_unique" UNIQUE("productKey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "App" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subId" integer NOT NULL,
	"snr" text NOT NULL,
	"originatingSnr" text NOT NULL,
	"price" real NOT NULL,
	"limited" boolean DEFAULT false NOT NULL,
	"hasTradingCards" boolean DEFAULT false NOT NULL,
	"isBundle" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "BundleApp" (
	"bundleId" serial PRIMARY KEY NOT NULL,
	"appId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Job" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"paramsJson" text,
	"progressJson" text,
	"error" text,
	"createdAt" timestamp with time zone NOT NULL,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"steamId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "User_steamId_unique" UNIQUE("steamId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Job" ADD CONSTRAINT "Job_accountId_Account_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
