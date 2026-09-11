import { useState } from "react";
import { ArrowLeft, Check, Clock3, Download, Droplets, MapPin, Menu, Phone, ShieldCheck, Sparkles, Star, Truck, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";

const services = [
  { title: "الغسيل السريع", desc: "غسيل خارجي بلمعة منعشة", details: ["غسيل خارجي كامل", "تنظيف الزجاج والمرايا", "تجفيف ولمعان سريع"], price: "800 دج", time: "30 دقيقة", icon: Droplets, accent: "aqua" },
  { title: "الباقة الكاملة", desc: "خارجي + داخلي + تعقيم", details: ["كل ما في الغسيل السريع", "تنظيف المقصورة والزجاج", "شفط الغبار والمقاعد", "تلميع الطابلو"], price: "1,500 دج", time: "60 دقيقة", icon: Sparkles, accent: "navy", featured: true },
  { title: "العناية الفاخرة", desc: "تفصيل شامل ولمعان عميق", details: ["كل ما في الباقة الكاملة", "تلميع عميق للهيكل", "تنظيف وتعطير داخلي", "حماية ولمعان يدوم"], price: "2,500 دج", time: "90 دقيقة", icon: Star, accent: "gold" },
];

const carTypes = [
  { label: "اقتصادية", hint: "i10، Clio…", multiplier: 1 },
  { label: "سيدان", hint: "Symbol، Logan…", multiplier: 1.15 },
  { label: "SUV / 4×4", hint: "Duster، Tucson…", multiplier: 1.35 },
];

const steps = ["الخدمة", "الموعد", "الموقع"];

const calculateTravelFee = (latitude: number, longitude: number) => {
  const baseLatitude = 36.7538;
  const baseLongitude = 3.0588;
  const earthRadius = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(latitude - baseLatitude);
  const longitudeDelta = toRadians(longitude - baseLongitude);
  const distance = 2 * earthRadius * Math.asin(Math.sqrt(Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(baseLatitude)) * Math.cos(toRadians(latitude)) * Math.sin(longitudeDelta / 2) ** 2));
  if (distance <= 5) return 0;
  if (distance <= 12) return 300;
  if (distance <= 20) return 600;
  return 900;
};

export default function Home() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedService, setSelectedService] = useState(services[1].title);
  const [selectedCar, setSelectedCar] = useState(carTypes[0].label);
  const [confirmed, setConfirmed] = useState(false);
  const [bookingReference, setBookingReference] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [bookingForm, setBookingForm] = useState({ customerName: "", phone: "", address: "", bookingDate: new Date().toISOString().slice(0, 10), bookingTime: "10:00 صباحًا", paymentMethod: "cash" as "cash" | "cib" | "baridimob" });
  const createBookingMutation = trpc.bookings.create.useMutation();

  const activeService = services.find(service => service.title === selectedService) ?? services[1];
  const activeCar = carTypes.find(car => car.label === selectedCar) ?? carTypes[0];
  const priceValue = Number(activeService.price.replace(/[^0-9]/g, "")) * activeCar.multiplier;
  const displayPrice = `${Math.round(priceValue / 50) * 50} دج`;
  const progress = confirmed ? 100 : ((step + 1) / steps.length) * 100;
  const travelFee = location ? calculateTravelFee(location.latitude, location.longitude) : 0;
  const totalWithTravel = Math.round(priceValue / 50) * 50 + travelFee;
  const whatsappMessage = encodeURIComponent(`السلام عليكم، أريد تأكيد حجز من نقيها.
الخدمة: ${selectedService}
السيارة: ${selectedCar}
الاسم: ${bookingForm.customerName || "غير مذكور"}
الهاتف: ${bookingForm.phone || "غير مذكور"}
التاريخ والوقت: ${bookingForm.bookingDate} - ${bookingForm.bookingTime}
الموقع: ${bookingForm.address || "سيتم تحديده"}
التنقل: ${travelFee} دج
المجموع: ${totalWithTravel} دج
الدفع: ${bookingForm.paymentMethod === "cash" ? "كاش" : bookingForm.paymentMethod === "cib" ? "CIB" : "بريدي موب"}`);
  const whatsappUrl = `https://wa.me/213555000000?text=${whatsappMessage}`;

  const updateForm = (field: keyof typeof bookingForm, value: string) => setBookingForm(current => ({ ...current, [field]: value }));
  const useMyLocation = () => navigator.geolocation?.getCurrentPosition(({ coords }) => {
    setLocation({ latitude: coords.latitude, longitude: coords.longitude });
    updateForm("address", `موقعي الحالي (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`);
  });
  const pinMapLocation = (map: google.maps.Map) => {
    setMapReady(true);
    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      const latitude = event.latLng.lat();
      const longitude = event.latLng.lng();
      setLocation({ latitude, longitude });
      new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: latitude, lng: longitude }, title: "عنوان العميل" });
      new google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
        if (status === "OK" && results?.[0]) updateForm("address", results[0].formatted_address);
        else updateForm("address", `الموقع المثبت (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`);
      });
    });
  };
  const downloadReceipt = () => window.print();

  const submitBooking = async () => {
    try {
      const result = await createBookingMutation.mutateAsync({ customerName: bookingForm.customerName.trim(), phone: bookingForm.phone.trim(), service: selectedService, carType: selectedCar, bookingDate: bookingForm.bookingDate, bookingTime: bookingForm.bookingTime as "10:00 صباحًا" | "12:00 ظهرًا" | "02:00 مساءً" | "04:00 مساءً", address: bookingForm.address.trim(), latitude: location ? String(location.latitude) : undefined, longitude: location ? String(location.longitude) : undefined, paymentMethod: bookingForm.paymentMethod });
      setBookingReference(`NQIHA-${String(result.id).padStart(6, "0")}`);
      setConfirmed(true);
    } catch {
      // The mutation error is rendered below without exposing server details.
    }
  };

  const startBooking = (service = services[1].title) => {
    setSelectedService(service);
    setSelectedCar(carTypes[0].label);
    setConfirmed(false);
    setBookingReference(null);
    setStep(0);
    setBookingOpen(true);
  };

  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-[#f7fbfc] text-[#073b63]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/50 bg-white/85 backdrop-blur-xl">
        <div className="container flex h-[76px] items-center justify-between">
          <a href="#top" className="flex items-center gap-3" aria-label="نقيها">
            <div className="brand-mark logo-image"><img src="/manus-storage/nqiha-logo-two-drops_c8e9d674.png" alt="شعار نقيها بقطرتين متداخلتين" /></div>
            <div className="leading-none"><div className="text-[23px] font-black tracking-tight">نقيها</div><div className="mt-1 text-[9px] font-bold tracking-[0.22em] text-[#35aebd]">NQIHA • MOBILE WASH</div></div>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-bold text-[#537188] md:flex">
            <a href="#services" className="transition hover:text-[#0c92a4]">خدماتنا</a><a href="#how" className="transition hover:text-[#0c92a4]">كيف نخدمك؟</a><a href="#why" className="transition hover:text-[#0c92a4]">لماذا نقيها؟</a>
          </nav>
          <div className="flex items-center gap-3"><a href="tel:+213555000000" className="hidden items-center gap-2 text-sm font-bold text-[#537188] lg:flex"><Phone size={16} /> 0555 00 00 00</a><Button onClick={() => startBooking()} className="rounded-full bg-[#073b63] px-5 font-bold shadow-lg shadow-[#073b63]/15 hover:bg-[#0b527f]">احجز الآن <ArrowLeft className="mr-2" size={16} /></Button><button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-full p-2 md:hidden" aria-label="القائمة">{mobileOpen ? <X /> : <Menu />}</button></div>
        </div>
        {mobileOpen && <div className="border-t border-[#e4eff2] bg-white px-6 py-5 md:hidden"><div className="flex flex-col gap-5 text-sm font-bold"><a href="#services" onClick={() => setMobileOpen(false)}>خدماتنا</a><a href="#how" onClick={() => setMobileOpen(false)}>كيف نخدمك؟</a><a href="#why" onClick={() => setMobileOpen(false)}>لماذا نقيها؟</a></div></div>}
      </header>

      <section id="top" className="hero-grid relative pt-[76px]">
        <div className="container grid min-h-[650px] items-center gap-12 py-20 lg:grid-cols-[1.04fr_.96fr]">
          <div className="relative z-10 max-w-[650px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#a9e3e6] bg-white/80 px-4 py-2 text-xs font-bold text-[#118b9b] shadow-sm"><span className="pulse-dot" /> خدمة متنقلة تصلك أينما كنت</div>
            <h1 className="max-w-[640px] text-5xl font-black leading-[1.12] tracking-tight text-[#073b63] sm:text-7xl">سيارتك تستاهل<br /><span className="text-[#22a9b7]">لمعة نقيها.</span></h1>
            <p className="mt-7 max-w-[530px] text-lg leading-9 text-[#587488]">غسيل احترافي لسيارتك عند بابك. احجز موعدك في دقائق، وخلي النظافة تجيك.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4"><Button onClick={() => startBooking()} className="h-14 rounded-full bg-[#073b63] px-7 text-base font-black shadow-xl shadow-[#073b63]/20 hover:-translate-y-0.5 hover:bg-[#0b527f]">احجز غسيل سيارتك <ArrowLeft className="mr-3" size={19} /></Button><a href="#services" className="flex h-14 items-center gap-2 rounded-full border border-[#c8e0e5] bg-white px-6 text-sm font-bold text-[#073b63] transition hover:border-[#35aebd]">اكتشف خدماتنا <ChevronDown size={17} /></a></div>
            <div className="mt-10 flex flex-wrap gap-6 text-xs font-bold text-[#617d90]"><span className="flex items-center gap-2"><ShieldCheck size={18} className="text-[#21a9b6]" /> منتجات آمنة</span><span className="flex items-center gap-2"><Clock3 size={18} className="text-[#21a9b6]" /> نلتزم بالموعد</span><span className="flex items-center gap-2"><Star size={18} fill="#f3b94b" className="text-[#f3b94b]" /> +4.9 تقييم العملاء</span></div>
          </div>
          <div className="relative hidden min-h-[450px] lg:block"><div className="hero-orb absolute right-[8%] top-[8%] h-[385px] w-[385px] rounded-full" /><div className="car-card absolute right-[13%] top-[14%] flex h-[420px] w-[430px] items-center justify-center rounded-[44px] bg-gradient-to-br from-[#0b5079] via-[#073b63] to-[#062d4e] shadow-2xl shadow-[#073b63]/25"><div className="absolute inset-0 rounded-[44px] opacity-20 dot-pattern" /><div className="relative text-center"><div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-[#35c3d0]/20 text-[#5ee4ed]"><Droplets size={70} strokeWidth={1.2} /></div><div className="mt-5 text-2xl font-black text-white">نقيها توصلك</div><div className="mt-2 text-sm text-[#bceef1]">نظافة لامعة… بدون ما تتحرك</div></div><div className="floating-badge absolute -bottom-5 -right-7 rounded-2xl bg-white p-4 shadow-xl"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#e8fafb] p-2 text-[#159aaa]"><Truck size={23} /></div><div><div className="text-xs font-bold text-[#6c8290]">نجيك حتى للدار</div><div className="mt-1 text-sm font-black text-[#073b63]">خدمة متنقلة 100%</div></div></div></div></div></div>
        </div>
      </section>

      <section id="services" className="container py-24"><div className="mb-12 flex flex-wrap items-end justify-between gap-5"><div><p className="section-kicker">خدماتنا</p><h2 className="mt-3 text-4xl font-black tracking-tight">اختار اللمعة اللي تناسبك</h2></div><p className="max-w-[370px] text-sm leading-7 text-[#688294]">كل خدمة نقدمها بعناية واحتراف، أينما كنت في المدينة.</p></div><div className="grid gap-5 md:grid-cols-3">{services.map((service) => { const Icon = service.icon; return <article key={service.title} className={`service-card relative rounded-[28px] border bg-white p-7 ${service.featured ? "featured-card border-[#35c3d0] shadow-2xl shadow-[#35c3d0]/15" : "border-[#e1eef1] shadow-sm"}`}><div className={`service-icon ${service.accent}`}><Icon size={25} /></div>{service.featured && <span className="absolute left-6 top-6 rounded-full bg-[#e9fbfc] px-3 py-1 text-[10px] font-black text-[#1295a2]">الأكثر طلباً</span>}<h3 className="mt-7 text-xl font-black">{service.title}</h3><p className="mt-2 text-sm text-[#708695]">{service.desc}</p><ul className="service-details mt-5 space-y-2">{service.details.map(detail => <li key={detail} className="flex items-start gap-2 text-sm text-[#527183]"><Check size={16} className="mt-0.5 shrink-0 text-[#168b9d]" /> <span>{detail}</span></li>)}</ul><div className="mt-7 flex items-end justify-between border-t border-[#edf3f4] pt-5"><div><div className="text-2xl font-black text-[#073b63]">{service.price}</div><div className="mt-1 flex items-center gap-1 text-xs text-[#8297a2]"><Clock3 size={13} /> {service.time}</div></div><Button onClick={() => startBooking(service.title)} variant="outline" className="rounded-full border-[#cfe5e9] font-bold text-[#073b63] hover:bg-[#eafafa]">احجز</Button></div></article> })}</div></section>

      <section id="how" className="bg-[#073b63] py-24 text-white"><div className="container"><div className="grid gap-14 lg:grid-cols-[.7fr_1.3fr] lg:items-center"><div><p className="section-kicker light">بكل بساطة</p><h2 className="mt-3 text-4xl font-black leading-tight">ثلاث خطوات<br /><span className="text-[#5ee4ed]">وتصير تلمع.</span></h2><p className="mt-5 max-w-[330px] text-sm leading-7 text-[#b5d0d9]">ما تحتاجش تبدل برنامجك. نحن نجيك في الوقت والمكان اللي يناسبك.</p></div><div className="grid gap-4 sm:grid-cols-3">{[["01","احجز موعدك","اختار الخدمة والوقت المناسب لك"],["02","نجيك لمكانك","فريقنا يوصلك بمعداته كاملة"],["03","استلم سيارتك","استمتع بلمعة تدوم أطول"]].map(([number,title,desc]) => <div key={number} className="step-card rounded-3xl border border-white/10 bg-white/[.06] p-6"><div className="text-4xl font-black text-[#48cbd5]/70">{number}</div><h3 className="mt-10 text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-[#b5d0d9]">{desc}</p></div>)}</div></div></div></section>

      <section id="why" className="container py-24"><div className="grid gap-12 lg:grid-cols-2 lg:items-center"><div><p className="section-kicker">لماذا نقيها؟</p><h2 className="mt-3 text-4xl font-black leading-tight">لأن وقتك أغلى<br />من طابور المغاسل.</h2><p className="mt-5 max-w-[460px] leading-8 text-[#688294]">نقدم لك تجربة عناية مريحة وموثوقة، بتفاصيل صغيرة تصنع فرقًا كبيرًا في كل زيارة.</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="feature-item"><Check /> عمال غسيل محترفون</div><div className="feature-item"><Check /> مواد صديقة للبيئة</div><div className="feature-item"><Check /> حجز سريع ومرن</div><div className="feature-item"><Check /> ضمان رضاك</div></div></div><div className="rounded-[36px] bg-[#e7f8fa] p-8 sm:p-12"><div className="flex items-center gap-1 text-[#f2b63f]">{[1,2,3,4,5].map(i => <Star key={i} size={19} fill="currentColor" />)}</div><blockquote className="mt-5 text-2xl font-black leading-[1.5] text-[#073b63]">"خدمة ممتازة، جاوني للبيرو في الوقت ونظفوا السيارة كيما جديدة."</blockquote><div className="mt-7 flex items-center gap-3"><div className="avatar">م</div><div><div className="text-sm font-black">محمد ب.</div><div className="text-xs text-[#6e8b96]">عميل من الجزائر العاصمة</div></div></div></div></div></section>

      <footer className="border-t border-[#dfecef] bg-white"><div className="container flex flex-col gap-7 py-10 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3"><div className="brand-mark small logo-image"><img src="/manus-storage/nqiha-logo-two-drops_c8e9d674.png" alt="شعار نقيها بقطرتين متداخلتين" /></div><div><div className="font-black">نقيها</div><div className="text-xs text-[#7a919b]">النظافة تجيك</div></div></div><div className="text-sm text-[#7a919b]">© 2025 نقيها. كل الحقوق محفوظة.</div><a href="tel:+213555000000" className="flex items-center gap-2 text-sm font-bold text-[#073b63]"><Phone size={16} /> 0555 00 00 00</a></div></footer>

      {bookingOpen && <div className="modal-backdrop" onClick={() => setBookingOpen(false)}><div className="booking-modal" onClick={e => e.stopPropagation()}><div className="booking-progress-head"><span>تقدم الحجز</span><strong>{step === 0 ? "حوالي دقيقتين" : step === 1 ? "حوالي دقيقة" : "آخر خطوة"} · {Math.round(progress)}%</strong></div><div className="booking-progress-track"><div className="booking-progress-fill" style={{ width: `${progress}%` }} /></div><button onClick={() => setBookingOpen(false)} className="absolute left-5 top-5 rounded-full p-2 text-[#76909b] hover:bg-[#eef7f8]" aria-label="إغلاق"><X size={20} /></button>{confirmed ? <div className="py-7">
            <div className="text-center"><div className="success-logo-wrap"><img src="/manus-storage/nqiha-logo-two-drops_c8e9d674.png" alt="شعار نقيها" className="success-logo" /></div><div className="success-icon"><Check size={34} /></div><h2 className="mt-5 text-2xl font-black">تم استلام حجزك بنجاح!</h2><p className="mx-auto mt-2 max-w-[320px] text-sm leading-7 text-[#6b8592]">احتفظ بالرقم المرجعي. سنتواصل معك قريباً لتأكيد الموعد.</p></div>
            <div className="receipt-printable">
            <div className="mt-6 rounded-2xl border border-[#bce8eb] bg-[#effbfc] p-4 text-center"><div className="text-xs font-black text-[#527183]">الرقم المرجعي للحجز</div><div dir="ltr" className="mt-2 text-2xl font-black tracking-[0.12em] text-[#073b63]">{bookingReference ?? "—"}</div></div>
            <div className="mt-4 grid gap-3 rounded-2xl border border-[#e2eef0] bg-white p-4 text-sm"><div className="flex items-center justify-between gap-4"><span className="text-[#78909b]">الخدمة</span><strong>{selectedService}</strong></div><div className="flex items-center justify-between gap-4"><span className="text-[#78909b]">السيارة</span><strong>{selectedCar}</strong></div><div className="flex items-center justify-between gap-4"><span className="text-[#78909b]">التاريخ</span><strong dir="ltr">{bookingForm.bookingDate}</strong></div><div className="flex items-center justify-between gap-4"><span className="text-[#78909b]">الوقت</span><strong>{bookingForm.bookingTime}</strong></div><div className="flex items-start justify-between gap-4"><span className="text-[#78909b]">العنوان</span><strong className="max-w-[220px] text-left">{bookingForm.address}</strong></div><div className="flex items-center justify-between gap-4 border-t border-[#edf3f4] pt-3"><span className="font-bold text-[#78909b]">المجموع</span><strong className="text-lg text-[#073b63]">{totalWithTravel.toLocaleString()} دج</strong></div></div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button variant="outline" onClick={downloadReceipt} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border-[#35c3d0] px-4 text-sm font-black text-[#168b9d] hover:bg-[#effbfc]"><Download size={17} /> تحميل الإيصال PDF</Button><a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex h-11 flex-1 items-center justify-center rounded-full bg-[#20b85a] px-4 text-sm font-black text-white hover:bg-[#149b48]">إرسال التفاصيل عبر واتساب</a><Button onClick={() => setBookingOpen(false)} className="h-11 flex-1 rounded-full bg-[#073b63] px-7 font-bold">إغلاق</Button></div>
          </div> : <><div className="mb-7"><p className="section-kicker">حجز سريع</p><h2 className="mt-2 text-2xl font-black">احجز غسيل سيارتك</h2></div><div className="mb-8 flex items-center gap-2">{steps.map((s, i) => <div key={s} className="flex flex-1 items-center gap-2"><div className={`step-number ${i <= step ? "active" : ""}`}>{i + 1}</div><span className={`hidden text-xs font-bold sm:block ${i <= step ? "text-[#073b63]" : "text-[#9bb0ba]"}`}>{s}</span>{i < 2 && <div className={`h-px flex-1 ${i < step ? "bg-[#35c3d0]" : "bg-[#e1ecef]"}`} />}</div>)}</div><div key={step} className={`booking-step booking-step-${step} ${step > 0 ? "booking-step-forward" : ""}`}>{step === 0 && <div className="space-y-5"><div>{services.map(s => <button key={s.title} onClick={() => setSelectedService(s.title)} className={`booking-option ${selectedService === s.title ? "selected" : ""}`}><div><div className="font-black">{s.title}</div><div className="mt-1 text-xs text-[#7a909b]">{s.desc} · {s.time}</div></div><div className="font-black">{s.title === selectedService ? displayPrice : s.price}</div></button>)}</div><div><div className="mb-3 flex items-center justify-between"><span className="text-xs font-black text-[#527183]">نوع السيارة</span><span className="text-xs font-black text-[#1397a5]">السعر يتحدث تلقائيًا</span></div><div className="grid grid-cols-3 gap-2">{carTypes.map(car => <button key={car.label} onClick={() => setSelectedCar(car.label)} className={`car-option ${selectedCar === car.label ? "selected" : ""}`}><span className="font-black">{car.label}</span><small>{car.hint}</small></button>)}</div></div></div>}{step === 1 && <div className="grid gap-4"><label className="field-label">اختار اليوم<input type="date" value={bookingForm.bookingDate} onChange={event => updateForm("bookingDate", event.target.value)} /></label><label className="field-label">الوقت المناسب<select value={bookingForm.bookingTime} onChange={event => updateForm("bookingTime", event.target.value)}><option>10:00 صباحًا</option><option>12:00 ظهرًا</option><option>02:00 مساءً</option><option>04:00 مساءً</option></select></label></div>}{step === 2 && <div className="grid gap-4"><label className="field-label">الاسم الكامل<input value={bookingForm.customerName} onChange={event => updateForm("customerName", event.target.value)} placeholder="مثال: محمد بن علي" /></label><label className="field-label">رقم الهاتف<input value={bookingForm.phone} onChange={event => updateForm("phone", event.target.value)} placeholder="05 xx xx xx xx" /></label><label className="field-label">الموقع أو العنوان<input value={bookingForm.address} onChange={event => updateForm("address", event.target.value)} placeholder="أين نجيك؟" /></label><div className="location-row"><button type="button" onClick={useMyLocation} className="location-button"><MapPin size={17} /> استخدم موقعي الحالي</button><span>{location ? `رسوم التنقل: ${travelFee} دج` : "حدد موقعك لحساب التنقل"}</span></div><div className="payment-box"><div className="mb-3 text-xs font-black text-[#527183]">طريقة الدفع</div><div className="grid grid-cols-3 gap-2">{([["cash", "كاش"], ["cib", "CIB"], ["baridimob", "بريدي موب"]] as const).map(([value, label]) => <button type="button" key={value} onClick={() => updateForm("paymentMethod", value)} className={`payment-option ${bookingForm.paymentMethod === value ? "selected" : ""}`}>{label}</button>)}</div><div className="mt-3 flex items-center justify-between border-t border-[#e5eff1] pt-3 text-sm"><span className="font-bold text-[#6c8490]">المجموع</span><strong className="text-lg text-[#073b63]">{totalWithTravel} دج</strong></div></div></div>}</div><div className="mt-8 flex gap-3">{step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)} className="h-12 flex-1 rounded-full border-[#d5e6e9] font-bold">رجوع</Button>}<Button disabled={createBookingMutation.isPending || (step === 2 && (!bookingForm.customerName.trim() || !/^(0|\+213)[5-7][0-9]{8}$/.test(bookingForm.phone.replace(/[\s-]/g, "")) || !bookingForm.address.trim()))} onClick={() => step < 2 ? setStep(step + 1) : submitBooking()} className="h-12 flex-1 rounded-full bg-[#073b63] font-bold hover:bg-[#0b527f]">{createBookingMutation.isPending ? "جارٍ تأكيد الحجز…" : step < 2 ? "التالي" : "تأكيد الحجز"}<ArrowLeft className="mr-2" size={17} /></Button></div>{createBookingMutation.error && <p role="alert" className="mt-3 text-center text-xs font-bold text-red-600">{createBookingMutation.error.message.includes("موعد") ? createBookingMutation.error.message : "تعذر التحقق من بيانات الحجز. راجع الوقت ورقم الهاتف وحاول مجدداً."}</p>}</>}</div></div>}
    </main>
  );
}
