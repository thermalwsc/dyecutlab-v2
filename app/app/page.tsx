"use client";

import { useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "../../lib/supabase/browser";
import { intakeRows, savedToShown } from "../../lib/intakeMessages";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Footer, Header } from "../updates/SiteChrome";
import { MAX_CHAT_CHARS } from "../../lib/uploadRules";
import { questionKindFromText } from "../../lib/intakeQuestions";
import { readRememberedClient } from "../../lib/rememberedClient";
import { summaryRows } from "../../lib/intakeSummary";
import { toRequestHistory } from "../../lib/chatHistory";
import { PIECES_PER_UNIT, calculateProduction, roundOrderQuantity } from "../../lib/production";
import { uploadErrorMessage } from "../../lib/chatErrors";

type Stage = "home" | "capture" | "conversation";

type ClientData = {
  id: string | null;
  phone: string;
  email: string;
  marketingSms: boolean;
  /** The account that saved it, so another account never reuses it. */
  userId?: string;
};

const EMPTY_CLIENT: ClientData = {
  id: null,
  phone: "",
  email: "",
  marketingSms: false,
};

const REMEMBERED_CLIENT_KEY = "dyecutlab.rememberedClient";

type QuestionStep = "ai" | "reference" | "complete";

type ProjectData = {
  id: string | null;
  projectNumber: string | null;
  clientId: string | null;
  title: string;
  request: string;
  productType: string;
  units: number | null;
  quantity: number | null;
  useType: string;
  flavorCount: number;
  flavorSplit: number;
  artworkStatus: string;
  size: string;
  closure: string;
  status: string;
};

const EMPTY_PROJECT: ProjectData = {
  id: null,
  projectNumber: null,
  clientId: null,
  title: "Custom Packaging Project",
  request: "",
  productType: "",
  units: null,
  quantity: null,
  useType: "FLOWER",
  flavorCount: 0,
  flavorSplit: 0,
  artworkStatus: "",
  size: "",
  closure: "",
  status: "development",
};


function inferProductTypeFromText(text: string) {
  const value = text.toLowerCase();
  const parts: string[] = [];

  if (/\b(pouch|pouches|bag|bags|mylar)\b/.test(value)) parts.push("POUCH");
  if (/\b(box|boxes|carton|cartons)\b/.test(value)) parts.push("BOX");
  if (/\b(jar|jars)\b/.test(value)) parts.push("JAR");
  if (/\b(pre[\s-]?roll packaging|pre[\s-]?roll tube|joint tube)\b/.test(value)) parts.push("PRE-ROLL PACKAGING");
  if (/\b(display|counter display|pdq)\b/.test(value)) parts.push("DISPLAY");

  if (parts.length > 1) return parts.join(" + ");
  if (parts[0] === "POUCH") return "Die-Cut Pouch";
  if (parts[0] === "BOX") return "Custom Box";
  if (parts[0] === "JAR") return "Custom Jar";
  if (parts[0] === "PRE-ROLL PACKAGING") return "Pre-Roll Packaging";
  if (parts[0] === "DISPLAY") return "Custom Display";
  return "";
}

function inferFlavorCountFromText(text: string) {
  const value = text.toLowerCase();

  if (/\b(one|single|1)\s+(flavor|flavour|strain|sku)\b/.test(value)) return 1;

  const numeric = value.match(/\b(\d+)\s+(flavors?|flavours?|strains?|skus?)\b/);
  if (numeric) return Math.max(1, Number(numeric[1]));

  const words: Record<string, number> = {
    two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10,
  };
  for (const [word, count] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\s+(flavors?|flavours?|strains?|skus?)\\b`).test(value)) return count;
  }

  if (/\bmultiple\s+(flavors?|flavours?|strains?|skus?)\b/.test(value)) return -1;
  return 0;
}

function inferQuantityFromText(text: string) {
  const value = text.toLowerCase().replace(/,/g, "");

  // A "unit" is one 128-piece unit for DYE CUT LAB production.
  // Example: 10 units = 1,280 pcs, rounded up to 1,300 pcs.
  const unitMatch = value.match(/\b(\d+(?:\.\d+)?)\s*(k|thousand)?\s*units?\b/);
  if (unitMatch) {
    let units = Number(unitMatch[1]);
    if (!Number.isFinite(units) || units <= 0) return null;
    if (unitMatch[2] === "k" || unitMatch[2] === "thousand") units *= 1000;
    return calculateProduction(units).total;
  }

  // Explicit piece counts are literal production pieces.
  const pieceMatch = value.match(/\b(\d+(?:\.\d+)?)\s*(k|thousand)?\s*(?:pcs?|pieces?)\b/);
  if (pieceMatch) {
    let pieces = Number(pieceMatch[1]);
    if (!Number.isFinite(pieces) || pieces <= 0) return null;
    if (pieceMatch[2] === "k" || pieceMatch[2] === "thousand") pieces *= 1000;
    return roundOrderQuantity(Math.ceil(pieces));
  }

  // Natural order language, but only when the number is clearly tied to quantity.
  const orderMatch = value.match(/\b(?:need|want|order|make|produce|get)\s+(?:about\s+|around\s+|approximately\s+)?(\d+(?:\.\d+)?)\s*(k|thousand)?\b/);
  if (orderMatch) {
    let pieces = Number(orderMatch[1]);
    if (!Number.isFinite(pieces) || pieces <= 0) return null;
    if (orderMatch[2] === "k" || orderMatch[2] === "thousand") pieces *= 1000;
    return roundOrderQuantity(Math.ceil(pieces));
  }

  return null;
}

function inferUseTypeFromText(text: string) {
  const value = text.toLowerCase();
  if (/\b(flower|bud|cannabis flower)\b/.test(value)) return "FLOWER";
  if (/\b(pre[\s-]?roll|preroll|joint|joints)\b/.test(value)) return "PRE-ROLL";
  if (/\b(edible|edibles|gummy|gummies|chocolate)\b/.test(value)) return "EDIBLES";
  if (/\b(retail|merch|merchandise|apparel|clothing)\b/.test(value)) return "RETAIL";
  return "";
}

function inferSizeFromText(text: string) {
  const value = text.toLowerCase();
  const capacity = value.match(/\b(\d+(?:\.\d+)?)\s*(g|gram|grams|oz|ounce|ounces|ml)\b/);
  if (capacity) return `${capacity[1]}${capacity[2].startsWith("gram") ? "G" : capacity[2].startsWith("ounce") ? "OZ" : capacity[2].toUpperCase()}`;

  const dimensions = value.match(/\b(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\s*(in|inch|inches|cm|mm)?\b/);
  if (dimensions) {
    const unit = dimensions[4] ? dimensions[4].toUpperCase().replace("INCHES", "IN").replace("INCH", "IN") : "";
    return `${dimensions[1]} × ${dimensions[2]}${dimensions[3] ? ` × ${dimensions[3]}` : ""}${unit ? ` ${unit}` : ""}`;
  }
  return "";
}

function inferClosureFromText(text: string) {
  const value = text.toLowerCase();
  if (/\b(child resistant|child-resistant|cr closure|cr zipper|cr zip)\b/.test(value)) return "CHILD-RESISTANT";
  if (/\b(zipper|zip lock|ziplock|resealable)\b/.test(value)) return "ZIPPER";
  if (/\b(heat seal|heat-seal|sealed)\b/.test(value)) return "HEAT SEAL";
  return "";
}

function inferArtworkFromText(text: string) {
  const value = text.toLowerCase();
  if (/\b(artwork|design|art|file|files)\b/.test(value) && /\b(ready|finished|complete|done|have|already)\b/.test(value)) return "ready";
  if (/\b(need|needs|help|develop|create|design)\b/.test(value) && /\b(artwork|design|art)\b/.test(value)) return "needs design";
  if (/\b(no artwork|no art|don't have artwork|do not have artwork)\b/.test(value)) return "no artwork yet";
  return "";
}

function inferUnitConversion(text: string) {
  const value = text.toLowerCase().replace(/,/g, "");
  const match = value.match(/\b(\d+(?:\.\d+)?)\s*(k|thousand)?\s*units?\b/);
  if (!match) return null;

  let units = Number(match[1]);
  if (!Number.isFinite(units) || units <= 0) return null;
  if (match[2] === "k" || match[2] === "thousand") units *= 1000;

  const production = calculateProduction(units);
  return {
    units,
    rawPieces: production.rawPieces,
    orderPieces: production.total,
  };
}

function inferProjectDetails(text: string): Partial<ProjectData> {
  const productType = inferProductTypeFromText(text);
  const quantity = inferQuantityFromText(text);
  const useType = inferUseTypeFromText(text);
  const size = inferSizeFromText(text);
  const closure = inferClosureFromText(text);
  const artworkStatus = inferArtworkFromText(text);

  return {
    ...(productType ? { productType, title: productType } : {}),
    ...(quantity ? { quantity } : {}),
    ...(useType ? { useType } : {}),
    ...(size ? { size } : {}),
    ...(closure ? { closure } : {}),
    ...(artworkStatus ? { artworkStatus } : {}),
  };
}


export default function Home() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("home");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectData>(EMPTY_PROJECT);
  const [client, setClient] = useState<ClientData>(EMPTY_CLIENT);
  const [clientHydrated, setClientHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = window.localStorage.getItem(REMEMBERED_CLIENT_KEY);
        if (stored) {
          const {
            data: { user },
          } = await getBrowserSupabase().auth.getUser();
          const remembered = readRememberedClient(stored, user?.id);

          if (remembered && user) {
            if (!cancelled) setClient({ ...remembered, userId: user.id });
          } else {
            /* another account's memory, or an old one: forget it */
            window.localStorage.removeItem(REMEMBERED_CLIENT_KEY);
          }
        }
      } catch (error) {
        console.error("REMEMBERED CLIENT LOAD ERROR:", error);
        window.localStorage.removeItem(REMEMBERED_CLIENT_KEY);
      } finally {
        if (!cancelled) setClientHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function rememberClient(savedClient: ClientData) {
    setClient(savedClient);

    try {
      window.localStorage.setItem(
        REMEMBERED_CLIENT_KEY,
        JSON.stringify(savedClient)
      );
    } catch (error) {
      console.error("REMEMBERED CLIENT SAVE ERROR:", error);
    }
  }

  function beginProject(text: string) {
    if (!text.trim()) return;

    setReferenceImage(null);
    const request = text.trim();

    setProject({
      ...EMPTY_PROJECT,
      clientId: client.id,
      request,
    });

    // Returning visitors on the same device skip contact capture.
    // New visitors still go through Client Capture first.
    if (clientHydrated && client.id && client.phone) {
      setStage("conversation");
    } else {
      setStage("capture");
    }
  }

  if (stage === "capture") {
    return (
      <ClientCapture
        client={client}
        setClient={setClient}
        onBack={() => setStage("home")}
        onContinue={(savedClient) => {
          rememberClient(savedClient);
          setProject((current) => ({
            ...current,
            clientId: savedClient.id,
          }));
          setStage("conversation");
        }}
        onSkip={() => {
          /* No contact record: the project is saved without one and updates go
             by email. Nothing is remembered, so the next project asks again. */
          setClient(EMPTY_CLIENT);
          setProject((current) => ({ ...current, clientId: null }));
          setStage("conversation");
        }}
      />
    );
  }

  if (stage === "conversation") {
    return (
      <Conversation
        project={project}
        setProject={setProject}
        client={client}
        referenceImage={referenceImage}
        setReferenceImage={setReferenceImage}
        onBack={() => setStage("home")}
        onViewProject={() => {
          /* the real project page: stages, activity, files and the chat */
          if (project.projectNumber) router.push(`/project/${encodeURIComponent(project.projectNumber)}`);
        }}
      />
    );
  }

  return <Homepage onStart={beginProject} />;
}

/* =========================================================
   HOMEPAGE
========================================================= */

function Homepage({
  onStart,
}: {
  onStart: (text: string) => void;
}) {
  const [message, setMessage] = useState("");

  const categories = [
    { label: "Pouches", ask: "I want to make custom pouches." },
    { label: "Boxes", ask: "I want to make custom boxes." },
    { label: "Jars", ask: "I want to make custom jars." },
    { label: "Pre-rolls", ask: "I want to make custom pre-roll packaging." },
    { label: "Display", ask: "I want to make a custom display." },
    { label: "Something else", ask: "I want to make something custom." },
  ];

  const examples = [
    { label: "Custom boxes", image: "/boxes.png", ask: "I want to make custom boxes." },
    { label: "Mylar bags", image: "/mylar-bags.png", ask: "I want to make custom mylar bags." },
    { label: "Novelties", image: "/novelties.png", ask: "I want to make custom novelties." },
    { label: "Sticker rolls", image: "/sticker-rolls.png", ask: "I want to make custom stickers." },
  ];

  const steps = [
    { title: "Talk", text: "Tell DICI what you want to make." },
    { title: "Develop", text: "We build the specs and find the right factory." },
    { title: "Review", text: "You check your proof and approve it." },
    { title: "Produce", text: "We manufacture your project." },
    { title: "Deliver", text: "We ship it to your door." },
  ];

  function submit() {
    if (!message.trim()) return;
    onStart(message);
  }

  return (
    <main className="bg-[#fafafa] text-black">
      <Header />

      {/* HERO */}
      <section className="mx-auto w-full max-w-[760px] px-5 pb-12 pt-8 sm:pt-12">
        <BabaStatus />

        <h1 className="mt-6 text-[44px] font-black leading-[1.02] tracking-[-0.04em] sm:text-[64px]">
          What do you want to{" "}
          <span className="inline-block -rotate-1 rounded-2xl bg-[#c2f23a] px-3">make?</span>
        </h1>

        <p className="mt-5 max-w-[520px] text-[17px] font-medium leading-7 text-zinc-700">
          Tell DICI your idea. A sentence is enough. It asks what is missing,
          works out the quantity and starts your project.
        </p>

        {/* PROJECT INPUT */}
        <div className="mt-8 rounded-[28px] border-2 border-black bg-white p-4 shadow-[4px_4px_0_#000] focus-within:shadow-[4px_4px_0_#c2f23a]">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
            }}
            maxLength={MAX_CHAT_CHARS}
            placeholder="For example: 200 mylar bags for my gummies, matte black with a gold logo"
            aria-label="Describe what you want to make"
            className="min-h-[110px] w-full resize-none bg-transparent px-1 text-[17px] font-medium leading-7 outline-none placeholder:text-zinc-500"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="pl-1 text-[12px] font-medium text-zinc-500">
              You can add pictures in the chat.
            </p>

            <button
              onClick={submit}
              disabled={!message.trim()}
              aria-label="Start my project"
              className="flex h-12 items-center gap-2 rounded-full border-2 border-black bg-[#c2f23a] px-5 text-[14px] font-extrabold transition hover:bg-black hover:text-[#c2f23a] disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-white"
            >
              Start <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* QUICK START */}
        <div className="mt-8">
          <p className="mb-3 text-[12px] font-bold tracking-[0.1em] text-zinc-600">
            OR START WITH
          </p>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.label}
                onClick={() => onStart(category.ask)}
                className="rounded-full border-2 border-black bg-white px-4 py-2.5 text-[14px] font-bold transition hover:bg-[#c2f23a]"
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* EXAMPLES */}
      <section className="border-t border-black/10 bg-white">
        <div className="mx-auto w-full max-w-[760px] px-5 py-14">
          <p className="text-[12px] font-extrabold tracking-[0.12em] text-[#3f6f00]">
            MADE AT THE LAB
          </p>

          <h2 className="mt-3 text-[34px] font-black leading-[1.05] tracking-[-0.03em] sm:text-[44px]">
            Real projects. Real results.
          </h2>

          <p className="mt-3 text-[16px] font-medium text-zinc-600">
            Tap one to start a project like it.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4">
            {examples.map((example) => (
              <button
                key={example.label}
                onClick={() => onStart(example.ask)}
                className="group rounded-[24px] border-2 border-black bg-[#f4f4f5] p-3 text-left transition hover:bg-[#f1f8e0]"
              >
                <Image
                  src={example.image}
                  alt=""
                  width={400}
                  height={400}
                  className="aspect-square w-full object-contain"
                />
                <span className="mt-2 flex items-center justify-between px-1 text-[15px] font-extrabold">
                  {example.label}
                  <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-black/10">
        <div className="mx-auto w-full max-w-[760px] px-5 py-14">
          <p className="text-[12px] font-extrabold tracking-[0.12em] text-[#3f6f00]">
            HOW IT WORKS
          </p>

          <h2 className="mt-3 text-[34px] font-black leading-[1.05] tracking-[-0.03em] sm:text-[44px]">
            From idea to delivered.
          </h2>

          <ol className="mt-8 space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#c2f23a] text-[15px] font-black">
                  {index + 1}
                </span>
                <div>
                  <p className="text-[18px] font-extrabold leading-tight">{step.title}</p>
                  <p className="mt-0.5 text-[15px] font-medium leading-6 text-zinc-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* TRACK IT */}
      <section className="bg-black text-white">
        <div className="mx-auto w-full max-w-[760px] px-5 py-14">
          <h2 className="text-[32px] font-black leading-[1.05] tracking-[-0.03em] sm:text-[42px]">
            Follow your project, <span className="text-[#c2f23a]">every step.</span>
          </h2>

          <p className="mt-4 max-w-[460px] text-[16px] font-medium leading-7 text-zinc-300">
            Its stage, your files and your conversation with DICI all live in
            your account, on any phone or computer.
          </p>

          <Link
            href="/account"
            className="mt-7 inline-flex items-center gap-2 rounded-full border-2 border-[#c2f23a] bg-[#c2f23a] px-6 py-3.5 text-[14px] font-extrabold text-black transition hover:bg-black hover:text-[#c2f23a]"
          >
            My projects <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/* =========================================================
   CLIENT CAPTURE
========================================================= */

function ClientCapture({
  client,
  setClient,
  onBack,
  onContinue,
  onSkip,
}: {
  client: ClientData;
  setClient: React.Dispatch<React.SetStateAction<ClientData>>;
  onBack: () => void;
  onContinue: (client: ClientData) => void;
  onSkip: () => void;
}) {
  const [phone, setPhone] = useState(client.phone);
  const [email, setEmail] = useState(client.email);
  const [marketingSms, setMarketingSms] = useState(client.marketingSms);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueProject() {
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();

    if (!cleanPhone) {
      setError("Enter a mobile number to continue.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      /* One customer record per signed-in account (clients.owner_id). Update
         it when it exists, create it otherwise — never upsert by phone, which
         would collide with a number another account already saved. */
      const supabase = getBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again to continue.");

      const fields = {
        phone: cleanPhone,
        email: cleanEmail || null,
        marketing_sms_opt_in: marketingSms,
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("owner_id", user.id)
        .order("id")
        .limit(1)
        .maybeSingle();

      const { data, error: saveError } = existing
        ? await supabase
            .from("clients")
            .update(fields)
            .eq("id", existing.id)
            .select("id, phone, email, marketing_sms_opt_in")
            .single()
        : await supabase
            .from("clients")
            .insert({ ...fields, owner_id: user.id })
            .select("id, phone, email, marketing_sms_opt_in")
            .single();

      if (saveError?.code === "23505") {
        throw new Error("That number is already used by another account. Use a different number, or skip for now.");
      }
      if (saveError) throw saveError;

      const savedClient: ClientData = {
        id: data.id,
        phone: data.phone,
        email: data.email ?? "",
        marketingSms: Boolean(data.marketing_sms_opt_in),
        userId: user.id,
      };

      setClient(savedClient);

      try {
        window.localStorage.setItem(
          REMEMBERED_CLIENT_KEY,
          JSON.stringify(savedClient)
        );
      } catch (storageError) {
        console.error("REMEMBERED CLIENT SAVE ERROR:", storageError);
      }

      onContinue(savedClient);
    } catch (saveError) {
      console.error("CLIENT SAVE ERROR:", saveError);
      const friendly =
        saveError instanceof Error && /already used|sign in again/i.test(saveError.message)
          ? saveError.message
          : null;
      setError(friendly ?? "I couldn't save your contact details yet. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fafafa] text-black">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto grid w-full max-w-[720px] grid-cols-[48px_1fr_48px] items-center px-4 py-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-black text-[20px] font-bold leading-none transition hover:bg-[#c2f23a]"
          >
            ←
          </button>
          <div className="text-center">
            <BabaStatus />
          </div>
          <span />
        </div>
      </header>

      <section className="mx-auto w-full max-w-[520px] px-5 pb-12 pt-8">
        <p className="text-[12px] font-extrabold tracking-[0.12em] text-[#3f6f00]">ALMOST THERE</p>

        <h1 className="mt-3 text-[38px] font-black leading-[1.05] tracking-[-0.03em] sm:text-[46px]">
          Where should we send your{" "}
          <span className="inline-block -rotate-1 rounded-xl bg-[#c2f23a] px-2">updates?</span>
        </h1>

        <p className="mt-4 text-[16px] font-medium leading-7 text-zinc-700">
          We&apos;ll text your mobile number about your project. Email is optional.
        </p>

        <div className="mt-7 rounded-[28px] border-2 border-black bg-white p-5 shadow-[4px_4px_0_#000]">
          <label className="block">
            <span className="text-[13px] font-bold">Mobile number</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 917 555 0123"
              className="mt-2 h-14 w-full rounded-2xl border-2 border-black px-4 text-[17px] font-medium outline-none placeholder:text-zinc-400 focus:shadow-[3px_3px_0_#c2f23a]"
            />
          </label>

          <label className="mt-5 block">
            <span className="text-[13px] font-bold">
              Email <span className="font-medium text-zinc-500">(optional)</span>
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
              placeholder="you@brand.com"
              className="mt-2 h-14 w-full rounded-2xl border-2 border-black px-4 text-[17px] font-medium outline-none placeholder:text-zinc-400 focus:shadow-[3px_3px_0_#c2f23a]"
            />
          </label>

          <label className="mt-5 flex items-start gap-3">
            <input
              type="checkbox"
              checked={marketingSms}
              onChange={(e) => setMarketingSms(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-black"
            />
            <span className="text-[13px] font-medium leading-5 text-zinc-600">
              Send me occasional DYE CUT LAB news, drops and promotional texts. Optional, and separate from project updates.
            </span>
          </label>

          {error && (
            <p role="alert" className="mt-5 rounded-2xl border-2 border-red-600 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-700">
              {error}
            </p>
          )}

          <button
            onClick={continueProject}
            disabled={saving}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border-2 border-black bg-[#c2f23a] py-4 text-[15px] font-extrabold transition hover:bg-black hover:text-[#c2f23a] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Continue to DICI"} <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            className="mt-3 w-full rounded-full border-2 border-black bg-white py-3.5 text-[15px] font-extrabold transition hover:bg-[#f1f8e0] disabled:opacity-50"
          >
            Skip for now
          </button>
          <p className="mt-3 text-center text-[13px] font-medium text-zinc-600">
            You can add a number later. We&apos;ll keep you posted by email until then.
          </p>
        </div>

        <p className="mt-5 text-[12px] font-medium leading-5 text-zinc-500">
          Project messages are transactional. Marketing texts are only sent if you check the optional box above.
        </p>
      </section>
    </main>
  );
}

/* =========================================================
   CONVERSATION
========================================================= */

type BabaApiResponse = {
  extracted: {
    packaging: string | null;
    units: number | null;
    flavorCount: number | null;
    artworkStatus: string | null;
    size: string | null;
    closure: string | null;
    referenceReceived: boolean | null;
  };
  nextQuestion: string;
  complete: boolean;
};

type ChatMessage = {
  id: string;
  role: "customer" | "baba";
  text: string;
  kind?: "normal" | "summary";
};

const COMPLETE_MESSAGE =
  "Perfect. I have enough to start your project brief. We can keep filling in dimensions, closure and production details as we develop it.";

function Conversation({
  project,
  setProject,
  client,
  referenceImage,
  setReferenceImage,
  onBack,
  onViewProject,
}: {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  client: ClientData;
  referenceImage: string | null;
  setReferenceImage: (image: string | null) => void;
  onBack: () => void;
  onViewProject: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [step, setStep] = useState<QuestionStep>("ai");
  const [nextQuestion, setNextQuestion] = useState("");
  const [questionKind, setQuestionKind] = useState<
    "product" | "quantity" | "flavors" | "artwork" | "reference" | "general"
  >("general");
  const [referenceDecided, setReferenceDecided] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-customer",
      role: "customer",
      text: project.request,
    },
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [messages, thinking, saving, projectError, referenceImage, step]);

  function createMessageId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getQuestionKind(
    question: string,
    current: ProjectData
  ): "product" | "quantity" | "flavors" | "artwork" | "reference" | "general" {
    const fromWords = questionKindFromText(question);
    if (fromWords) return fromWords;

    if (!current.productType) return "product";
    if (!current.units) return "quantity";
    if (!current.flavorCount) return "flavors";
    if (!current.artworkStatus) return "artwork";
    if (!referenceDecided) return "reference";

    return "general";
  }

  function buildSummary(current: ProjectData) {
    const lines: string[] = [];

    if (current.productType) {
      lines.push(`PACKAGING · ${current.productType.toUpperCase()}`);
    }

    if (current.units) {
      lines.push(`UNITS · ${current.units.toLocaleString()}`);
    }

    if (current.quantity) {
      lines.push(`PRODUCTION · ${current.quantity.toLocaleString()} PCS`);
    }

    if (current.flavorCount > 0) {
      lines.push(
        `DESIGNS · ${current.flavorCount} · ${current.flavorSplit.toLocaleString()} PCS EACH`
      );
    }

    if (current.size) {
      lines.push(`SIZE · ${current.size.toUpperCase()}`);
    }

    if (current.closure) {
      lines.push(`CLOSURE · ${current.closure.toUpperCase()}`);
    }

    return lines.join("\n");
  }

  async function ensureProject(next: ProjectData) {
    setSaving(true);
    setProjectError(null);

    const payload = {
      title: next.productType || next.title || "Custom Packaging Project",
      client_id: next.clientId ?? client.id,
      request: next.request,
      units: next.units,
      quantity: next.quantity,
      product_type: next.productType || null,
      use_type: next.useType || "FLOWER",
      flavor_count: next.flavorCount || null,
      flavor_split: next.flavorSplit || null,
      artwork_status: next.artworkStatus || null,
      size: next.size || null,
      closure: next.closure || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (next.id) {
        const { error } = await getBrowserSupabase()
          .from("projects")
          .update(payload)
          .eq("id", next.id);

        if (error) throw error;

        setProject(next);
        return next;
      }

      /* The stage is only set when the project is created. Later updates must
         not send it: the team moves the stage, and the database refuses a
         customer who tries. */
      const { updated_at, ...insertPayload } = payload;
      void updated_at;

      const { data, error } = await getBrowserSupabase()
        .from("projects")
        .insert({ ...insertPayload, status: next.status || "development" })
        .select("id, project_number")
        .single();

      if (error) throw error;

      const created: ProjectData = {
        ...next,
        id: data.id,
        projectNumber: data.project_number,
        clientId: next.clientId ?? client.id,
        title: next.productType || next.title || "Custom Packaging Project",
      };

      setProject(created);

      /* Tell the team once about the new project (text + email, sent by the
         server). Fire and forget: a slow or failed alert never holds up or
         changes anything for the customer. The server only alerts once per
         project, whatever happens here. */
      void fetch(`/api/projects/${encodeURIComponent(data.project_number)}/notify`, {
        method: "POST",
      }).catch((alertError) => console.error("TEAM ALERT ERROR:", alertError));

      return created;
    } catch (error) {
      const failure = error as { message?: string; code?: string; details?: string; hint?: string };
      console.error("PROJECT SAVE ERROR:", failure?.message, failure?.code, failure?.details, failure?.hint);
      setProjectError(
        "I understood the project, but I couldn't save it yet. Please try again."
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveConversation(
    projectId: string,
    customerText: string,
    babaText: string
  ) {
    const rows = intakeRows(customerText, babaText);
    if (rows.length === 0) return;

    const { error } = await getBrowserSupabase()
      .from("project_messages")
      .insert(rows.map((row) => ({ ...row, project_id: projectId })));

    if (error) {
      console.error("INTAKE MESSAGE SAVE ERROR:", error);
    }
  }

  async function callBaba(
    customerMessage: string,
    baseProject: ProjectData,
    addCustomerBubble = true,
    forceReferenceReceived?: boolean
  ) {
    const cleanMessage = customerMessage.trim();
    if (!cleanMessage) return;

    if (addCustomerBubble) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId("customer"),
          role: "customer",
          text: cleanMessage,
        },
      ]);
    }

    setThinking(true);
    setProjectError(null);

    try {
      const response = await fetch("/api/baba", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanMessage,
          history: toRequestHistory(messages, cleanMessage),
          project: {
            packaging: baseProject.productType || null,
            units: baseProject.units,
            quantity: baseProject.quantity,
            flavorCount:
              baseProject.flavorCount > 0 ? baseProject.flavorCount : null,
            artworkStatus: baseProject.artworkStatus || null,
            size: baseProject.size || null,
            closure: baseProject.closure || null,
            referenceReceived:
              typeof forceReferenceReceived === "boolean"
                ? forceReferenceReceived
                : referenceImage
                ? true
                : referenceDecided
                ? false
                : null,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "DICI could not process that message.");
      }

      const baba = data as BabaApiResponse;
      const extracted = baba.extracted;

      const mergedUnits =
        extracted.units !== null && extracted.units !== undefined
          ? extracted.units
          : baseProject.units;

      const mergedFlavorCount =
        extracted.flavorCount !== null && extracted.flavorCount !== undefined
          ? Math.max(1, Math.round(extracted.flavorCount))
          : baseProject.flavorCount;

      const production = calculateProduction(
        mergedUnits,
        mergedFlavorCount
      );

      const next: ProjectData = {
        ...baseProject,
        productType: extracted.packaging || baseProject.productType,
        title:
          extracted.packaging ||
          baseProject.productType ||
          baseProject.title,
        units: mergedUnits,
        quantity:
          production.total > 0 ? production.total : baseProject.quantity,
        flavorCount: mergedFlavorCount,
        flavorSplit:
          production.perFlavor > 0
            ? production.perFlavor
            : baseProject.flavorSplit,
        artworkStatus:
          extracted.artworkStatus || baseProject.artworkStatus,
        size: extracted.size || baseProject.size,
        closure: extracted.closure || baseProject.closure,
        useType: baseProject.useType || "FLOWER",
      };

      const saved = await ensureProject(next);
      const current = saved || next;

      /* keep the conversation with the project so the team (and the project
         chat) can read it; a failure here never interrupts the customer */
      if (current.id) {
        await saveConversation(
          current.id,
          cleanMessage,
          baba.complete ? COMPLETE_MESSAGE : baba.nextQuestion
        );
      }

      const summary = buildSummary(current);

      if (summary) {
        const lastBabaSummary = messages
          .filter((message) => message.role === "baba" && message.kind === "summary")
          .at(-1)?.text;

        if (summary !== lastBabaSummary) {
          setMessages((existing) => [
            ...existing,
            {
              id: createMessageId("baba-summary"),
              role: "baba",
              text: summary,
              kind: "summary",
            },
          ]);
        }
      }

      if (baba.complete) {
        setStep("complete");
        setNextQuestion("");
        setQuestionKind("general");

        setMessages((existing) => [
          ...existing,
          {
            id: createMessageId("baba-complete"),
            role: "baba",
            text: COMPLETE_MESSAGE,
          },
        ]);
        return;
      }

      const question = baba.nextQuestion?.trim();

      if (question) {
        setNextQuestion(question);
        setQuestionKind(getQuestionKind(question, current));
        setStep("ai");

        setMessages((existing) => [
          ...existing,
          {
            id: createMessageId("baba-question"),
            role: "baba",
            text: question,
          },
        ]);
      }
    } catch (error) {
      console.error("BABA CHAT ERROR:", error);
      setProjectError(
        error instanceof Error
          ? error.message
          : "DICI couldn't process that message."
      );
    } finally {
      setThinking(false);
    }
  }

  async function openConversation() {
    /* Coming back from the project view the project already exists: show the
       saved conversation instead of sending the opening message again. */
    if (project.id && project.projectNumber) {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(project.projectNumber)}/messages`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => null);
        const shown = savedToShown(data?.messages);
        if (response.ok && shown.length > 0) setMessages(shown);
      } catch (error) {
        console.error("INTAKE HISTORY LOAD ERROR:", error);
      }
      return;
    }

    await callBaba(project.request, project, false);
  }

  useEffect(() => {
    if (initializedRef.current || !project.request) return;
    initializedRef.current = true;

    void openConversation();
    // Run only once for the opening customer message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendTypedMessage() {
    const message = input.trim();
    if (!message || thinking || saving) return;

    setInput("");
    await callBaba(message, project, true);
  }

  async function sendQuickAnswer(message: string) {
    if (thinking || saving) return;
    await callBaba(message, project, true);
  }

  async function uploadReference(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    /* let the customer pick the same file again after a failure */
    event.target.value = "";

    if (!project.projectNumber) {
      setProjectError("Please finish your first message before adding a picture.");
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("category", "reference");

    setProjectError(null);
    setSaving(true);

    let status: number | null = null;
    let serverMessage: unknown = null;

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.projectNumber)}/files`,
        { method: "POST", body }
      );

      status = response.status;

      if (!response.ok) {
        serverMessage = (await response.json().catch(() => null))?.error;
        throw new Error("Reference upload failed");
      }
    } catch (error) {
      console.error("REFERENCE UPLOAD ERROR:", error);
      setProjectError(uploadErrorMessage(status, serverMessage));
      return;
    } finally {
      setSaving(false);
    }

    const url = URL.createObjectURL(file);
    setReferenceImage(url);
    setReferenceDecided(true);

    await callBaba(
      "I uploaded a visual reference for the project.",
      project,
      true,
      true
    );
  }

  async function skipReference() {
    setReferenceDecided(true);

    await callBaba(
      "I don't have a visual reference right now. Let's continue without one.",
      project,
      true,
      false
    );
  }

  const detailCount = [
    project.productType,
    project.units,
    project.flavorCount > 0 ? project.flavorCount : null,
    project.artworkStatus,
    referenceDecided || referenceImage,
  ].filter(Boolean).length;

  const unitConversion =
    project.units && project.units > 0
      ? {
          units: project.units,
          rawPieces: calculateProduction(project.units).rawPieces,
          orderPieces: project.quantity,
        }
      : null;

  return (
    <main className="flex min-h-screen flex-col bg-[#fafafa] text-black">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-[720px] grid-cols-[48px_1fr_48px] items-center px-4 py-3">
          <button
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-black text-[20px] font-bold leading-none transition hover:bg-[#c2f23a]"
            aria-label="Back"
          >
            ←
          </button>

          <div className="text-center">
            <p className="text-[16px] font-extrabold tracking-[0.02em]">
              {project.projectNumber ?? "New project"}
            </p>
            <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-[#f1f8e0] px-2.5 py-0.5">
              <span className={`h-2 w-2 rounded-full bg-[#c2f23a] ${thinking ? "animate-pulse" : ""}`} />
              <span className="text-[11px] font-bold text-[#3f6f00]">
                DICI · {thinking ? "thinking" : "online"}
              </span>
            </div>
          </div>

          <span />
        </div>
      </header>

      <section className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-56 pt-6">
        {messages.map((message) =>
          message.role === "customer" ? (
            <CustomerAnswer key={message.id}>{message.text}</CustomerAnswer>
          ) : (
            <BabaMessage key={message.id}>
              {message.kind === "summary" ? (
                <div>
                  <p className="mb-3 font-bold">Got it. Here&apos;s what I picked up:</p>

                  <dl className="grid grid-cols-2 gap-2">
                    {summaryRows(message.text).map((row, index) => (
                      <div
                        key={`${row.label}-${index}`}
                        className="rounded-2xl bg-white/80 px-3 py-2"
                      >
                        {row.label && (
                          <dt className="text-[10px] font-bold tracking-[0.1em] text-zinc-500">
                            {row.label}
                          </dt>
                        )}
                        <dd className="text-[15px] font-extrabold leading-tight">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {unitConversion && (
                    <p className="mt-3 inline-block rounded-full bg-black px-3 py-1.5 text-[11px] font-bold tracking-[0.04em] text-[#c2f23a]">
                      {unitConversion.units.toLocaleString()} UNITS × {PIECES_PER_UNIT} PCS ={" "}
                      {unitConversion.rawPieces.toLocaleString()} PCS
                      {unitConversion.orderPieces
                        ? ` · PRODUCTION ${unitConversion.orderPieces.toLocaleString()} PCS`
                        : ""}
                    </p>
                  )}
                </div>
              ) : (
                <p>{message.text}</p>
              )}
            </BabaMessage>
          )
        )}

        {thinking && (
          <BabaMessage>
            <SystemLine text="DICI IS READING YOUR PROJECT..." />
          </BabaMessage>
        )}

        {!thinking && step === "ai" && questionKind === "product" && (
          <QuickOptions
            options={["POUCH", "BOX", "POUCH + BOX", "JAR", "PRE-ROLL", "DISPLAY"]}
            onSelect={(value) =>
              sendQuickAnswer(
                value === "POUCH + BOX"
                  ? "I need a pouch and box."
                  : `I need ${value.toLowerCase()} packaging.`
              )
            }
            disabled={saving}
          />
        )}

        {!thinking && step === "ai" && questionKind === "quantity" && (
          <div className="ml-12 mt-4 flex flex-wrap gap-2">
            {[1, 5, 10, 20, 50].map((units) => (
              <button
                key={units}
                disabled={saving}
                onClick={() => sendQuickAnswer(`${units} units`)}
                className={CHIP}
              >
                {units} UNITS
              </button>
            ))}
          </div>
        )}

        {!thinking && step === "ai" && questionKind === "flavors" && (
          <div className="ml-12 mt-4 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 8].map((count) => (
              <button
                key={count}
                disabled={saving}
                onClick={() =>
                  sendQuickAnswer(
                    count === 1 ? "One design" : `${count} designs`
                  )
                }
                className={CHIP}
              >
                {count === 1 ? "ONE DESIGN" : `${count} DESIGNS`}
              </button>
            ))}
          </div>
        )}

        {!thinking && step === "ai" && questionKind === "artwork" && (
          <QuickOptions
            options={["READY", "NEEDS DESIGN", "NO ARTWORK YET"]}
            onSelect={(value) => {
              if (value === "READY") {
                sendQuickAnswer("My artwork is ready.");
              } else if (value === "NEEDS DESIGN") {
                sendQuickAnswer("I need help developing the artwork.");
              } else {
                sendQuickAnswer("I don't have artwork yet.");
              }
            }}
            disabled={saving}
          />
        )}

        {!thinking && step === "ai" && questionKind === "reference" && (
          <div className="ml-12 mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              className={CHIP}
            >
              + ADD REFERENCE
            </button>

            <button
              onClick={skipReference}
              className={CHIP}
            >
              SKIP FOR NOW
            </button>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={uploadReference}
          className="hidden"
        />

        {referenceImage && (
          <div className="mt-6 flex justify-end">
            <div className="w-[68%] max-w-[300px] overflow-hidden rounded-[22px] rounded-br-[4px] border-2 border-black bg-white">
              <img
                src={referenceImage}
                alt="Customer reference"
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold tracking-[0.08em] text-zinc-600">
                  REFERENCE
                </span>
                <span className="rounded-full bg-[#c2f23a] px-2 py-0.5 text-[10px] font-extrabold">✓ UPLOADED</span>
              </div>
            </div>
          </div>
        )}

        {saving && (
          <BabaMessage>
            <SystemLine text="SAVING PROJECT..." />
          </BabaMessage>
        )}

        {projectError && (
          <BabaMessage>
            <p>{projectError}</p>
          </BabaMessage>
        )}

        {step === "complete" && project.projectNumber && (
          <div className="ml-12 mt-5 rounded-[24px] border-2 border-black bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#c2f23a] px-3 py-1 text-[11px] font-extrabold tracking-[0.08em]">
                PROJECT CREATED
              </span>
              <span className="h-2.5 w-2.5 rounded-full bg-[#c2f23a] ring-2 ring-black" />
            </div>

            <p className="mt-4 text-[30px] font-black leading-none tracking-[-0.03em]">
              {project.projectNumber}
            </p>

            <p className="mt-1.5 text-[13px] font-bold tracking-[0.04em] text-zinc-500">
              {(project.productType || "CUSTOM PACKAGING").toUpperCase()}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-black/10 pt-4">
              <Spec
                label="UNITS"
                value={project.units ? project.units.toLocaleString() : "TBD"}
              />
              <Spec
                label="QUANTITY"
                value={
                  project.quantity
                    ? `${project.quantity.toLocaleString()} PCS`
                    : "TBD"
                }
              />
              <Spec
                label="DESIGNS"
                value={
                  project.flavorCount > 0
                    ? `${project.flavorCount} × ${project.flavorSplit.toLocaleString()} PCS`
                    : "TBD"
                }
              />
              <Spec label="USE" value={project.useType || "FLOWER"} />
              <Spec
                label="REFERENCE"
                value={referenceImage ? "✓ RECEIVED" : "NOT ADDED"}
                active={Boolean(referenceImage)}
              />
              <Spec
                label="ARTWORK"
                value={
                  project.artworkStatus
                    ? project.artworkStatus.toUpperCase()
                    : "TBD"
                }
              />
            </div>

            <button
              onClick={onViewProject}
              className="mt-6 w-full rounded-full border-2 border-black bg-[#c2f23a] py-4 text-[13px] font-extrabold tracking-[0.06em] text-black transition hover:bg-black hover:text-[#c2f23a]"
            >
              VIEW PROJECT <span className="ml-2">→</span>
            </button>
          </div>
        )}

        <div className="ml-12 mt-6 flex items-center gap-3" aria-label={`Brief ${detailCount} of 5`}>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className={`h-2 w-7 rounded-full ${index < detailCount ? "bg-[#c2f23a] ring-1 ring-black" : "bg-zinc-200"}`}
              />
            ))}
          </div>
          <span className="text-[11px] font-bold tracking-[0.08em] text-zinc-500">
            BRIEF {detailCount}/5
          </span>
        </div>

        <div ref={bottomRef} />
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-black/10 bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[720px] items-center gap-2">
          <button
            onClick={() => fileInput.current?.click()}
            aria-label="Attach file"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-black text-[22px] font-bold leading-none transition hover:bg-[#c2f23a]"
          >
            +
          </button>

          <div className="flex flex-1 items-center rounded-full border-2 border-black bg-white pl-4 pr-1.5 focus-within:shadow-[3px_3px_0_#c2f23a]">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendTypedMessage();
              }}
              placeholder={
                step === "complete"
                  ? "Project brief started"
                  : thinking
                  ? "DICI is thinking..."
                  : nextQuestion
                  ? "Message DICI..."
                  : "Tell DICI more..."
              }
              disabled={step === "complete" || thinking || saving}
              className="h-12 flex-1 bg-transparent text-[16px] outline-none placeholder:text-zinc-500 disabled:opacity-50"
            />

            <button
              onClick={sendTypedMessage}
              disabled={!input.trim() || thinking || saving || step === "complete"}
              aria-label="Send message"
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-[#c2f23a] text-[20px] font-bold leading-none text-black disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-white"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function CustomerAnswer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 flex justify-end">
      <div className="max-w-[82%] rounded-[22px] rounded-br-[4px] bg-black px-5 py-3.5 text-white">
        <p className="text-[16px] font-medium leading-6">{children}</p>
      </div>
    </div>
  );
}

/* One look for every quick answer under DICI's question. */
const CHIP =
  "rounded-full border-2 border-black bg-white px-4 py-2.5 text-[12px] font-bold tracking-[0.04em] transition hover:bg-[#c2f23a] disabled:opacity-40";

function QuickOptions({
  options,
  onSelect,
  disabled = false,
}: {
  options: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ml-12 mt-4 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          disabled={disabled}
          onClick={() => onSelect(option)}
          className={CHIP}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/* =========================================================
   SHARED COMPONENTS
========================================================= */

function BabaStatus() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-[#f1f8e0] px-3 py-1.5 text-[11px] font-bold">
      <span className="h-2 w-2 rounded-full bg-[#c2f23a] ring-1 ring-black" />

      <span>DICI</span>

      <span className="text-zinc-300">
        ●
      </span>

      <span className="text-lime-500">
        ONLINE
      </span>
    </div>
  );
}

function BabaAvatar() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-black">
      <div className="flex gap-[4px]">
        <span className="h-2 w-2 rounded-full bg-[#c2f23a]" />
        <span className="h-2 w-2 rounded-full bg-[#c2f23a]" />
      </div>
    </div>
  );
}

function BabaMessage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex items-end gap-2.5">
      <BabaAvatar />

      <div className="max-w-[84%] rounded-[22px] rounded-bl-[4px] border-2 border-black bg-[#f1f8e0] px-5 py-3.5 text-[16px] font-medium leading-6">
        {children}
      </div>
    </div>
  );
}

function SystemLine({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-zinc-600">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#c2f23a] ring-1 ring-black" />
      {text}
    </div>
  );
}

function Spec({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[0.1em] text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-1 text-[14px] font-extrabold ${
          active
            ? "text-[#3f6f00]"
            : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
