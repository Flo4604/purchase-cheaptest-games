CREATE TABLE `User` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`authHash` text NOT NULL,
	`saltAuth` text NOT NULL,
	`saltKek` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_unique` ON `User` (`email`);--> statement-breakpoint
DROP INDEX IF EXISTS "Account_username_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "ActivatedKey_productKey_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "User_email_unique";--> statement-breakpoint
ALTER TABLE `Account` ALTER COLUMN "accessToken" TO "accessToken" text;--> statement-breakpoint
CREATE UNIQUE INDEX `Account_username_unique` ON `Account` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `ActivatedKey_productKey_unique` ON `ActivatedKey` (`productKey`);--> statement-breakpoint
ALTER TABLE `Account` ALTER COLUMN "refreshToken" TO "refreshToken" text;--> statement-breakpoint
ALTER TABLE `Account` ADD `userId` integer REFERENCES User(id);--> statement-breakpoint
ALTER TABLE `Account` ADD `wrappedDek` text;--> statement-breakpoint
ALTER TABLE `Account` ADD `dekNonce` text;--> statement-breakpoint
ALTER TABLE `Account` ADD `encryptedRefreshToken` text;--> statement-breakpoint
ALTER TABLE `Account` ADD `tokenNonce` text;