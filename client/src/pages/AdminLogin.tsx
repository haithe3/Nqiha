import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function AdminLogin() {
  const utils = trpc.useUtils();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.login.useMutation({ onSuccess: async result => { await utils.auth.me.invalidate(); window.location.href = result.user.role === "customer" ? "/account" : "/admin"; } });
  return <main dir="rtl" className="account-page flex min-h-screen items-center justify-center px-4 py-10"><div className="w-full max-w-md"><a href="/" className="account-back-link"><ArrowRight size={17} /> العودة للرئيسية</a><div className="account-card mt-8"><div className="account-logo"><ShieldCheck size={25} /></div><h1 className="mt-6 text-3xl font-black text-[#073b63]">دخول الإدارة</h1><p className="mt-2 leading-7 text-[#708695]">هذه الصفحة مخصصة للمالك والموظفين فقط.</p><form className="mt-8 space-y-4" onSubmit={event => { event.preventDefault(); login.mutate({ usernameOrEmail, password }); }}><label className="account-label">اسم المستخدم أو البريد الإلكتروني<input dir="ltr" className="text-left" value={usernameOrEmail} onChange={event => setUsernameOrEmail(event.target.value)} autoComplete="username" required /></label><label className="account-label">كلمة السر<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label><Button disabled={login.isPending} className="mt-3 h-12 w-full rounded-full bg-[#073b63] font-black">{login.isPending ? "جارٍ الدخول…" : "دخول"}</Button></form>{login.error && <p role="alert" className="mt-4 text-center text-xs font-bold text-red-600">{login.error.message}</p>}</div></div></main>;
}
