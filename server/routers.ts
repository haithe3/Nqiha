import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { createBooking, listBookings, updateBookingStatus } from "./db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const bookingInput = z.object({
  customerName: z.string().min(2).max(160),
  phone: z.string().min(8).max(32),
  service: z.string().min(2).max(120),
  carType: z.string().min(2).max(80),
  bookingDate: z.string().min(4).max(24),
  bookingTime: z.string().min(2).max(40),
  address: z.string().min(3),
  latitude: z.string().max(32).optional(),
  longitude: z.string().max(32).optional(),
  travelFee: z.number().int().min(0).max(100000),
  totalPrice: z.number().int().positive(),
  paymentMethod: z.enum(["cash", "cib", "baridimob"]),
});

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
      const id = await createBooking({ ...input, status: "pending" });
      return { id, success: true } as const;
    }),
    list: adminOnly.query(() => listBookings()),
    updateStatus: adminOnly.input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "confirmed", "completed", "cancelled"]) })).mutation(({ input }) => updateBookingStatus(input.id, input.status)),
  }),
});

export type AppRouter = typeof appRouter;
