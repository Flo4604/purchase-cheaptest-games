CREATE TABLE `Account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`limit` text DEFAULT '0' NOT NULL,
	`usage` text DEFAULT 'max' NOT NULL,
	`maxPrice` real DEFAULT 0 NOT NULL,
	`priceOptionsFlag` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'buy' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Account_username_unique` ON `Account` (`username`);--> statement-breakpoint
CREATE TABLE `ActivatedKey` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productKey` text NOT NULL,
	`accountId` integer NOT NULL,
	`activatedAt` integer NOT NULL,
	`success` integer NOT NULL,
	`packageId` text,
	`errorMessage` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ActivatedKey_productKey_unique` ON `ActivatedKey` (`productKey`);--> statement-breakpoint
CREATE TABLE `App` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`subId` integer NOT NULL,
	`snr` text NOT NULL,
	`originatingSnr` text NOT NULL,
	`price` real NOT NULL,
	`limited` integer DEFAULT false NOT NULL,
	`hasTradingCards` integer DEFAULT false NOT NULL,
	`isBundle` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `BundleApp` (
	`bundleId` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`appId` integer NOT NULL
);
