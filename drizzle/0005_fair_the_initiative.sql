CREATE TABLE `visitorEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visitorEvents_id` PRIMARY KEY(`id`)
);
