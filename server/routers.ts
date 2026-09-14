import { and, count, eq } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { createBooking, getBookingById, getDb, listBookings, listBookingsByUser, updateBookingStatus } from "./db";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { clearLocalSession, createLocalSession, createLocalUser, ensureOwner, verifyLocalCredentials } from "./localAuth";
import { bookings, users, visitorEvents } from "../drizzle/schema";

export const BOOKING_TIMES = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"] as const;
const recentBookingAttempts = new Map<string, number>();

const bookingInput = z.object({
  customerName: z.string().min(2).max(160),
  phone: z.string().min(8).max(32).transform(value => value.replace(/[\s-]/g, "")).pipe(z.string().regex(/^(0|\+213)[5-7]\d{8}$/, "رقم الهاتف غير صالح")),
  service: z.string().min(2).max(120),
  carType: z.string().min(2).max(80),
  bookingDate: z.string().date().refine(value => value >= new Date().toISOString().slice(0, 10), "لا يمكن اختيار تاريخ سابق"),
  bookingTime: z.string().transform(value => ({ "10:00 صباحًا": "10:00", "12:00 ظهرًا": "12:00", "02:00 مساءً": "14:00", "04:00 مساءً": "16:00" }[value] ?? value)).pipe(z.enum(BOOKING_TIMES)),
  address: z.string().min(3),
  latitude: z.string().max(32).optional(),
  longitude: z.string().max(32).optional(),
  paymentMethod: z.enum(["cash", "cib", "baridimob"]),
});

const servicePrices: Record<string, number> = { "الغسيل السريع": 800, "الباقة الكاملة": 1500, "العناية الفاخرة": 2500 };
const carMultipliers: Record<string, number> = { "اقتصادية": 1, "سيدان": 1.15, "SUV / 4×4": 1.35 };
const calculateTravelFee = (latitude?: string, longitude?: string) => {
  if (!latitude || !longitude) return 0;
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat - 36.7538), dLng = toRad(lng - 3.0588);
  const distance = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(toRad(36.7538)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2));
  return distance <= 5 ? 0 : distance <= 12 ? 300 : distance <= 20 ? 600 : 900;
};
export const calculateBookingTotal = (service: string, carType: string, latitude?: string, longitude?: string) => {
  const basePrice = servicePrices[service];
  const multiplier = carMultipliers[carType];
  if (!basePrice || !multiplier) throw new TRPCError({ code: "BAD_REQUEST", message: "الخدمة أو نوع السيارة غير صالح" });
  return { travelFee: calculateTravelFee(latitude, longitude), totalPrice: Math.round((basePrice * multiplier) / 50) * 50 + calculateTravelFee(latitude, longitude) };
};

const adminOnly = protectedProcedure.use(({ ctx, next }) => {
  if (!["owner", "staff", "admin"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
const ownerOnly = protectedProcedure.use(({ ctx, next }) => {
  if (!["owner", "admin"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

export const appRouter = router({
  system: systemRouter,
  analytics: router({
    visit: publicProcedure.mutation(async () => { const db = await getDb(); if (db) await db.insert(visitorEvents).values({ event: "visit" }); return { success: true } as const; }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure.input(z.object({ name: z.string().min(2).max(160), email: z.string().email(), password: z.string().min(8).max(128), phone: z.string().regex(/^(0|\+213)[5-7]\d{8}$/) })).mutation(async ({ ctx, input }) => {
      const id = await createLocalUser(input);
      const user = await verifyLocalCredentials(input.email, input.password);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await createLocalSession(id, ctx.res, ctx.req);
      return { success: true, user } as const;
    }),
    login: publicProcedure.input(z.object({ usernameOrEmail: z.string().min(3).max(320), password: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
      const user = await verifyLocalCredentials(input.usernameOrEmail, input.password);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "بيانات الدخول غير صحيحة" });
      await createLocalSession(user.id, ctx.res, ctx.req);
      return { success: true, user } as const;
    }),
    localLogout: publicProcedure.mutation(async ({ ctx }) => { await clearLocalSession(ctx.req, ctx.res); return { success: true } as const; }),
    logout: publicProcedure.mutation(async ({ ctx }) => { ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 }); await clearLocalSession(ctx.req, ctx.res); return { success: true } as const; }),
  }),
  bookings: router({
    create: publicProcedure.input(bookingInput).mutation(async ({ ctx, input }) => {
      const ip = String(ctx.req.headers["x-forwarded-for"] ?? ctx.req.ip ?? "unknown").split(",")[0];
      const lastAttempt = recentBookingAttempts.get(ip) ?? 0;
      if (Date.now() - lastAttempt < 5000) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "انتظر قليلاً قبل إرسال حجز جديد" });
      recentBookingAttempts.set(ip, Date.now());
      const { travelFee, totalPrice } = calculateBookingTotal(input.service, input.carType, input.latitude, input.longitude);
      const id = await createBooking({ ...input, userId: ctx.user?.id, travelFee, totalPrice, slotKey: `${input.bookingDate}|${input.bookingTime}`, status: "pending" });
      return { id, success: true } as const;
    }),
    mine: protectedProcedure.query(async ({ ctx }) => { const rows = await listBookingsByUser(ctx.user.id); return { bookings: rows, loyaltyPoints: rows.filter(booking => booking.status === "completed").length * 100 }; }),
    track: publicProcedure.input(z.object({ reference: z.string().regex(/^NQIHA-\d{6}$/i) })).query(async ({ input }) => { const id = Number(input.reference.slice(6)); const booking = await getBookingById(id); if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "الحجز غير موجود" }); return booking; }),
    list: ownerOnly.query(() => listBookings()),
    staffList: adminOnly.query(async ({ ctx }) => { const rows = await listBookings(); if (["owner", "admin"].includes(ctx.user.role)) return rows; return rows.map(({ totalPrice: _totalPrice, paymentMethod: _paymentMethod, ...booking }) => booking); }),
    updateStatus: adminOnly.input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "confirmed", "completed", "cancelled"]) })).mutation(({ input }) => updateBookingStatus(input.id, input.status)),
    assignStaff: adminOnly.input(z.object({ id: z.number().int().positive(), assignedStaffId: z.number().int().positive().nullable() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.update(bookings).set({ assignedStaffId: input.assignedStaffId }).where(eq(bookings.id, input.id)); return { success: true } as const; }),
  }),
  admin: router({
    bootstrap: ownerOnly.mutation(async () => { await ensureOwner(); return { username: process.env.OWNER_USERNAME ?? "naqiha_mobile_wash" }; }),
    staff: ownerOnly.query(async () => { const db = await getDb(); if (!db) return []; return db.select({ id: users.id, name: users.name, username: users.username, phone: users.phone, isActive: users.isActive }).from(users).where(eq(users.role, "staff")); }),
    createStaff: ownerOnly.input(z.object({ name: z.string().min(2).max(160), username: z.string().min(3).max(80), password: z.string().min(8).max(128), phone: z.string().regex(/^(0|\+213)[5-7]\d{8}$/) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); const passwordHash = await bcrypt.hash(input.password, 12); const result = await db.insert(users).values({ name: input.name, username: input.username, passwordHash, phone: input.phone, role: "staff", loginMethod: "local", isActive: 1 }); return { id: Number(result[0].insertId), success: true } as const; }),
    toggleStaff: ownerOnly.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await db.update(users).set({ isActive: input.isActive ? 1 : 0 }).where(and(eq(users.id, input.id), eq(users.role, "staff"))); return { success: true } as const; }),
    conversion: ownerOnly.query(async () => { const db = await getDb(); if (!db) return { visitors: 0, bookings: 0, rate: 0 }; const [visitors, bookingCount] = await Promise.all([db.select({ value: count() }).from(visitorEvents).where(eq(visitorEvents.event, "visit")), db.select({ value: count() }).from(bookings)]); const visitorCount = Number(visitors[0]?.value ?? 0); const totalBookings = Number(bookingCount[0]?.value ?? 0); return { visitors: visitorCount, bookings: totalBookings, rate: visitorCount ? Math.round((totalBookings / visitorCount) * 1000) / 10 : 0 }; }),
  }),
});

export type AppRouter = typeof appRouter;
