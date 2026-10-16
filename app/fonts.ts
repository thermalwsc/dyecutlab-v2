import { Poppins } from "next/font/google";

/* Heavy geometric sans for the bold, consumer-brand look. Used on the landing
   page, the project page and the DICI chat at /app. */
export const brandFont = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});
