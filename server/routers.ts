import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { createBooking, listBookings, updateBookingStatus } from "./db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const bookingInput = z.object({
  customerName: z.string().min(2).max(160),
  phone: z.string().min(8).max(32).transform(value => value.replace(/[\s-]/g, "")).pipe(z.string().regex(/^(0|\+213)[5-7]\d{8}$/, "رقم الهاتف غير صالح")),
  service: z.string().min(2).max(120),
  carType: z.string().min(2).max(80),
  bookingDate: z.string().date().refine(value => value >= new Date().toISOString().slice(0, 10), "لا يمكن اختيار تاريخ سابق"),
  bookingTime: z.enum(["10:00 صباحًا", "12:00 ظهرًا", "02:00 مساءً", "04:00 مساءً"]),
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
  const travelFee = calculateTravelFee(latitude, longitude);
  return { travelFee, totalPrice: Math.round((basePrice * multiplier) / 50) * 50 + travelFee };
};

const adminOnly = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  bookings: router({
    create: publicProcedure.input(bookingInput).mutation(async ({ input }) => {
      const { travelFee, totalPrice } = calculateBookingTotal(input.service, input.carType, input.latitude, input.longitude);
      const id = await createBooking({ ...input, travelFee, totalPrice, slotKey: `${input.bookingDate}|${input.bookingTime}`, status: "pending" });
      return { id, success: true } as const;
    }),
    list: adminOnly.query(() => listBookings()),
    updateStatus: adminOnly.input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "confirmed", "completed", "cancelled"]) })).mutation(({ input }) => updateBookingStatus(input.id, input.status)),
  }),
});

export type AppRouter = typeof appRouter;
