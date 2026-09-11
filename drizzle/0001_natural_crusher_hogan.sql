CREATE INDEX `bookings_schedule_idx` ON `bookings` (`bookingDate`,`bookingTime`,`status`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);