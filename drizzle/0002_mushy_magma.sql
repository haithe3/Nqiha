ALTER TABLE `bookings` ADD `slotKey` varchar(80);--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_slotKey_unique` UNIQUE(`slotKey`);