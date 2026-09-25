import { Poppins } from "next/font/google";

/* Heavy geometric sans for the bold, consumer-brand look. Applied per
   page (/ and /start) so the DICI app at /app keeps Geist. */
export const brandFont = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});
