CREATE TABLE `Job` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`accountId` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`paramsJson` text,
	`progressJson` text,
	`error` text,
	`createdAt` integer NOT NULL,
	`finishedAt` integer,
	FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON UPDATE no action ON DELETE no action
);
