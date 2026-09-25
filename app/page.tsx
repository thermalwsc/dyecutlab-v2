"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Stage = "home" | "capture" | "conversation" | "project";

type ClientData = {
  id: number | null;
  phone: string;
  email: string;
  marketingSms: boolean;
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
  id: number | null;
  projectNumber: string | null;
  clientId: number | null;
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

function adjustQuantityForFlavors(
  rawPieces: number,
  flavorCount: number
) {
  const safeFlavorCount = Math.max(1, Math.floor(flavorCount));

  // Never round below the customer's requested piece equivalent.
  // Each flavor must land on a 100-piece production increment,
  // so the total order increment is flavorCount × 100.
  const productionIncrement = safeFlavorCount * 100;
  const total =
    Math.ceil(rawPieces / productionIncrement) * productionIncrement;
  const perFlavor = total / safeFlavorCount;

  return {
    total,
    perFlavor,
  };
}

function roundOrderQuantity(quantity: number) {
  return Math.ceil(quantity / 100) * 100;
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
    return roundOrderQuantity(Math.ceil(units * 128));
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

  const rawPieces = Math.ceil(units * 128);
  return {
    units,
    rawPieces,
    orderPieces: roundOrderQuantity(rawPieces),
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
  const [stage, setStage] = useState<Stage>("home");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectData>(EMPTY_PROJECT);
  const [client, setClient] = useState<ClientData>(EMPTY_CLIENT);
  const [clientHydrated, setClientHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REMEMBERED_CLIENT_KEY);

      if (stored) {
        const parsed = JSON.parse(stored) as ClientData;

        if (parsed?.id && parsed?.phone) {
          setClient({
            id: parsed.id,
            phone: parsed.phone,
            email: parsed.email ?? "",
            marketingSms: Boolean(parsed.marketingSms),
          });
        }
      }
    } catch (error) {
      console.error("REMEMBERED CLIENT LOAD ERROR:", error);
      window.localStorage.removeItem(REMEMBERED_CLIENT_KEY);
    } finally {
      setClientHydrated(true);
    }
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
        onViewProject={() => setStage("project")}
      />
    );
  }

  if (stage === "project") {
    return (
      <Project
        project={project}
        referenceImage={referenceImage}
        onBack={() => setStage("conversation")}
        onContinue={() => setStage("conversation")}
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
    "POUCHES",
    "BOXES",
    "JARS",
    "PRE-ROLL",
    "DISPLAY",
    "CUSTOM",
  ];

  function submit() {
    if (!message.trim()) return;
    onStart(message);
  }

  return (
    <main className="min-h-screen bg-white text-black">
      {/* HEADER */}
      <header className="flex items-start justify-between px-5 pt-6">
        <Logo />

        <button
          aria-label="Open menu"
          className="flex h-9 w-9 flex-col items-center justify-center gap-[5px]"
        >
          <span className="h-px w-5 bg-black" />
          <span className="h-px w-5 bg-black" />
          <span className="h-px w-5 bg-black" />
        </button>
      </header>

      {/* HERO */}
      <section className="px-5 pb-12 pt-10">
        <BabaStatus />

        <h1 className="mt-7 text-[46px] font-medium leading-[0.94] tracking-[-0.055em]">
          WHAT DO YOU
          <br />
          WANT TO{" "}
          <span className="text-lime-400">
            MAKE?
          </span>
        </h1>

        <p className="mt-5 text-[14px] leading-5 text-zinc-600">
          Custom print + packaging.
          <br />
          All in one conversation.
        </p>

        {/* PROJECT INPUT */}
        <div className="mt-7 rounded-[18px] border border-zinc-300 p-4">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what you're thinking..."
            className="min-h-[82px] w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-zinc-400"
          />

          <div className="mt-2 flex items-center justify-between">
            <button
              aria-label="Attach reference"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-xl"
            >
              +
            </button>

            <button
              onClick={submit}
              aria-label="Send"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-lg text-lime-400"
            >
              ↑
            </button>
          </div>
        </div>

        {/* QUICK START */}
        <div className="mt-7">
          <p className="mb-3 text-[10px] tracking-[0.08em] text-zinc-500">
            OR START WITH
          </p>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() =>
                  onStart(
                    `I want to make custom ${category.toLowerCase()}.`
                  )
                }
                className="rounded-full border border-zinc-300 px-3.5 py-2 text-[10px] font-medium tracking-wide"
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* MADE AT THE LAB */}
      <section className="border-t border-zinc-200 px-5 py-14">
        <p className="text-[10px] tracking-[0.1em] text-lime-500">
          MADE AT THE LAB
        </p>

        <h2 className="mt-4 text-[34px] font-medium leading-none tracking-[-0.045em]">
          Real projects.
          <br />
          Real results.
        </h2>

        <div className="mt-8 flex aspect-[4/5] items-center justify-center rounded-[18px] bg-zinc-100">
          <span className="text-[10px] tracking-[0.1em] text-zinc-400">
            PROJECT IMAGE
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="text-[14px] font-semibold">
              CUSTOM DIE-CUT POUCH
            </p>

            <p className="mt-1 text-[11px] text-zinc-500">
              5,000 PCS / CUSTOM PRINT
            </p>
          </div>

          <button
            aria-label="View project"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300"
          >
            →
          </button>
        </div>
      </section>

      {/* PROCESS */}
      <section className="bg-zinc-50 px-5 py-14">
        <p className="text-[10px] tracking-[0.1em] text-zinc-500">
          HOW IT WORKS
        </p>

        <h2 className="mt-4 text-[34px] font-medium leading-none tracking-[-0.045em]">
          FROM INPUT
          <br />
          TO OUTPUT.
        </h2>

        <div className="mt-10 space-y-7">
          <ProcessStep
            number="01"
            title="TALK"
            description="Tell us what you want to make."
          />

          <ProcessStep
            number="02"
            title="DEVELOP"
            description="We build the specs and source it."
          />

          <ProcessStep
            number="03"
            title="SAMPLE"
            description="You review and approve."
          />

          <ProcessStep
            number="04"
            title="PRODUCE"
            description="We manufacture your project."
          />

          <ProcessStep
            number="05"
            title="DELIVER"
            description="We ship it to your door."
          />
        </div>
      </section>

      {/* LAB CAM */}
      <section className="bg-black px-5 py-14 text-white">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="h-2 w-2 rounded-full bg-lime-400" />

          <span className="text-lime-400">
            LIVE
          </span>
        </div>

        <h2 className="mt-5 text-[34px] font-medium leading-none tracking-[-0.045em]">
          SEE WHERE
          <br />
          YOUR PROJECT
          <br />
          IS MADE.
        </h2>

        <p className="mt-5 max-w-[300px] text-[14px] leading-6 text-zinc-400">
          Follow development and production directly from the lab.
        </p>

        <div className="mt-8 aspect-video rounded-[14px] border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex justify-between text-[9px]">
            <span>LAB CAM_03</span>

            <span className="text-lime-400">
              ● LIVE
            </span>
          </div>
        </div>
      </section>
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
}: {
  client: ClientData;
  setClient: React.Dispatch<React.SetStateAction<ClientData>>;
  onBack: () => void;
  onContinue: (client: ClientData) => void;
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
      const { data, error: saveError } = await supabase
        .from("clients")
        .upsert(
          {
            phone: cleanPhone,
            email: cleanEmail || null,
            marketing_sms_opt_in: marketingSms,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" }
        )
        .select("id, phone, email, marketing_sms_opt_in")
        .single();

      if (saveError) throw saveError;

      const savedClient: ClientData = {
        id: data.id,
        phone: data.phone,
        email: data.email ?? "",
        marketingSms: Boolean(data.marketing_sms_opt_in),
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
      setError("I couldn't save your contact details yet. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="flex items-center justify-between px-5 py-5">
        <button onClick={onBack} className="flex h-10 w-10 items-center justify-start text-xl" aria-label="Back">
          ←
        </button>
        <Logo />
        <div className="h-10 w-10" />
      </header>

      <section className="mx-auto max-w-[500px] px-5 pb-12 pt-10">
        <BabaStatus />
        <p className="mt-10 text-[9px] font-medium tracking-[0.12em] text-zinc-400">START YOUR PROJECT</p>

        <h1 className="mt-4 text-[42px] font-medium leading-[0.94] tracking-[-0.055em]">
          WHERE SHOULD<br />WE SEND YOUR<br /><span className="text-lime-400">UPDATES?</span>
        </h1>

        <p className="mt-5 max-w-[330px] text-[13px] leading-5 text-zinc-500">
          We'll use your mobile number for project communication. Email is optional.
        </p>

        <div className="mt-9">
          <label className="text-[9px] font-medium tracking-[0.1em] text-zinc-400">MOBILE NUMBER</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel"
            placeholder="+1 917 555 0123"
            className="mt-2 h-14 w-full rounded-[14px] border border-zinc-300 px-4 text-[15px] outline-none focus:border-black" />
        </div>

        <div className="mt-5">
          <label className="text-[9px] font-medium tracking-[0.1em] text-zinc-400">
            EMAIL <span className="text-zinc-300">OPTIONAL</span>
          </label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoComplete="email"
            placeholder="you@brand.com"
            className="mt-2 h-14 w-full rounded-[14px] border border-zinc-300 px-4 text-[15px] outline-none focus:border-black" />
        </div>

        <label className="mt-6 flex items-start gap-3">
          <input type="checkbox" checked={marketingSms} onChange={(e) => setMarketingSms(e.target.checked)}
            className="mt-1 h-4 w-4 accent-black" />
          <span className="text-[11px] leading-4 text-zinc-500">
            Send me occasional DYE CUT LAB news, drops and promotional texts. Consent is optional and separate from project updates.
          </span>
        </label>

        {error && <p className="mt-5 text-[11px] text-red-500">{error}</p>}

        <button onClick={continueProject} disabled={saving}
          className="mt-8 flex w-full items-center justify-between rounded-full bg-black px-5 py-4 text-[11px] font-medium tracking-[0.08em] text-white disabled:opacity-50">
          {saving ? "SAVING..." : "CONTINUE TO BABA"} <span className="text-lime-400">→</span>
        </button>

        <p className="mt-5 text-[9px] leading-4 text-zinc-400">
          Project messages are transactional. Marketing texts are only enabled when you check the optional box above.
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
    const value = question.toLowerCase();

    if (value.includes("artwork") || value.includes("design")) return "artwork";
    if (value.includes("flavor") || value.includes("flavour") || value.includes("strain")) return "flavors";
    if (value.includes("unit") || value.includes("quantity") || value.includes("pieces")) return "quantity";
    if (value.includes("reference") || value.includes("visual") || value.includes("image")) return "reference";
    if (value.includes("packaging") || value.includes("pouch") || value.includes("box") || value.includes("jar")) return "product";

    if (!current.productType) return "product";
    if (!current.units) return "quantity";
    if (!current.flavorCount) return "flavors";
    if (!current.artworkStatus) return "artwork";
    if (!referenceDecided) return "reference";

    return "general";
  }

  function calculateProduction(
    units: number | null,
    flavorCount: number
  ) {
    if (!units || units <= 0) {
      return {
        rawPieces: 0,
        total: 0,
        perFlavor: 0,
      };
    }

    const rawPieces = Math.ceil(units * 128);

    if (flavorCount > 0) {
      const adjusted = adjustQuantityForFlavors(rawPieces, flavorCount);
      return {
        rawPieces,
        total: adjusted.total,
        perFlavor: adjusted.perFlavor,
      };
    }

    return {
      rawPieces,
      total: roundOrderQuantity(rawPieces),
      perFlavor: 0,
    };
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
        `FLAVORS · ${current.flavorCount} · ${current.flavorSplit.toLocaleString()} PCS EACH`
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
      status: next.status || "development",
      artwork_status: next.artworkStatus || null,
      size: next.size || null,
      closure: next.closure || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (next.id) {
        const { error } = await supabase
          .from("projects")
          .update(payload)
          .eq("id", next.id);

        if (error) throw error;

        setProject(next);
        return next;
      }

      const { updated_at, ...insertPayload } = payload;

      const { data, error } = await supabase
        .from("projects")
        .insert(insertPayload)
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
      return created;
    } catch (error) {
      console.error("PROJECT SAVE ERROR:", error);
      setProjectError(
        "I understood the project, but I couldn't save it yet. Please try again."
      );
      return null;
    } finally {
      setSaving(false);
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
        throw new Error(data?.error || "BABA could not process that message.");
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
            text:
              "Perfect. I have enough to start your project brief. We can keep filling in dimensions, closure and production details as we develop it.",
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
          : "BABA couldn't process that message."
      );
    } finally {
      setThinking(false);
    }
  }

  useEffect(() => {
    if (initializedRef.current || !project.request) return;
    initializedRef.current = true;

    callBaba(project.request, project, false);
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
          rawPieces: Math.ceil(project.units * 128),
          orderPieces: project.quantity,
        }
      : null;

  return (
    <main className="flex min-h-screen flex-col bg-white text-black">
      <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/95 px-5 pb-4 pt-5 backdrop-blur">
        <div className="grid grid-cols-3 items-center">
          <button
            onClick={onBack}
            className="justify-self-start text-xl"
            aria-label="Back"
          >
            ←
          </button>

          <div className="text-center">
            <p className="text-[11px] font-semibold tracking-[0.08em]">
              {project.projectNumber ?? "NEW PROJECT"}
            </p>
            <div className="mt-1 flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
              <span className="text-[9px] text-zinc-500">BABA</span>
              <span className="text-[9px] text-lime-500">
                {thinking ? "THINKING" : "ONLINE"}
              </span>
            </div>
          </div>

          <span className="justify-self-end text-xl">···</span>
        </div>
      </header>

      <section className="flex-1 px-5 pb-52 pt-8">
        {messages.map((message) =>
          message.role === "customer" ? (
            <CustomerAnswer key={message.id}>{message.text}</CustomerAnswer>
          ) : (
            <BabaMessage key={message.id}>
              {message.kind === "summary" ? (
                <div>
                  <p className="mb-3">Got it. I picked up:</p>

                  <div className="space-y-1 whitespace-pre-line text-[12px] text-zinc-500">
                    {message.text}
                  </div>

                  {unitConversion && (
                    <p className="mt-3 text-[12px] text-lime-500">
                      {unitConversion.units.toLocaleString()} UNITS × 128 PCS ={" "}
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
            <SystemLine text="BABA IS READING YOUR PROJECT..." />
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
          <div className="ml-10 mt-4 flex flex-wrap gap-2">
            {[1, 5, 10, 20, 50].map((units) => (
              <button
                key={units}
                disabled={saving}
                onClick={() => sendQuickAnswer(`${units} units`)}
                className="rounded-full border border-zinc-300 px-4 py-3 text-[10px] font-medium tracking-[0.05em] disabled:opacity-40"
              >
                {units} UNITS
              </button>
            ))}
          </div>
        )}

        {!thinking && step === "ai" && questionKind === "flavors" && (
          <div className="ml-10 mt-4 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 8].map((count) => (
              <button
                key={count}
                disabled={saving}
                onClick={() =>
                  sendQuickAnswer(
                    count === 1 ? "One flavor" : `${count} flavors`
                  )
                }
                className="rounded-full border border-zinc-300 px-5 py-3 text-[10px] font-medium tracking-[0.06em] disabled:opacity-40"
              >
                {count === 1 ? "ONE FLAVOR" : `${count} FLAVORS`}
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
          <div className="ml-10 mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              className="rounded-full border border-zinc-300 px-5 py-3 text-[10px] font-medium tracking-[0.06em]"
            >
              + ADD REFERENCE
            </button>

            <button
              onClick={skipReference}
              className="rounded-full border border-zinc-300 px-5 py-3 text-[10px] font-medium tracking-[0.06em]"
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
            <div className="w-[68%] overflow-hidden rounded-[18px] rounded-br-[5px] bg-zinc-100">
              <img
                src={referenceImage}
                alt="Customer reference"
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[9px] tracking-wide text-zinc-500">
                  REFERENCE
                </span>
                <span className="text-[9px] text-lime-500">✓ UPLOADED</span>
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
          <div className="ml-10 mt-5 rounded-[18px] border border-zinc-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium tracking-[0.1em] text-lime-500">
                PROJECT CREATED
              </span>
              <span className="h-2 w-2 rounded-full bg-lime-400" />
            </div>

            <p className="mt-4 text-[26px] font-medium tracking-[-0.04em]">
              {project.projectNumber}
            </p>

            <p className="mt-1 text-[12px] text-zinc-500">
              {(project.productType || "CUSTOM PACKAGING").toUpperCase()}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-y-4 border-t border-zinc-100 pt-4">
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
                label="FLAVORS"
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
              className="mt-6 w-full rounded-full bg-black py-4 text-[11px] font-medium tracking-[0.08em] text-white"
            >
              VIEW PROJECT <span className="ml-3 text-lime-400">→</span>
            </button>
          </div>
        )}

        <div className="ml-10 mt-6 text-[9px] tracking-[0.08em] text-zinc-400">
          BRIEF {detailCount}/5
        </div>

        <div ref={bottomRef} />
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-100 bg-white px-4 pb-7 pt-3">
        <div className="mx-auto flex max-w-[500px] items-center gap-2">
          <button
            onClick={() => fileInput.current?.click()}
            aria-label="Attach file"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-lg"
          >
            +
          </button>

          <div className="flex flex-1 items-center rounded-full border border-zinc-300 px-4">
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
                  ? "BABA is thinking..."
                  : nextQuestion
                  ? "Message BABA..."
                  : "Tell BABA more..."
              }
              disabled={step === "complete" || thinking || saving}
              className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-zinc-400 disabled:opacity-50"
            />

            <button
              onClick={sendTypedMessage}
              disabled={!input.trim() || thinking || saving || step === "complete"}
              aria-label="Send message"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-lime-400 disabled:opacity-30"
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
      <div className="max-w-[82%] rounded-[18px] rounded-br-[5px] bg-black px-4 py-3 text-white">
        <p className="text-[14px] leading-5">{children}</p>
      </div>
    </div>
  );
}

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
    <div className="ml-10 mt-4 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          disabled={disabled}
          onClick={() => onSelect(option)}
          className="rounded-full border border-zinc-300 px-4 py-3 text-[10px] font-medium tracking-[0.05em] disabled:opacity-40"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/* =========================================================
   PROJECT DASHBOARD
========================================================= */

function Project({
  project,
  referenceImage,
  onBack,
  onContinue,
}: {
  project: ProjectData;
  referenceImage: string | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const knownDetails = [
    project.productType,
    project.quantity,
    project.useType,
    project.artworkStatus,
    project.size,
    project.closure,
  ].filter(Boolean).length;

  const missingDetails = [
    !project.size && "size",
    !project.closure && "closure",
    !referenceImage && "reference",
  ].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-white pb-24 text-black">
      <header className="flex items-center justify-between px-5 py-5">
        <button onClick={onBack} className="flex h-10 w-10 items-center justify-start text-xl" aria-label="Back">
          ←
        </button>
        <span className="text-xl">···</span>
      </header>

      <section className="px-5 pt-3">
        <p className="text-[9px] font-medium tracking-[0.12em] text-zinc-400">PROJECT</p>
        <h1 className="mt-2 text-[38px] font-medium leading-none tracking-[-0.055em]">
          {project.projectNumber ?? "PROJECT"}
        </h1>
        <p className="mt-2 text-[13px] text-zinc-500">
          {project.productType || "Custom Packaging Project"}
        </p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-[9px] font-medium tracking-[0.05em]">
          <span className="h-2 w-2 rounded-full bg-lime-400" />
          DEVELOPMENT
        </div>

        <div className="mt-7 overflow-hidden rounded-[18px] bg-zinc-100">
          {referenceImage ? (
            <img src={referenceImage} alt="Project reference" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center">
              <span className="text-[9px] tracking-[0.1em] text-zinc-400">PROJECT REFERENCE</span>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-[18px] bg-black p-5 text-white">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lime-400" />
            <p className="text-[9px] font-medium tracking-[0.12em] text-lime-400">NEXT ACTION</p>
          </div>

          <h2 className="mt-4 text-[22px] font-medium leading-tight tracking-[-0.035em]">
            COMPLETE PROJECT
            <br />
            DETAILS
          </h2>

          <p className="mt-3 max-w-[290px] text-[12px] leading-5 text-zinc-400">
            {missingDetails > 0
              ? `BABA needs ${missingDetails} more ${missingDetails === 1 ? "detail" : "details"} before we can prepare your quote.`
              : "Your core project details are ready for quote preparation."}
          </p>

          <button
            onClick={onContinue}
            className="mt-5 flex w-full items-center justify-between rounded-full bg-white px-5 py-4 text-[10px] font-medium tracking-[0.06em] text-black"
          >
            CONTINUE WITH BABA
            <span>→</span>
          </button>
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-medium tracking-[0.12em] text-zinc-400">PROJECT PROGRESS</p>
            <p className="text-[9px] text-zinc-400">1 OF 5</p>
          </div>

          <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full w-[20%] bg-lime-400" />
          </div>

          <div className="mt-6">
            <CompactProjectStep number="01" title="DEVELOP" status="IN PROGRESS" active />
            <CompactProjectStep number="02" title="QUOTE" status="PENDING" />
            <CompactProjectStep number="03" title="SAMPLE" status="PENDING" />
            <CompactProjectStep number="04" title="PRODUCE" status="PENDING" />
            <CompactProjectStep number="05" title="DELIVER" status="PENDING" />
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200">
          <ProjectLink title="DETAILS" value={String(knownDetails)} />
          <ProjectLink title="FILES" value={referenceImage ? "1" : "0"} />
          <ProjectLink title="MESSAGES" />
          <ProjectLink title="QUOTE" value="PENDING" />
          <ProjectLink title="ACTIVITY" />
        </div>

        <div className="mt-12">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-medium tracking-[0.12em] text-zinc-400">LAB CAM</p>
              <p className="mt-1 text-[11px]">CAM_03 / GUANGDONG, CN</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-lime-400" />
              <span className="text-[9px] font-medium text-lime-500">LIVE</span>
            </div>
          </div>

          <div className="relative mt-4 aspect-video overflow-hidden rounded-[16px] bg-black text-white">
            <div className="absolute left-4 top-4 text-[8px] tracking-[0.1em] text-zinc-500">DCL_CAM03</div>
            <div className="absolute right-4 top-4 text-[8px] text-lime-400">● REC</div>
            <div className="flex h-full items-center justify-center">
              <span className="text-[9px] tracking-[0.12em] text-zinc-700">FACTORY FEED</span>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex justify-between text-[8px] text-zinc-600">
              <span>GUANGDONG / CN</span>
              <span>CAM_03</span>
            </div>
          </div>

          <button className="mt-4 flex w-full items-center justify-between rounded-full border border-zinc-300 px-5 py-4 text-[10px] font-medium tracking-[0.06em]">
            CHECK THE LAB
            <span>→</span>
          </button>
        </div>

        <div className="mt-12 border-t border-zinc-200 py-8">
          <div className="flex items-center gap-3">
            <BabaAvatar />
            <div>
              <p className="text-[11px] font-medium">BABA</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
                <span className="text-[9px] text-zinc-400">YOUR PRODUCTION ASSISTANT</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* =========================================================
   SHARED COMPONENTS
========================================================= */

function Logo() {
  return (
    <div className="text-[20px] font-black leading-[0.8] tracking-[-0.06em]">
      DYE CUT
      <br />
      LAB
    </div>
  );
}

function BabaStatus() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-[10px]">
      <span className="h-2 w-2 rounded-full bg-lime-400" />

      <span>BABA</span>

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
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-black">
      <div className="flex gap-[3px]">
        <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
        <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
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
    <div className="mt-6 flex items-end gap-2">
      <BabaAvatar />

      <div className="max-w-[82%] rounded-[18px] rounded-bl-[5px] bg-zinc-100 px-4 py-3 text-[14px] leading-5">
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
    <div className="mt-2 flex items-center gap-2 text-[9px] tracking-[0.08em] text-zinc-500">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" />
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
      <p className="text-[8px] tracking-[0.1em] text-zinc-400">
        {label}
      </p>

      <p
        className={`mt-1 text-[10px] font-medium ${
          active
            ? "text-lime-500"
            : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ProcessStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid grid-cols-[38px_1fr] border-t border-zinc-200 pt-5">
      <span className="text-[10px] text-zinc-400">
        {number}
      </span>

      <div>
        <h3 className="text-[13px] font-semibold">
          {title}
        </h3>

        <p className="mt-1 text-[13px] text-zinc-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function CompactProjectStep({
  number,
  title,
  status,
  active = false,
}: {
  number: string;
  title: string;
  status: string;
  active?: boolean;
}) {
  return (
    <div className="grid grid-cols-[32px_1fr_auto] items-center border-b border-zinc-100 py-4">
      <span className="text-[9px] text-zinc-400">
        {number}
      </span>

      <div className="flex items-center gap-3">
        <p className="text-[11px] font-medium">
          {title}
        </p>

        <span
          className={`text-[8px] ${
            active
              ? "text-lime-500"
              : "text-zinc-400"
          }`}
        >
          {status}
        </span>
      </div>

      <div
        className={`h-3 w-3 rounded-full ${
          active
            ? "bg-lime-400"
            : "border border-zinc-300"
        }`}
      />
    </div>
  );
}

function ProjectLink({
  title,
  value,
}: {
  title: string;
  value?: string;
}) {
  return (
    <button className="flex w-full items-center justify-between border-b border-zinc-200 py-5">
      <span className="text-[12px] font-medium">
        {title}
      </span>

      <div className="flex items-center gap-3">
        {value && (
          <span className="text-[9px] text-zinc-400">
            {value}
          </span>
        )}

        <span>›</span>
      </div>
    </button>
  );
}