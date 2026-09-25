export type Country = {
  name: string;
  code: string; // ISO 2-letter
  dial: string; // calling code e.g. "+63"
  flag: string; // emoji flag
  placeholder: string;
};

export const COUNTRIES: Country[] = [
  { name: "Philippines", code: "PH", dial: "+63", flag: "🇵🇭", placeholder: "917 555 0123" },
  { name: "United States", code: "US", dial: "+1", flag: "🇺🇸", placeholder: "917 555 0123" },
  { name: "Canada", code: "CA", dial: "+1", flag: "🇨🇦", placeholder: "416 555 0123" },
  { name: "United Kingdom", code: "GB", dial: "+44", flag: "🇬🇧", placeholder: "7911 123456" },
  { name: "Australia", code: "AU", dial: "+61", flag: "🇦🇺", placeholder: "412 345 678" },
  { name: "Japan", code: "JP", dial: "+81", flag: "🇯🇵", placeholder: "90 1234 5678" },
  { name: "Singapore", code: "SG", dial: "+65", flag: "🇸🇬", placeholder: "8123 4567" },
  { name: "South Korea", code: "KR", dial: "+82", flag: "🇰🇷", placeholder: "10 1234 5678" },
  { name: "Germany", code: "DE", dial: "+49", flag: "🇩🇪", placeholder: "151 23456789" },
  { name: "France", code: "FR", dial: "+33", flag: "🇫🇷", placeholder: "6 12 34 56 78" },
  { name: "Italy", code: "IT", dial: "+39", flag: "🇮🇹", placeholder: "312 345 6789" },
  { name: "Spain", code: "ES", dial: "+34", flag: "🇪🇸", placeholder: "612 345 678" },
  { name: "Netherlands", code: "NL", dial: "+31", flag: "🇳🇱", placeholder: "6 12345678" },
  { name: "Switzerland", code: "CH", dial: "+41", flag: "🇨🇭", placeholder: "78 123 45 67" },
  { name: "Sweden", code: "SE", dial: "+46", flag: "🇸🇪", placeholder: "70 123 45 67" },
  { name: "New Zealand", code: "NZ", dial: "+64", flag: "🇳🇿", placeholder: "21 123 4567" },
  { name: "Hong Kong", code: "HK", dial: "+852", flag: "🇭🇰", placeholder: "9123 4567" },
  { name: "Taiwan", code: "TW", dial: "+886", flag: "🇹🇼", placeholder: "912 345 678" },
  { name: "United Arab Emirates", code: "AE", dial: "+971", flag: "🇦🇪", placeholder: "50 123 4567" },
  { name: "Saudi Arabia", code: "SA", dial: "+966", flag: "🇸🇦", placeholder: "50 123 4567" },
  { name: "India", code: "IN", dial: "+91", flag: "🇮🇳", placeholder: "98765 43210" },
  { name: "Indonesia", code: "ID", dial: "+62", flag: "🇮🇩", placeholder: "812 3456 7890" },
  { name: "Malaysia", code: "MY", dial: "+60", flag: "🇲🇾", placeholder: "12 345 6789" },
  { name: "Thailand", code: "TH", dial: "+66", flag: "🇹🇭", placeholder: "81 234 5678" },
  { name: "Vietnam", code: "VN", dial: "+84", flag: "🇻🇳", placeholder: "91 234 5678" },
  { name: "Brazil", code: "BR", dial: "+55", flag: "🇧🇷", placeholder: "11 91234 5678" },
  { name: "Mexico", code: "MX", dial: "+52", flag: "🇲🇽", placeholder: "55 1234 5678" },
  { name: "South Africa", code: "ZA", dial: "+27", flag: "🇿🇦", placeholder: "71 123 4567" },
  { name: "Ireland", code: "IE", dial: "+353", flag: "🇮🇪", placeholder: "85 123 4567" },
  { name: "Norway", code: "NO", dial: "+47", flag: "🇳🇴", placeholder: "412 34 567" },
  { name: "Denmark", code: "DK", dial: "+45", flag: "🇩🇰", placeholder: "20 12 34 56" },
  { name: "Finland", code: "FI", dial: "+358", flag: "🇫🇮", placeholder: "41 2345678" },
  { name: "Belgium", code: "BE", dial: "+32", flag: "🇧🇪", placeholder: "470 12 34 56" },
  { name: "Austria", code: "AT", dial: "+43", flag: "🇦🇹", placeholder: "660 1234567" },
  { name: "Portugal", code: "PT", dial: "+351", flag: "🇵🇹", placeholder: "912 345 678" },
];

/* The team is US-based, so every phone picker starts on +1. */
export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((country) => country.code === "US") ?? COUNTRIES[0];

/* Combine the selected country dial code with the locally-entered number
   into the full international value the existing backend expects
   (e.g. "+63" + "917 555 0123" -> "+639175550123"). Avoids duplicating
   the dial code when the user pastes a full international number. */
export function buildFullPhone(dial: string, local: string) {
  const trimmed = local.trim();
  if (!trimmed) return "";
  // User pasted a full international number — keep it as-is.
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  const dialDigits = dial.replace("+", "");
  // User included the dial code without "+" (e.g. "63917...").
  if (digits.startsWith(dialDigits)) return `+${digits}`;
  // Strip domestic trunk zero ("0917..." -> "917...") before prefixing.
  const withoutTrunk = digits.replace(/^0+/, "");
  return `${dial} ${withoutTrunk}`;
}
